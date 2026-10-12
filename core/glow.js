// Neon OS core: the orb's glow, drawn with WebGL
// The orb is thousands of soft glowing dots (each ball, its halo and its trail) added on top of each other.
// Drawing them on the graphics card keeps it smooth at full screen and leaves room for longer, smoother trails.
// It's the same kind of shader code game engines use, so it carries over to the game.
//
// createGlow(canvas, { background }) returns null when WebGL isn't available (callers fall back to a 2D canvas).
//   resize(w, h, dpr)        size in CSS pixels
//   setColor([r, g, b])      the orb colour, 0–255
//   begin(t, loud)           clears, draws the nebula background if asked for (t: seconds, loud: 0–1)
//   dot(x, y, size, alpha)   one glowing dot, centred at x, y, `size` across (like the old sprite)
//   end()                    draws everything queued
// background: { base: [r,g,b,a] | null, blobs: [{ x, y, r, color: [r,g,b,a] }] } with x, y as fractions of the
// width and height, r as a fraction of the longer side, colours 0–255 and alpha 0–1.

const DOT_VS = `
attribute vec2 aCenter; attribute vec2 aCorner; attribute float aSize; attribute float aAlpha;
uniform vec2 uRes; varying vec2 vC; varying float vA;
void main() {
  vec2 p = aCenter + aCorner * aSize * 0.5;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  vC = aCorner; vA = aAlpha;
}`;
// the same light falloff as the orb's sprite: a white-hot centre, the orb colour, then a long faint halo
const DOT_FS = `
precision mediump float;
uniform vec3 uCol; varying vec2 vC; varying float vA;
void main() {
  float r = length(vC);
  if (r > 1.0) discard;
  vec3 mid = mix(uCol, vec3(1.0), 0.5);
  vec4 c;
  if (r < 0.06) c = mix(vec4(1.0), vec4(mid, 1.0), r / 0.06);
  else if (r < 0.16) c = mix(vec4(mid, 1.0), vec4(uCol, 0.75), (r - 0.06) / 0.10);
  else if (r < 0.38) c = mix(vec4(uCol, 0.75), vec4(uCol, 0.18), (r - 0.16) / 0.22);
  else c = mix(vec4(uCol, 0.18), vec4(uCol, 0.0), smoothstep(0.0, 1.0, (r - 0.38) / 0.62));
  float a = c.a * vA;
  gl_FragColor = vec4(c.rgb * a, a);
}`;
const BG_VS = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
// the nebula: up to two soft colour clouds over a base colour, with a slow drifting shimmer that breathes with the music
const BG_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uDpr; uniform float uT; uniform float uLoud;
uniform vec4 uBase; uniform vec3 uP1; uniform vec4 uC1; uniform vec3 uP2; uniform vec4 uC2;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
vec4 cloud(vec2 px, vec3 p, vec4 col, float m) {
  float d = distance(px, p.xy * uRes) / (p.z * max(uRes.x, uRes.y));
  float a = clamp(1.0 - d, 0.0, 1.0) * col.a * m;
  return vec4(col.rgb * a, a);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 q = px / max(uRes.x, uRes.y) * 3.0;
  float sh = 0.85 + 0.3 * noise(q + vec2(uT * 0.03, -uT * 0.02)) + 0.12 * noise(q * 2.7 - uT * 0.05);
  float m = sh * (1.0 + 0.25 * uLoud);
  vec4 c = vec4(uBase.rgb * uBase.a, uBase.a);
  c = over(cloud(px, uP1, uC1, m), c);
  c = over(cloud(px, uP2, uC2, m), c);
  gl_FragColor = c;
}`;

// Tried on a spare canvas first, because a canvas that has had WebGL can't switch to 2D afterwards.
// WebGL drawn by the processor instead of a graphics card (SwiftShader, llvmpipe) is slower than the 2D canvas.
let usable = null;
function glUsable() {
  if (usable !== null) return usable;
  usable = false;
  try {
    const g = document.createElement("canvas").getContext("webgl");
    if (!g) return false;
    let force = false; try { force = localStorage.getItem("neon-os:gl") === "force"; } catch (e) {}
    const info = g.getExtension("WEBGL_debug_renderer_info"), who = info ? String(g.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    usable = force || !/swiftshader|llvmpipe|software|basic render/i.test(who);
    // and the shaders must build, so the real canvas never ends up with a broken WebGL it can't swap for 2D
    for (const [type, src] of [[g.VERTEX_SHADER, DOT_VS], [g.FRAGMENT_SHADER, DOT_FS], [g.VERTEX_SHADER, BG_VS], [g.FRAGMENT_SHADER, BG_FS]]) {
      const sh = g.createShader(type); g.shaderSource(sh, src); g.compileShader(sh);
      if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) usable = false;
    }
    const lose = g.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
  } catch (e) { usable = false; }
  return usable;
}

export function createGlow(canvas, { background = null } = {}) {
  if (!glUsable()) return null;
  let gl;
  try { gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false }); } catch (e) { gl = null; }
  if (!gl) return null;
  const MAX = 24000, FLOATS = 6, PER = 6; // quads per batch, floats per vertex, vertices per quad
  const data = new Float32Array(MAX * PER * FLOATS);
  const CORNERS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
  let W = 1, H = 1, D = 1, n = 0, col = [63, 242, 255], t = 0, loud = 0;
  let dot, bg, dotBuf, bgBuf;

  function compile(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {}; const nA = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES), nU = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nA; i++) { const a = gl.getActiveAttrib(p, i); loc[a.name] = gl.getAttribLocation(p, a.name); }
    for (let i = 0; i < nU; i++) { const u = gl.getActiveUniform(p, i); loc[u.name] = gl.getUniformLocation(p, u.name); }
    return { p, loc };
  }
  function init() {
    dot = compile(DOT_VS, DOT_FS); bg = compile(BG_VS, BG_FS);
    dotBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    bgBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST);
  }
  try { init(); } catch (e) { return null; }
  let lost = false;
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; });
  canvas.addEventListener("webglcontextrestored", () => { try { init(); lost = false; resize(W, H, D); } catch (e) {} });

  function resize(w, h, dpr) {
    W = Math.max(1, w); H = Math.max(1, h); D = dpr || 1;
    canvas.width = Math.round(W * D); canvas.height = Math.round(H * D);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  function flush() {
    if (!n || lost) { n = 0; return; }
    gl.useProgram(dot.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * PER * FLOATS));
    const L = dot.loc, st = FLOATS * 4;
    gl.enableVertexAttribArray(L.aCenter); gl.vertexAttribPointer(L.aCenter, 2, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(L.aCorner); gl.vertexAttribPointer(L.aCorner, 2, gl.FLOAT, false, st, 8);
    gl.enableVertexAttribArray(L.aSize); gl.vertexAttribPointer(L.aSize, 1, gl.FLOAT, false, st, 16);
    gl.enableVertexAttribArray(L.aAlpha); gl.vertexAttribPointer(L.aAlpha, 1, gl.FLOAT, false, st, 20);
    gl.uniform2f(L.uRes, W, H); gl.uniform3f(L.uCol, col[0] / 255, col[1] / 255, col[2] / 255);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); // light adds up, like the old "lighter" drawing
    gl.drawArrays(gl.TRIANGLES, 0, n * PER);
    n = 0;
  }
  return {
    gl: true,
    resize,
    setColor(c) { col = c; },
    setBackground(b) { background = b; },
    begin(time = 0, level = 0) {
      t = time; loud = level; n = 0;
      if (lost) return;
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!background) return;
      const b = background, L = bg.loc, blob = i => b.blobs[i] || { x: 0, y: 0, r: 1, color: [0, 0, 0, 0] };
      gl.useProgram(bg.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
      gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(L.uRes, W, H); gl.uniform1f(L.uDpr, D); gl.uniform1f(L.uT, t); gl.uniform1f(L.uLoud, loud);
      const base = b.base || [0, 0, 0, 0]; gl.uniform4f(L.uBase, base[0] / 255, base[1] / 255, base[2] / 255, base[3]);
      for (const [i, P, C] of [[0, L.uP1, L.uC1], [1, L.uP2, L.uC2]]) { const o = blob(i); gl.uniform3f(P, o.x, o.y, o.r); gl.uniform4f(C, o.color[0] / 255, o.color[1] / 255, o.color[2] / 255, o.color[3]); }
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dot(x, y, size, alpha) {
      if (alpha <= 0.002 || size <= 0.5) return;
      if (n >= MAX) flush();
      let o = n * PER * FLOATS;
      for (let k = 0; k < 12; k += 2) { data[o++] = x; data[o++] = y; data[o++] = CORNERS[k]; data[o++] = CORNERS[k + 1]; data[o++] = size; data[o++] = alpha > 1 ? 1 : alpha; }
      n++;
    },
    end: flush,
    get lost() { return lost; },
  };
}

// The same interface drawn on a 2D canvas, for browsers without WebGL.
export function createGlow2D(canvas, { background = null } = {}) {
  const ctx = canvas.getContext("2d");
  let W = 1, H = 1, sprite = null;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  return {
    gl: false,
    resize(w, h, dpr) { W = Math.max(1, w); H = Math.max(1, h); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); },
    setColor([r, g, b]) {
      const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
      const x = c.getContext("2d"), grd = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
      grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.06, `rgba(${(r + 255) / 2 | 0},${(g + 255) / 2 | 0},${(b + 255) / 2 | 0},1)`);
      grd.addColorStop(0.16, `rgba(${r},${g},${b},0.75)`); grd.addColorStop(0.38, `rgba(${r},${g},${b},0.18)`); grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      x.fillStyle = grd; x.fillRect(0, 0, N, N); sprite = c;
    },
    setBackground(b) { background = b; },
    begin() {
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
      if (background) {
        if (background.base) { ctx.fillStyle = rgba(background.base, background.base[3]); ctx.fillRect(0, 0, W, H); }
        for (const o of background.blobs) {
          const g = ctx.createRadialGradient(W * o.x, H * o.y, 0, W * o.x, H * o.y, Math.max(W, H) * o.r);
          g.addColorStop(0, rgba(o.color, o.color[3])); g.addColorStop(1, rgba(o.color, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
      }
      ctx.globalCompositeOperation = "lighter";
    },
    dot(x, y, size, alpha) { if (alpha <= 0.002 || !sprite) return; ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size); },
    end() { ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; },
    get lost() { return false; },
  };
}
