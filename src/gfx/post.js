'use strict';
// GPU post-processing on top of the Canvas 2D scene renderer.
// The world is still painted with Canvas 2D (pixel-art sprites are canvases); this module uploads that frame as a
// texture once per frame and composites it in WebGL with:
//   - a colored light map (batched soft light quads, additive, rendered at 1/4 or 1/2 resolution)
//   - selective bloom: only queued emitters (muzzle flashes, tracers, XP, neon, rare loot) feed the blur chain
//   - light color grading, a faint top haze for depth, a soft vignette and a hurt chromatic split.
// Emitters/lights are queued in world space during the world pass. Without WebGL (or on LOW lighting) the same
// queue is drawn with cached Canvas 2D glow sprites instead, so nothing depends on the GPU path.
(function (RS) {
  const S = RS.Sprites;
  const MAXQ = 6000, FPV = 9; // max quads per batch, floats per vertex

  const VS_FULL = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  const VS_EM = 'attribute vec2 p;attribute vec2 q;attribute vec4 c;attribute float s;uniform vec2 res;varying vec2 vq;varying vec4 vc;varying float vs;' +
    'void main(){vq=q;vc=c;vs=s;vec2 n=p/res*2.-1.;gl_Position=vec4(n.x,-n.y,0.,1.);}';
  // soft gaussian disc (s<=0) or ring with relative thickness s
  const FS_EM = 'precision mediump float;varying vec2 vq;varying vec4 vc;varying float vs;' +
    'void main(){float d=length(vq);float a;' +
    'if(vs<=0.){a=exp(-d*d*4.)*smoothstep(1.,.8,d);}else{float t=(d-(1.-vs))/vs;a=exp(-t*t*3.)*step(d,1.);}' +
    'gl_FragColor=vec4(vc.rgb*vc.a*a,1.);}';
  const FS_COPY = 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}';
  // 9-tap gaussian folded into 5 bilinear fetches
  const FS_BLUR = 'precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 d;' +
    'void main(){vec3 c=texture2D(t,v).rgb*.227;' +
    'c+=(texture2D(t,v+d*1.385).rgb+texture2D(t,v-d*1.385).rgb)*.316;' +
    'c+=(texture2D(t,v+d*3.231).rgb+texture2D(t,v-d*3.231).rgb)*.070;gl_FragColor=vec4(c,1.);}';
  const FS_COMP = 'precision mediump float;varying vec2 v;' +
    'uniform sampler2D sc,li,b1,b2,em;uniform float amb,lk,bk,hurt,grade,two,trip,tt,crt,sp;uniform vec3 tc,at;' +
    'void main(){vec2 s=vec2(v.x,1.-v.y);vec3 c;' +
    // trip: slow heat-haze wobble + a chromatic split that grows towards the edges
    's+=vec2(sin(v.y*13.+tt*1.7),cos(v.x*9.+tt*1.3))*.0026*trip;float ab=hurt*.0035+trip*.006;' +
    'if(ab>.0001){vec2 o=(v-.5)*vec2(1.,-1.)*ab;c=vec3(texture2D(sc,s+o).r,texture2D(sc,s).g,texture2D(sc,s-o).b);}else c=texture2D(sc,s).rgb;' +
    'vec3 L=texture2D(li,v).rgb;L=L/(1.+L);c*=amb*at+L*lk;' +
    'vec3 b=texture2D(b1,v).rgb*.85+texture2D(em,v).rgb*.22;if(two>.5)b+=texture2D(b2,v).rgb*.75;' +
    'b*=bk;b=b/(1.+b*.9);c+=b;' +
    'float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,1.+.12*grade);c=(c-.5)*(1.+.05*grade)+.5;' +
    'c=mix(c,c*vec3(.95,.98,1.06),(1.-smoothstep(.0,.5,l))*.35*grade);' + // cool shadows, keeps the brights warm
    'c=mix(c,vec3(.82,.86,.9),.07*v.y*v.y*grade);' + // atmospheric haze towards the far (top) edge
    'vec2 dd=v-.5;c*=1.-dot(dd,dd)*.2*grade;' +
    // trip grade: richer colour, theme-tinted shadows and edges
    'float l2=dot(c,vec3(.299,.587,.114));c=mix(vec3(l2),c,1.+.35*trip);c=mix(c,c*(.7+tc*.45),.32*trip*(1.-smoothstep(.15,.7,l2)));c+=tc*dot(dd,dd)*.6*trip;' +
    // CRT (settings slider): soft scanlines every sp device px, a faint RGB aperture mask, a darker rim. Bright pixels
    // bleed over the dark line (like a real tube) so neon stays bright; the HUD canvas sits above and stays clean.
    'if(crt>.001){float sl=.5+.5*cos(gl_FragCoord.y*6.2832/sp);float lm=max(c.r,max(c.g,c.b));c*=1.-crt*.3*sl*(1.-.6*smoothstep(.55,1.,lm));' +
    'float m=mod(floor(gl_FragCoord.x),3.);vec3 mk=m<.5?vec3(1.,.86,.86):m<1.5?vec3(.86,1.,.86):vec3(.86,.86,1.);c*=mix(vec3(1.),mk,crt*.45);' +
    'c*=1.+crt*.12;c*=1.-crt*dot(dd,dd)*.45;}' +
    'gl_FragColor=vec4(c,1.);}';

  const colCache = new Map();
  function rgb(hex) {
    let c = colCache.get(hex);
    if (!c) {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h.slice(0, 6), 16);
      c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
      colCache.set(hex, c);
    }
    return c;
  }

  // a batch of quads in screen px (world -> screen done on push)
  class Batch {
    constructor() { this.f = new Float32Array(MAXQ * 4 * FPV); this.n = 0; }
    clear() { this.n = 0; }
    quad(cx, cy, ax, ay, bx, by, col, a, shape) {
      if (this.n >= MAXQ) return;
      const c = rgb(col), f = this.f; let o = this.n * 4 * FPV;
      // corners: c - a - b, c + a - b, c + a + b, c - a + b
      const sx = [-1, 1, 1, -1], sy = [-1, -1, 1, 1];
      for (let i = 0; i < 4; i++) {
        f[o] = cx + ax * sx[i] + bx * sy[i]; f[o + 1] = cy + ay * sx[i] + by * sy[i];
        f[o + 2] = sx[i]; f[o + 3] = sy[i];
        f[o + 4] = c[0]; f[o + 5] = c[1]; f[o + 6] = c[2]; f[o + 7] = a; f[o + 8] = shape;
        o += FPV;
      }
      this.n++;
    }
  }

  const Post = {
    gl: null, canvas: null, on: false, failed: false, W: 0, H: 0,
    glows: new Batch(), lights: new Batch(),
    // 2D fallback queue (world space)
    fb: [], fbN: 0,
    view: { cx: 0, cy: 0, z: 1, W: 0, H: 0 },
    hurt: 0, lightK: 0.85, amb: 1.0, ambTint: [1, 1, 1], // ambient level and its colour (NIGHT / STORM: dim and cool, Render.draw)
    trip: 0, tt: 0, tripCol: '#ff6ad5', // hallucination warp (RS.Trip feeds these)
    stats: { glows: 0, lights: 0 },

    // ---------------------------------------------------------------- settings
    q() {
      const s = RS.Save.s;
      return { lighting: s.lighting | 0, bloom: s.bloom === undefined ? 0.8 : s.bloom };
    },
    get active() { return this.on && !this.failed && this.q().lighting > 0; },

    init(gameCanvas) {
      this.src = gameCanvas;
      const c = document.createElement('canvas');
      c.id = 'gl';
      gameCanvas.parentNode.insertBefore(c, gameCanvas.nextSibling);
      this.canvas = c;
      let gl = null;
      try { gl = c.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
      if (!gl) { this.failed = true; c.remove(); this.canvas = null; return false; }
      this.gl = gl;
      c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.failed = true; this.show(false); });
      c.addEventListener('webglcontextrestored', () => { this.failed = false; this.setup(); this.resize(this.W, this.H); });
      this.setup();
      this.on = true;
      return true;
    },
    setup() {
      const gl = this.gl;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = (vs, fs, attrs) => {
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
        return { p, u };
      };
      try {
        this.pEm = prog(VS_EM, FS_EM, ['p', 'q', 'c', 's']);
        this.pCopy = prog(VS_FULL, FS_COPY, ['a']);
        this.pBlur = prog(VS_FULL, FS_BLUR, ['a']);
        this.pComp = prog(VS_FULL, FS_COMP, ['a']);
      } catch (e) { console.warn('Post: shader setup failed, using Canvas 2D effects', e); this.failed = true; return; }
      this.full = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.full);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.glows.f.byteLength, gl.DYNAMIC_DRAW);
      const idx = new Uint16Array(MAXQ * 6);
      for (let i = 0; i < MAXQ; i++) { const o = i * 4; idx.set([o, o + 1, o + 2, o, o + 2, o + 3], i * 6); }
      this.ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      this.sceneTex = this.tex(1, 1);
      this.sceneW = 0; this.sceneH = 0;
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    },
    tex(w, h) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return t;
    },
    fbo(w, h) {
      const gl = this.gl, t = this.tex(w, h), f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { t, f, w, h };
    },
    resize(W, H) {
      this.W = W; this.H = H;
      if (!this.gl || this.failed) return;
      const gl = this.gl;
      this.canvas.width = W; this.canvas.height = H;
      for (const k of ['fLight', 'fEm', 'fB1', 'fT1', 'fB2', 'fT2']) if (this[k]) { gl.deleteTexture(this[k].t); gl.deleteFramebuffer(this[k].f); }
      this.lightRes = 0;
      this.fEm = this.fbo(Math.ceil(W / 2), Math.ceil(H / 2));
      this.fB1 = this.fbo(Math.ceil(W / 4), Math.ceil(H / 4)); this.fT1 = this.fbo(Math.ceil(W / 4), Math.ceil(H / 4));
      this.fB2 = this.fbo(Math.ceil(W / 8), Math.ceil(H / 8)); this.fT2 = this.fbo(Math.ceil(W / 8), Math.ceil(H / 8));
      this.fLight = null;
    },
    ensureLight(k) {
      if (this.fLight && this.lightRes === k) return;
      const gl = this.gl;
      if (this.fLight) { gl.deleteTexture(this.fLight.t); gl.deleteFramebuffer(this.fLight.f); }
      this.lightRes = k;
      this.fLight = this.fbo(Math.ceil(this.W * k), Math.ceil(this.H * k));
    },
    // the GL canvas replaces the 2D canvas on screen while active
    show(v) {
      if (!this.canvas) return;
      if (this.shown === v) return;
      this.shown = v;
      this.canvas.style.display = v ? 'block' : 'none';
      this.src.style.visibility = v ? 'hidden' : 'visible';
    },

    // ---------------------------------------------------------------- queue (world space)
    begin(cx, cy, z, W, H) {
      const V = this.view; V.cx = cx; V.cy = cy; V.z = z; V.W = W; V.H = H;
      this.glows.clear(); this.lights.clear(); this.fbN = 0; this.minorN = 0;
    },
    // numerous small emitters share a per-frame budget so a late-game screen stays readable
    minor() { return this.active && this.minorN++ < 140; },
    // soft glow / bloom source
    glow(x, y, r, col, a) {
      const V = this.view, R = r * V.z;
      const sx = (x - V.cx) * V.z + V.W / 2, sy = (y - V.cy) * V.z + V.H / 2;
      if (sx < -R || sy < -R || sx > V.W + R || sy > V.H + R) return;
      if (this.active) this.glows.quad(sx, sy, R, 0, 0, R, col, a, 0);
      else this.fbPush(0, x, y, r, col, a);
    },
    // oriented elongated glow (tracers, lightning, light streaks)
    streak(x, y, ang, len, w, col, a) {
      const V = this.view, z = V.z;
      const sx = (x - V.cx) * z + V.W / 2, sy = (y - V.cy) * z + V.H / 2, L = len * z / 2, Wd = w * z / 2;
      if (sx < -L || sy < -L || sx > V.W + L || sy > V.H + L) return;
      const c = Math.cos(ang), s = Math.sin(ang);
      if (this.active) this.glows.quad(sx, sy, c * L, s * L, -s * Wd, c * Wd, col, a, 0);
      else this.fbPush(1, x, y, len, col, a, ang, w);
    },
    ring(x, y, r, th, col, a) {
      const V = this.view, R = r * V.z;
      const sx = (x - V.cx) * V.z + V.W / 2, sy = (y - V.cy) * V.z + V.H / 2;
      if (sx < -R || sy < -R || sx > V.W + R || sy > V.H + R) return;
      if (this.active) this.glows.quad(sx, sy, R, 0, 0, R, col, a, Math.max(0.02, Math.min(0.9, th / r)));
    },
    // colored light (GPU path only; the 2D fallback keeps the old lamp glows)
    light(x, y, r, col, a) {
      if (!this.active) return;
      const V = this.view, R = r * V.z;
      const sx = (x - V.cx) * V.z + V.W / 2, sy = (y - V.cy) * V.z + V.H / 2;
      if (sx < -R || sy < -R || sx > V.W + R || sy > V.H + R) return;
      this.lights.quad(sx, sy, R, 0, 0, R, col, a, 0);
    },
    fbPush(kind, x, y, r, col, a, ang, w) {
      if (this.fbN >= 90) return;
      let o = this.fb[this.fbN];
      if (!o) o = this.fb[this.fbN] = {};
      o.k = kind; o.x = x; o.y = y; o.r = r; o.col = col; o.a = a; o.ang = ang || 0; o.w = w || 0;
      this.fbN++;
    },
    // Canvas 2D stand-in for the glow queue (camera transform must be set)
    drawFallback(ctx) {
      if (!this.fbN) return;
      const k = 0.55 * (0.5 + this.q().bloom * 0.6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      for (let i = 0; i < this.fbN; i++) {
        const o = this.fb[i];
        ctx.globalAlpha = Math.min(1, o.a * k);
        if (o.k === 0) { const r = Math.max(4, Math.round(o.r)); ctx.drawImage(S.glow(o.col, r), o.x - r, o.y - r); }
        else {
          ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.ang);
          const g = S.glow(o.col, 24); ctx.drawImage(g, -o.r / 2, -o.w, o.r, o.w * 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = false;
    },

    // ---------------------------------------------------------------- GPU frame
    drawBatch(b, prog, res) {
      const gl = this.gl;
      if (!b.n) return;
      gl.useProgram(prog.p);
      gl.uniform2f(prog.u.res, res[0], res[1]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.f.subarray(0, b.n * 4 * FPV));
      const st = FPV * 4;
      for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 8);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 16);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.drawElements(gl.TRIANGLES, b.n * 6, gl.UNSIGNED_SHORT, 0);
      for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
    },
    fullscreen(prog) {
      const gl = this.gl;
      gl.useProgram(prog.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.full);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    target(f) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f ? f.f : null);
      gl.viewport(0, 0, f ? f.w : this.W, f ? f.h : this.H);
    },
    blur(src, tmp, dst) {
      const gl = this.gl, P = this.pBlur;
      this.target(tmp); gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t);
      gl.uniform1i(P.u.t, 0); gl.uniform2f(P.u.d, 1 / src.w, 0); this.fullscreen(P);
      this.target(dst);
      gl.bindTexture(gl.TEXTURE_2D, tmp.t);
      gl.uniform2f(P.u.d, 0, 1 / tmp.h); this.fullscreen(P);
    },
    copy(src, dst) {
      const gl = this.gl;
      this.target(dst); gl.useProgram(this.pCopy.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t);
      gl.uniform1i(this.pCopy.u.t, 0); this.fullscreen(this.pCopy);
    },
    present(sceneCanvas, opts) {
      const gl = this.gl, Q = this.q(), W = this.W, H = this.H;
      const two = Q.lighting >= 2;
      this.ensureLight(two ? 0.5 : 0.25);
      this.stats.glows = this.glows.n; this.stats.lights = this.lights.n;
      // scene upload (GPU-to-GPU in Chromium/Firefox for an accelerated canvas)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (this.sceneW !== sceneCanvas.width || this.sceneH !== sceneCanvas.height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
        this.sceneW = sceneCanvas.width; this.sceneH = sceneCanvas.height;
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      // light map
      this.target(this.fLight); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawBatch(this.lights, this.pEm, [W, H]);
      // emitters -> half res
      this.target(this.fEm); gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawBatch(this.glows, this.pEm, [W, H]);
      gl.disable(gl.BLEND);
      // bloom chain: 1/4 (tight) and 1/8 (wide)
      const bk = Q.bloom * (opts && opts.bloomMul !== undefined ? opts.bloomMul : 1);
      if (bk > 0 && this.glows.n) {
        // downsample, then blur in place (fB*/ hold the intermediate pass); results end up in fT1 / fT2
        this.copy(this.fEm, this.fT1); this.blur(this.fT1, this.fB1, this.fT1);
        if (two) { this.copy(this.fT1, this.fT2); this.blur(this.fT2, this.fB2, this.fT2); }
      } else {
        for (const f of [this.fT1, this.fT2]) { this.target(f); gl.clear(gl.COLOR_BUFFER_BIT); }
      }
      // composite
      this.target(null);
      const P = this.pComp; gl.useProgram(P.p);
      const bind = (unit, t, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], unit); };
      bind(0, this.sceneTex, 'sc'); bind(1, this.fLight.t, 'li'); bind(2, this.fT1.t, 'b1'); bind(3, this.fT2.t, 'b2'); bind(4, this.fEm.t, 'em');
      gl.uniform1f(P.u.amb, opts && opts.amb !== undefined ? opts.amb : this.amb);
      const at = opts && opts.amb !== undefined ? [1, 1, 1] : this.ambTint; gl.uniform3f(P.u.at, at[0], at[1], at[2]);
      gl.uniform1f(P.u.lk, this.lightK);
      gl.uniform1f(P.u.bk, bk * 1.3);
      gl.uniform1f(P.u.hurt, RS.Save.s.reduceFlash ? this.hurt * 0.3 : this.hurt);
      gl.uniform1f(P.u.grade, opts && opts.grade !== undefined ? opts.grade : 1);
      gl.uniform1f(P.u.two, two && bk > 0 ? 1 : 0);
      const tc = rgb(this.tripCol);
      gl.uniform1f(P.u.trip, opts && opts.grade === 0 ? 0 : this.trip); gl.uniform1f(P.u.tt, this.tt % 1000); gl.uniform3f(P.u.tc, tc[0], tc[1], tc[2]);
      const crt = opts && opts.grade === 0 ? 0 : RS.U.clamp(RS.Save.s.crt === undefined ? 0.5 : RS.Save.s.crt, 0, 1);
      gl.uniform1f(P.u.crt, crt); gl.uniform1f(P.u.sp, Math.max(2, Math.round(gl.drawingBufferHeight / 270))); // ~270 lines whatever the window size
      this.fullscreen(P);
      gl.activeTexture(gl.TEXTURE0);
    },
    // test hook: block until the GPU finished the frame
  };

  RS.Post = Post;
})(window.RS);

