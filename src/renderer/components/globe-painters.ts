// The two ways the IP Intelligence globe draws the Earth. WebGL 2 is used when the PC has a working
// GPU; otherwise (no graphics driver, many VMs and remote sessions) the same picture is computed
// on the CPU into a 2D canvas. Both use the same imagery and the same day/night shading.

import type { Mat3, Vec3 } from '../../core/globe';

export interface Painter {
  kind: 'webgl' | 'software';
  /** Device pixels per CSS pixel this painter renders at. */
  pixelRatio: number;
  /** Resolves when the imagery is loaded; rejects when it can't be. */
  ready: Promise<void>;
  /** Draws the globe of `radius` CSS px centred in a w × h CSS px canvas. */
  draw(m: Mat3, sun: Vec3, w: number, h: number, radius: number): void;
  dispose(): void;
}

// Shading shared by both painters (see FRAG): ambient + sunlit day side, city lights on the night
// side, a blue atmosphere at the limb and a faint halo around the planet.
const BG: Vec3 = [0.01, 0.013, 0.024];
const RIM: Vec3 = [0.45, 0.68, 1.0];
const HALO: Vec3 = [0.3, 0.55, 1.0];
const LIGHTS: Vec3 = [1.3, 1.08, 0.78];

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform mat3 uRot;
uniform vec3 uSun;
uniform vec2 uCenter;
uniform float uRadius;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = (gl_FragCoord.xy - uCenter) / uRadius;
  float r = length(p);
  float s = hash(floor(gl_FragCoord.xy));
  vec3 bg = vec3(${BG.join(', ')}) + vec3(step(0.9975, s) * (s - 0.9975) * 300.0);
  bg += vec3(${HALO.join(', ')}) * (r > 1.0 ? exp(-(r - 1.0) * 16.0) * 0.55 : 0.0);
  float aa = 1.5 / uRadius;
  if (r > 1.0 + aa) { outColor = vec4(bg, 1.0); return; }
  vec2 q = p / max(r, 1.0);
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 e = uRot * vec3(q, z);
  float lat = asin(clamp(e.y, -1.0, 1.0));
  float u1 = atan(e.x, e.z) / 6.2831853 + 0.5;
  float u2 = fract(u1 + 0.5) - 0.5;
  float u = fwidth(u1) <= fwidth(u2) + 1e-6 ? u1 : u2;
  vec2 uv = vec2(u, 0.5 - lat / 3.1415927);
  vec3 day = texture(uDay, uv).rgb;
  vec3 night = texture(uNight, uv).rgb;
  float sd = dot(e, uSun);
  vec3 col = day * (0.07 + 1.0 * smoothstep(-0.12, 0.3, sd));
  col += night * (1.0 - smoothstep(-0.25, 0.02, sd)) * vec3(${LIGHTS.join(', ')});
  col = mix(col, vec3(${RIM.join(', ')}), pow(1.0 - z, 3.0) * 0.6);
  outColor = vec4(mix(bg, col, smoothstep(1.0 + aa, 1.0 - aa, r)), 1.0);
}`;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

// ------------------------------------------------------------------ WebGL 2

export function webglPainter(canvas: HTMLCanvasElement, dayUrl: string, nightUrl: string): Painter | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('shader');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'uDay'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'uNight'), 1);
  const uRot = gl.getUniformLocation(prog, 'uRot');
  const uSun = gl.getUniformLocation(prog, 'uSun');
  const uCenter = gl.getUniformLocation(prog, 'uCenter');
  const uRadius = gl.getUniformLocation(prog, 'uRadius');

  const upload = (img: HTMLImageElement, unit: number) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number));
  };
  const ready = Promise.all([loadImage(dayUrl), loadImage(nightUrl)]).then(([day, night]) => {
    upload(day, 0);
    upload(night, 1);
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  return {
    kind: 'webgl',
    pixelRatio,
    ready,
    draw(m, sun, w, h, radius) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      // `m` is row-major; uploading it as column-major hands the shader its transpose = its
      // inverse, which maps screen directions back to Earth-fixed ones.
      gl.uniformMatrix3fv(uRot, false, m);
      gl.uniform3fv(uSun, sun);
      gl.uniform2f(uCenter, (w / 2) * pixelRatio, (h / 2) * pixelRatio);
      gl.uniform1f(uRadius, radius * pixelRatio);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose: () => gl.getExtension('WEBGL_lose_context')?.loseContext(),
  };
}

// ------------------------------------------------------------------ Software (CPU)

interface Raster {
  w: number;
  h: number;
  px: Uint8ClampedArray;
}

/** Decodes an image into RGBA pixels at `width` (the browser does a high-quality downscale). */
function rasterize(img: HTMLImageElement, width: number): Raster {
  const w = Math.min(width, img.naturalWidth);
  const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2d_unavailable');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  return { w, h, px: g.getImageData(0, 0, w, h).data };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function softwarePainter(canvas: HTMLCanvasElement, dayUrl: string, nightUrl: string): Painter | null {
  const g = canvas.getContext('2d');
  if (!g) return null;
  let day: Raster | null = null;
  let night: Raster | null = null;
  const ready = Promise.all([loadImage(dayUrl), loadImage(nightUrl)]).then(([d, n]) => {
    day = rasterize(d, 2048);
    night = rasterize(n, 1024);
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  let frame: ImageData | null = null;
  let stars: Uint8Array | null = null;

  return {
    kind: 'software',
    pixelRatio,
    ready,
    draw(m, sun, w, h, radius) {
      if (!day || !night) return;
      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) return;
      if (!frame || frame.width !== W || frame.height !== H) {
        frame = g.createImageData(W, H);
        stars = new Uint8Array(W * H);
        for (let i = 0; i < stars.length; i++) {
          const s = Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
          if (s > 0.9975) stars[i] = Math.round((s - 0.9975) * 300 * 255);
        }
      }
      const out = frame.data;
      const st = stars as Uint8Array;
      const D = day;
      const N = night;
      const R = radius * pixelRatio;
      const cx = (w / 2) * pixelRatio;
      const cy = (h / 2) * pixelRatio;
      const aa = 1.5 / R;
      const [sx, sy, sz] = sun;
      for (let y = 0; y < H; y++) {
        const py = (cy - y - 0.5) / R;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const pxv = (x + 0.5 - cx) / R;
          const r = Math.sqrt(pxv * pxv + py * py);
          const star = (st[y * W + x] ?? 0) / 255;
          const halo = r > 1 ? Math.exp(-(r - 1) * 16) * 0.55 : 0;
          const bgR = BG[0] + star + HALO[0] * halo;
          const bgG = BG[1] + star + HALO[1] * halo;
          const bgB = BG[2] + star + HALO[2] * halo;
          if (r > 1 + aa) {
            out[i] = bgR * 255;
            out[i + 1] = bgG * 255;
            out[i + 2] = bgB * 255;
            out[i + 3] = 255;
            continue;
          }
          const k = Math.max(r, 1);
          const qx = pxv / k;
          const qy = py / k;
          const z = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy));
          // Transpose of the row-major view matrix = screen → Earth-fixed.
          const ex = m[0] * qx + m[3] * qy + m[6] * z;
          const ey = m[1] * qx + m[4] * qy + m[7] * z;
          const ez = m[2] * qx + m[5] * qy + m[8] * z;
          const u = Math.atan2(ex, ez) / (2 * Math.PI) + 0.5;
          const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, ey))) / Math.PI;
          // Day: bilinear; night lights: nearest (they are soft anyway).
          const fx = u * D.w - 0.5;
          const fy = Math.min(D.h - 1, Math.max(0, v * D.h - 0.5));
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          const xa = ((x0 % D.w) + D.w) % D.w;
          const xb = (xa + 1) % D.w;
          const yb = Math.min(D.h - 1, y0 + 1);
          const a = (y0 * D.w + xa) * 4, b = (y0 * D.w + xb) * 4, c = (yb * D.w + xa) * 4, d = (yb * D.w + xb) * 4;
          const sd = ex * sx + ey * sy + ez * sz;
          const light = (0.07 + 1.0 * smooth(-0.12, 0.3, sd)) / 255;
          const dark = (1 - smooth(-0.25, 0.02, sd)) / 255;
          const ni = (Math.min(N.h - 1, Math.floor(v * N.h)) * N.w + Math.min(N.w - 1, Math.floor(u * N.w))) * 4;
          const rim = (1 - z) ** 3 * 0.6;
          const edge = smooth(1 + aa, 1 - aa, r);
          for (let ch = 0; ch < 3; ch++) {
            const top = (D.px[a + ch] ?? 0) * (1 - tx) + (D.px[b + ch] ?? 0) * tx;
            const bot = (D.px[c + ch] ?? 0) * (1 - tx) + (D.px[d + ch] ?? 0) * tx;
            let col = (top * (1 - ty) + bot * ty) * light + (N.px[ni + ch] ?? 0) * dark * (LIGHTS[ch] ?? 1);
            col = col * (1 - rim) + (RIM[ch] ?? 1) * rim;
            const bg = ch === 0 ? bgR : ch === 1 ? bgG : bgB;
            out[i + ch] = (bg * (1 - edge) + col * edge) * 255;
          }
          out[i + 3] = 255;
        }
      }
      g.putImageData(frame, 0, 0);
    },
    dispose: () => {
      day = null;
      night = null;
    },
  };
}