// Graphics quality presets and knobs (stored in RS.Save.s).
(function (RS) {
  const GFX = {
    ORDER: ['low', 'medium', 'high'],
    PRESETS: {
      low: { lighting: 0, shadows: 0, particles: 0, reflections: false, bloom: 0.5 },
      medium: { lighting: 1, shadows: 1, particles: 1, reflections: true, bloom: 0.65 },
      high: { lighting: 2, shadows: 2, particles: 2, reflections: true, bloom: 0.75 },
    },
    LABELS: {
      lighting: ['OFF (CANVAS)', 'GPU · 1/4 RES', 'GPU · 1/2 RES'],
      shadows: ['BLOB', 'SOFT + AO', 'CAST + AO'],
      particles: ['LOW', 'MEDIUM', 'HIGH'],
    },
    apply(name) { const P = this.PRESETS[name]; if (!P) return; Object.assign(RS.Save.s, P); RS.Save.s.gfx = name; },
    nextPreset() { const s = RS.Save.s, i = this.ORDER.indexOf(s.gfx); this.apply(this.ORDER[(i + 1) % this.ORDER.length]); },
    cycle(k) { const s = RS.Save.s; s[k] = ((s[k] | 0) + 1) % 3; s.gfx = 'custom'; },
    particleCap() { return [450, 1100, 2200][RS.Save.s.particles | 0] || 1100; },
    particleMul() { return [0.45, 0.75, 1][RS.Save.s.particles | 0] || 0.75; },
    shadows() { return RS.Save.s.shadows | 0; },
    // automatic quality (Settings no longer exposes graphics): when a run averages slower than ~52 FPS for
    // 4 seconds, step one preset down and remember it. Paused / hidden frames never count.
    ema: 16.7, slowT: 0,
    autoTick(dt) {
      if (document.hidden || dt <= 0 || dt >= 0.05) return;
      this.ema = this.ema * 0.95 + dt * 1000 * 0.05;
      this.slowT = this.ema > 19.2 ? this.slowT + dt : 0;
      const s = RS.Save.s; let i = this.ORDER.indexOf(s.gfx); if (i < 0) i = 2; // old 'custom' saves count as high
      if (this.slowT > 4 && i > 0) {
        this.apply(this.ORDER[i - 1]); RS.Save.save();
        this.slowT = 0; this.ema = 16.7;
      }
    },
  };
  RS.GFX = GFX;
})(window.RS);
