/**
 * DRSE NEO Tracker — real-time 3D map of near-Earth asteroids.
 *
 * Positions are propagated client-side from JPL SBDB Keplerian elements
 * (js/neo-data.js) for the current wall-clock time. Earth-centered view,
 * true scale: 1 scene unit = 1 Earth radius (6371 km).
 */
import * as THREE from 'three';
import { NEO_FIELDS, NEO_ROWS } from './neo-data.js';

/* ============================================================
   Constants & frames
   ============================================================ */
const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
const ER_KM = 6371.0;
const AU = AU_KM / ER_KM;        // 1 AU in scene units (Earth radii)
const LD_KM = 384400;
const LD = LD_KM / ER_KM;        // lunar distance in scene units
const OBLIQUITY = 23.4393 * DEG;

// Ecliptic J2000 (x,y,z) -> scene (x, z, -y): y-up, right-handed.
function eclToScene(x, y, z, out) {
  out.set(x, z, -y);
  return out;
}

const COL = {
  bg:      0x0a0a0f,
  accent:  0xeab464,
  accent2: 0xa7754d,
  steel:   0x8d98a7,
  white:   0xefe4d6,
  dim:     0x646e78,
};

/* ============================================================
   Time
   ============================================================ */
let simMs = Date.now();
let warp = 1;
const jdOf = (ms) => ms / 86400000 + 2440587.5;

/* ============================================================
   Orbital mechanics
   ============================================================ */
function solveKepler(M, e) {
  // M in radians, normalized
  M = M % (2 * Math.PI);
  if (M < 0) M += 2 * Math.PI;
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 8; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  return E;
}

// Build perifocal->ecliptic basis for fixed elements
function orbitBasis(iDeg, omDeg, wDeg) {
  const i = iDeg * DEG, om = omDeg * DEG, w = wDeg * DEG;
  const ci = Math.cos(i), si = Math.sin(i);
  const co = Math.cos(om), so = Math.sin(om);
  const cw = Math.cos(w), sw = Math.sin(w);
  return {
    Px: cw * co - sw * so * ci, Py: cw * so + sw * co * ci, Pz: sw * si,
    Qx: -sw * co - cw * so * ci, Qy: -sw * so + cw * co * ci, Qz: cw * si,
  };
}

// Heliocentric ecliptic position (AU) from elements at JD
function helioPos(el, jd, out) {
  const n = 360 / (el.per_y * 365.25);                 // deg/day
  const M = (el.ma + n * (jd - el.epoch)) * DEG;
  const E = solveKepler(M, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const B = el.basis;
  out.x = B.Px * xp + B.Qx * yp;
  out.y = B.Py * xp + B.Qy * yp;
  out.z = B.Pz * xp + B.Qz * yp;
  return out;
}

// Earth-Moon barycenter elements (Standish approx, J2000 + rates)
function earthElements(jd) {
  const T = (jd - 2451545.0) / 36525;
  const a = 1.00000261 + 0.00000562 * T;
  const e = 0.01671123 - 0.00004392 * T;
  const i = -0.00001531 - 0.01294668 * T;
  const L = 100.46457166 + 35999.37244981 * T;
  const lp = 102.93768193 + 0.32327364 * T;   // longitude of perihelion
  const om = 0.0;
  return {
    a, e, i, om,
    w: lp - om,
    ma: ((L - lp) % 360 + 360) % 360,
    epoch: jd, per_y: Math.pow(a, 1.5),
    basis: orbitBasis(i, om, lp - om),
  };
}

function earthHelio(jd, out) {
  return helioPos(earthElements(jd), jd, out);
}

// Geocentric Moon, low-precision series (ecliptic of date ~ J2000 for display)
function moonGeo(jd, out) {
  const T = (jd - 2451545.0) / 36525;
  const s = (d) => Math.sin(d * DEG), c = (d) => Math.cos(d * DEG);
  const lam = (218.316 + 481267.8813 * T
    + 6.29 * s(134.9 + 477198.85 * T)
    - 1.27 * s(259.2 - 413335.38 * T)
    + 0.66 * s(235.7 + 890534.23 * T)
    + 0.21 * s(269.9 + 954397.70 * T)
    - 0.19 * s(357.5 + 35999.05 * T)
    - 0.11 * s(186.6 + 966404.05 * T)) * DEG;
  const bet = (5.13 * s(93.3 + 483202.03 * T)
    + 0.28 * s(228.2 + 960400.87 * T)
    - 0.28 * s(318.3 + 6003.18 * T)
    - 0.17 * s(217.6 - 407332.20 * T)) * DEG;
  const par = 0.9508
    + 0.0518 * c(134.9 + 477198.85 * T)
    + 0.0095 * c(259.2 - 413335.38 * T)
    + 0.0078 * c(235.7 + 890534.23 * T)
    + 0.0028 * c(269.9 + 954397.70 * T);
  const rKm = 6378.14 / Math.sin(par * DEG);
  const cb = Math.cos(bet);
  out.x = rKm * cb * Math.cos(lam);
  out.y = rKm * cb * Math.sin(lam);
  out.z = rKm * Math.sin(bet);
  return out; // km, ecliptic
}

function gmstRad(jd) {
  let g = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360;
  if (g < 0) g += 360;
  return g * DEG;
}

/* ============================================================
   Dataset
   ============================================================ */
const F = {};
NEO_FIELDS.forEach((k, idx) => (F[k] = idx));

const SPEC_INFO = (spec) => {
  const t = (spec || '').trim();
  const c0 = t.charAt(0).toUpperCase();
  if ('CBFG'.includes(c0)) return { g: 'C', mat: 'Water · clays · organics' };
  if ('DPT'.includes(c0))  return { g: 'C', mat: 'Organics · silicates · possible ices' };
  if (c0 === 'V')          return { g: 'S', mat: 'Basaltic rock · pyroxene' };
  if ('SQRAKLO'.includes(c0)) return { g: 'S', mat: 'Ni-Fe metal · Mg-silicates' };
  if (c0 === 'M')          return { g: 'X', mat: 'Iron · nickel · platinum-group' };
  if ('XE'.includes(c0))   return { g: 'X', mat: 'Metal-rich · enstatite' };
  return { g: 'U', mat: 'Composition unknown' };
};
const GROUP_COLOR = {
  S: new THREE.Color(0xeab464),
  C: new THREE.Color(0x8d98a7),
  X: new THREE.Color(0xefe4d6),
  U: new THREE.Color(0x646e78),
};
const GROUP_HEX = { S: '#eab464', C: '#8d98a7', X: '#efe4d6', U: '#646e78' };

const asts = NEO_ROWS.map((r) => {
  const spec = r[F.spec];
  const si = SPEC_INFO(spec);
  const el = {
    a: r[F.a], e: r[F.e], i: r[F.i], om: r[F.om], w: r[F.w],
    ma: r[F.ma], epoch: r[F.epoch], per_y: r[F.per_y],
    basis: orbitBasis(r[F.i], r[F.om], r[F.w]),
  };
  const diam = r[F.diam];
  const size = diam ? THREE.MathUtils.clamp(6.0 + Math.log10(diam + 1) * 3.8, 6.0, 12) : 5.6;
  return {
    pdes: r[F.pdes], name: r[F.name], full: r[F.full],
    H: r[F.H], diam, albedo: r[F.albedo], spec, pha: !!r[F.pha],
    moid: r[F.moid], price: r[F.price], profit: r[F.profit],
    el, group: si.g, mat: si.mat,
    baseSize: size,
    helio: new THREE.Vector3(),   // AU, ecliptic
    scenePos: new THREE.Vector3(),
    distKm: 0,
    sx: 0, sy: 0, on: false,       // screen-space cache
  };
});

function orbitClass(a) {
  const { el } = a;
  const q = el.a * (1 - el.e), Q = el.a * (1 + el.e);
  if (el.a > 1.0) return q < 1.017 ? 'Apollo' : 'Amor';
  return Q > 0.983 ? 'Aten' : 'Atira';
}

/* ============================================================
   Formatting
   ============================================================ */
function fmtMoney(v) {
  if (v == null) return null;
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [m, s] of units) {
    if (v >= m) {
      const n = v / m;
      return '$' + (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + s;
    }
  }
  return '$' + v.toFixed(0);
}
function fmtDist(km) {
  const ld = km / LD_KM;
  if (km < 2 * LD_KM) return Math.round(km).toLocaleString('en-US') + ' km · ' + ld.toFixed(2) + ' LD';
  const au = km / AU_KM;
  if (au < 0.02) return ld.toFixed(1) + ' LD';
  return au.toFixed(3) + ' AU · ' + ld.toFixed(0) + ' LD';
}
function fmtRadius(er) {
  const km = er * ER_KM;
  if (km < 1.5 * LD_KM) return Math.round(km).toLocaleString('en-US') + ' km';
  const au = km / AU_KM;
  if (au < 0.05) return (km / LD_KM).toFixed(1) + ' LD';
  return au.toFixed(2) + ' AU';
}
function fmtDiam(d) {
  if (d == null) return '—';
  return d >= 1 ? d.toFixed(1) + ' km' : Math.round(d * 1000) + ' m';
}
const pad = (n) => String(n).padStart(2, '0');
function fmtClock(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
    + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + ' UTC';
}

/* ============================================================
   Renderer / scene / camera
   ============================================================ */
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.bg);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500000);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Camera controls — inertial orbit around Earth */
const ctrl = {
  theta: 0.9, phi: 1.25, radius: reduceMotion ? 95 : 7,
  tTheta: 0.9, tPhi: 1.25, tRadius: 95,
  vTheta: 0, vPhi: 0,
  minR: 2.4, maxR: 4.2 * AU,
};
function applyCamera() {
  const sp = Math.sin(ctrl.phi), cp = Math.cos(ctrl.phi);
  const st = Math.sin(ctrl.theta), ct = Math.cos(ctrl.theta);
  camera.position.set(ctrl.radius * sp * st, ctrl.radius * cp, ctrl.radius * sp * ct);
  camera.lookAt(0, 0, 0);
}

/* ============================================================
   Starfield (3D shell, subtle twinkle)
   ============================================================ */
{
  const N = 2600, R = 220000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  const size = new Float32Array(N);
  const warm = new THREE.Color(0xeab464), pale = new THREE.Color(0xdcccbb);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = R * s * Math.cos(th);
    pos[i * 3 + 1] = R * u;
    pos[i * 3 + 2] = R * s * Math.sin(th);
    const c = Math.random() < 0.22 ? warm : pale;
    const b = 0.4 + Math.random() * 0.6;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    phase[i] = Math.random() * Math.PI * 2;
    size[i] = 1.0 + Math.random() * 1.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uTwinkle: { value: reduceMotion ? 0 : 1 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aPhase, aSize;
      uniform float uTime, uPR, uTwinkle;
      varying vec3 vCol; varying float vA;
      void main() {
        vCol = aColor;
        vA = 0.55 + uTwinkle * 0.45 * sin(uTime * (0.4 + aPhase * 0.15) + aPhase * 7.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPR;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.18, d) * vA * 0.8;
        gl_FragColor = vec4(vCol, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const stars = new THREE.Points(g, m);
  stars.frustumCulled = false;
  stars.name = 'stars';
  scene.add(stars);
  scene.userData.starMat = m;
}

/* ============================================================
   Sun (light + glow sprite)
   ============================================================ */
const sunLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x334, 0.5));

function glowTexture(inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const cx = cv.getContext('2d');
  const gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.25, outer);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = gr;
  cx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture('rgba(255,246,228,1)', 'rgba(234,180,100,0.55)'),
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
sunSprite.scale.setScalar(1800);
scene.add(sunSprite);

/* ============================================================
   Earth — dark realistic day/night shader
   ============================================================ */
const texLoader = new THREE.TextureLoader();
texLoader.crossOrigin = 'anonymous';
const TEX = {
  day:   'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg',
  night: 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-night.jpg',
  moon:  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/textures/planets/moon_1024.jpg',
};
// NOTE: custom shaders here work in gamma space — don't tag sRGB (three would
// linearize on sample and the raw ShaderMaterial never re-encodes).
function loadTex(url, srgb = false) {
  return new Promise((res) => {
    texLoader.load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null));
  });
}

// 1x1 fallbacks so the shader is valid even if the CDN is unreachable
function flatTex(r, g, b) {
  const d = new Uint8Array([r, g, b, 255]);
  const t = new THREE.DataTexture(d, 1, 1);
  t.needsUpdate = true;
  return t;
}

const earthUniforms = {
  uDay:    { value: flatTex(38, 52, 70) },
  uNight:  { value: flatTex(0, 0, 0) },
  uSunDir: { value: new THREE.Vector3(1, 0, 0) },
};
const earthMat = new THREE.ShaderMaterial({
  uniforms: earthUniforms,
  vertexShader: `
    varying vec3 vN; varying vec3 vW; varying vec2 vUv;
    void main() {
      vUv = uv;
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform sampler2D uDay, uNight;
    uniform vec3 uSunDir;
    varying vec3 vN; varying vec3 vW; varying vec2 vUv;
    void main() {
      vec3 N = normalize(vN);
      float ndl = dot(N, normalize(uSunDir));
      vec3 day = texture2D(uDay, vUv).rgb;
      // moody industrial grade: mild desaturate + cool, lift the oceans
      float lum = dot(day, vec3(0.299, 0.587, 0.114));
      day = mix(day, vec3(lum), 0.28) * vec3(0.86, 0.92, 1.05);
      day = day * 0.88 + vec3(0.012, 0.020, 0.036);
      float dayAmt = smoothstep(-0.06, 0.32, ndl);
      // warm terminator band (sunset line)
      float term = smoothstep(0.30, 0.02, abs(ndl));
      vec3 warm = vec3(0.918, 0.706, 0.392);
      vec3 dayCol = day * dayAmt + day * warm * term * 1.4;
      // city lights, pushed warm
      vec3 lights = texture2D(uNight, vUv).rgb;
      float lightsLum = dot(lights, vec3(0.33));
      vec3 nightCol = pow(lightsLum, 1.5) * vec3(1.0, 0.72, 0.40) * 2.3 * smoothstep(0.08, -0.12, ndl);
      // steel rim
      vec3 V = normalize(cameraPosition - vW);
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
      vec3 rim = vec3(0.553, 0.596, 0.655) * fres * (0.22 + 0.30 * dayAmt);
      gl_FragColor = vec4(dayCol + nightCol + rim, 1.0);
    }`,
});
const earthGroup = new THREE.Group();
const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
earthGroup.add(earthMesh);

// Axial tilt: north pole toward ecliptic (0, -sin e, cos e) -> scene (0, cos e, sin e)
{
  const pole = new THREE.Vector3(0, Math.cos(OBLIQUITY), Math.sin(OBLIQUITY)).normalize();
  earthGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole);
}
scene.add(earthGroup);

// Atmosphere shell
const atmoMat = new THREE.ShaderMaterial({
  uniforms: { uSunDir: earthUniforms.uSunDir },
  vertexShader: `
    varying vec3 vN; varying vec3 vW;
    void main() {
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform vec3 uSunDir;
    varying vec3 vN; varying vec3 vW;
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
      float sun = clamp(dot(N, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(vec3(0.38, 0.48, 0.68), vec3(0.92, 0.71, 0.39), pow(sun, 3.0) * 0.5);
      gl_FragColor = vec4(col, rim * (0.18 + 0.62 * sun));
    }`,
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.045, 96, 64), atmoMat);
earthGroup.add(atmo);

// Earth far-out marker
const earthMarker = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture('rgba(239,228,214,0.9)', 'rgba(141,152,167,0.35)'),
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
}));
scene.add(earthMarker);

/* ============================================================
   Moon
   ============================================================ */
const moonMat = new THREE.MeshStandardMaterial({ color: 0x9a958f, roughness: 1, metalness: 0 });
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2727, 48, 32), moonMat);
scene.add(moonMesh);
loadTex(TEX.moon, true).then((t) => { if (t) { moonMat.map = t; moonMat.color.set(0xcfcac2); moonMat.needsUpdate = true; } });

/* ============================================================
   Asteroid points
   ============================================================ */
const N_AST = asts.length;
const astGeom = new THREE.BufferGeometry();
const astPos = new Float32Array(N_AST * 3);
const astCol = new Float32Array(N_AST * 3);
const astSize = new Float32Array(N_AST);
asts.forEach((a, i) => {
  const c = GROUP_COLOR[a.group];
  astCol[i * 3] = c.r; astCol[i * 3 + 1] = c.g; astCol[i * 3 + 2] = c.b;
  astSize[i] = a.baseSize;
});
astGeom.setAttribute('position', new THREE.BufferAttribute(astPos, 3));
astGeom.setAttribute('aColor', new THREE.BufferAttribute(astCol, 3));
astGeom.setAttribute('aSize', new THREE.BufferAttribute(astSize, 1));
const astMat = new THREE.ShaderMaterial({
  uniforms: { uPR: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute vec3 aColor; attribute float aSize;
    uniform float uPR;
    varying vec3 vCol;
    void main() {
      vCol = aColor;
      gl_PointSize = aSize * uPR;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec3 vCol;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float core = smoothstep(0.46, 0.13, d) * 1.15;
      float halo = smoothstep(0.5, 0.0, d) * 0.5;
      vec3 col = mix(vCol, vec3(1.0, 0.97, 0.9), smoothstep(0.24, 0.0, d) * 0.6);
      float a = core + halo;
      if (a < 0.02) discard;
      gl_FragColor = vec4(col, a);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const astPoints = new THREE.Points(astGeom, astMat);
astPoints.frustumCulled = false;
scene.add(astPoints);

// Selection ring sprite
function ringTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const cx = cv.getContext('2d');
  cx.strokeStyle = 'rgba(234,180,100,1)';
  cx.lineWidth = 3;
  cx.beginPath(); cx.arc(64, 64, 52, 0, Math.PI * 2); cx.stroke();
  // corner ticks
  cx.lineWidth = 4;
  for (let k = 0; k < 4; k++) {
    const a0 = k * Math.PI / 2 - 0.18, a1 = k * Math.PI / 2 + 0.18;
    cx.beginPath(); cx.arc(64, 64, 58, a0, a1); cx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const selRing = new THREE.Sprite(new THREE.SpriteMaterial({
  map: ringTexture(), depthWrite: false, depthTest: false, transparent: true, opacity: 0,
}));
scene.add(selRing);

/* ============================================================
   Orbit lines
   ============================================================ */
const sunScene = new THREE.Vector3();   // geocentric sun position, scene units

function makeOrbitLine(color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(257 * 3), 3));
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(g, m);
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  return line;
}
const selOrbitLine = makeOrbitLine(COL.accent, 0.55);
const earthOrbitLine = makeOrbitLine(COL.dim, 0.0);
earthOrbitLine.visible = true;

// Orbit cloud: every tracked orbit as a faint heliocentric web (far zoom only)
const orbitCloud = (() => {
  const SEG = 128;
  const verts = new Float32Array(N_AST * SEG * 2 * 3);
  let p = 0;
  const put = (v) => { verts[p++] = v.x; verts[p++] = v.y; verts[p++] = v.z; };
  const a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  for (const a of asts) {
    const el = a.el, B = el.basis, b = el.a * Math.sqrt(1 - el.e * el.e);
    for (let k = 0; k < SEG; k++) {
      for (let j = 0; j < 2; j++) {
        const E = ((k + j) / SEG) * Math.PI * 2;
        const xp = el.a * (Math.cos(E) - el.e), yp = b * Math.sin(E);
        eclToScene(
          (B.Px * xp + B.Qx * yp) * AU,
          (B.Py * xp + B.Qy * yp) * AU,
          (B.Pz * xp + B.Qz * yp) * AU,
          j === 0 ? a0 : a1
        );
      }
      put(a0); put(a1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const m = new THREE.LineBasicMaterial({
    color: COL.steel, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);
  return lines;
})();

// Fill a line's geometry with the full ellipse of `el`, heliocentric, in
// scene units RELATIVE to the sun (line.position is set to sunScene each frame).
const _v = new THREE.Vector3();
function fillOrbit(line, el) {
  const attr = line.geometry.getAttribute('position');
  for (let k = 0; k <= 256; k++) {
    const E = (k / 256) * Math.PI * 2;
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const B = el.basis;
    eclToScene(
      (B.Px * xp + B.Qx * yp) * AU,
      (B.Py * xp + B.Qy * yp) * AU,
      (B.Pz * xp + B.Qz * yp) * AU,
      _v
    );
    attr.setXYZ(k, _v.x, _v.y, _v.z);
  }
  attr.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

/* ============================================================
   Distance rings (ecliptic plane, Earth-centered)
   ============================================================ */
const RINGS = [
  { r: LD, label: '1 LD' },
  { r: 10 * LD, label: '10 LD' },
  { r: 0.1 * AU, label: '0.1 AU' },
  { r: 0.5 * AU, label: '0.5 AU' },
  { r: AU, label: '1 AU' },
  { r: 2 * AU, label: '2 AU' },
];
RINGS.forEach((ring) => {
  const pts = new Float32Array(129 * 3);
  for (let k = 0; k <= 128; k++) {
    const a = (k / 128) * Math.PI * 2;
    pts[k * 3] = Math.cos(a) * ring.r;
    pts[k * 3 + 1] = 0;
    pts[k * 3 + 2] = Math.sin(a) * ring.r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const m = new THREE.LineBasicMaterial({ color: COL.steel, transparent: true, opacity: 0, depthWrite: false });
  ring.line = new THREE.Line(g, m);
  ring.line.frustumCulled = false;
  scene.add(ring.line);
  const div = document.createElement('div');
  div.className = 'ring-label';
  div.textContent = ring.label;
  div.style.opacity = '0';
  document.body.appendChild(div);
  ring.el = div;
});

/* ============================================================
   HTML labels (Moon / Earth / selection)
   ============================================================ */
function makeLabel(cls) {
  const d = document.createElement('div');
  d.className = 'obj-label' + (cls ? ' ' + cls : '');
  d.style.opacity = '0';
  document.body.appendChild(d);
  return d;
}
const moonLabel = makeLabel(); moonLabel.textContent = 'Moon';
const earthLabel = makeLabel(); earthLabel.textContent = 'Earth';
const selLabel = makeLabel('sel');

/* ============================================================
   HUD wiring
   ============================================================ */
const tipEl = document.getElementById('tip');
const panelEl = document.getElementById('panel');
const clockEl = document.getElementById('hud-clock');
const radiusEl = document.getElementById('hud-radius');

document.getElementById('hud-count').textContent =
  N_AST + ' objects · ' + asts.filter(a => a.pha).length + ' PHA';

{
  const legend = document.getElementById('legend');
  [['#eab464', 'S-type · stony'], ['#8d98a7', 'C-type · carbonaceous'],
   ['#efe4d6', 'X/M · metallic'], ['#646e78', 'Unclassified']].forEach(([c, t]) => {
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML = `<span class="swatch" style="background:${c}; box-shadow:0 0 5px ${c}66"></span><span>${t}</span>`;
    legend.appendChild(row);
  });
}

document.getElementById('warp-row').addEventListener('click', (e) => {
  const btn = e.target.closest('.warp-btn');
  if (!btn) return;
  warp = Number(btn.dataset.warp);
  if (warp === 1) simMs = Date.now();   // return to the real present
  document.querySelectorAll('.warp-btn').forEach(b => b.classList.toggle('on', b === btn));
});

/* ============================================================
   Picking / selection
   ============================================================ */
let hoverIdx = -1, selIdx = -1;
const mouse = { x: -1e4, y: -1e4, downX: 0, downY: 0, dragging: false, pinch: 0 };

// Nearest on-screen asteroid within `radius` px of (x, y), or -1.
// Uses screen positions cached by the last rendered frame.
function pickAt(x, y, radius) {
  let best = -1, bestD = radius;
  for (let i = 0; i < N_AST; i++) {
    const a = asts[i];
    if (!a.on) continue;
    const d = Math.hypot(a.sx - x, a.sy - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function tipHTML(a) {
  const rows = [
    `<div class="t-name">${a.name}</div>`,
    `<div>${a.spec ? a.spec + '-type' : 'Unclassified'} <span class="t-dim">· ${a.mat}</span></div>`,
    `<div><span class="t-dim">Est. value</span> <span class="t-val">${fmtMoney(a.price) || 'Unassayed'}</span></div>`,
    `<div><span class="t-dim">Distance</span> ${fmtDist(a.distKm)}</div>`,
  ];
  if (a.diam != null) rows.push(`<div><span class="t-dim">Diameter</span> ${fmtDiam(a.diam)}</div>`);
  return rows.join('');
}

function panelHTML(a) {
  const oc = orbitClass(a);
  const money = fmtMoney(a.price);
  const profit = fmtMoney(a.profit);
  const kv = (k, v, gold) => `<div class="k">${k}</div><div class="v${gold ? ' gold' : ''}">${v}</div>`;
  return `
    <div class="p-eyebrow"><span>Prospecting report</span>
      <button class="p-close" id="p-close" aria-label="Close">✕</button></div>
    <h2>${a.name}</h2>
    <div class="p-des">${a.full}</div>
    <div class="p-badges">
      <span class="badge gold">${oc}</span>
      <span class="badge">${a.spec ? a.spec + '-type' : 'Unclassified'}</span>
      ${a.pha ? '<span class="badge warn">PHA</span>' : ''}
    </div>
    <div class="p-value">${money || 'Unassayed'}</div>
    <div class="p-value-sub">${money ? 'Estimated resource value' : 'Awaiting assay — no published valuation'}</div>
    ${profit ? `<div class="p-grid">${kv('Est. profit', profit, true)}</div>` : ''}
    <div class="p-rule"></div>
    <div class="p-grid">
      ${kv('Materials', a.mat)}
      ${kv('Diameter', fmtDiam(a.diam))}
      ${kv('Albedo', a.albedo != null ? a.albedo.toFixed(2) : '—')}
      ${kv('Abs. mag H', a.H != null ? a.H.toFixed(1) : '—')}
    </div>
    <div class="p-rule"></div>
    <div class="p-grid">
      <div class="k">Distance now</div><div class="v gold" id="p-dist">${fmtDist(a.distKm)}</div>
      ${kv('Semi-major axis', a.el.a.toFixed(3) + ' AU')}
      ${kv('Eccentricity', a.el.e.toFixed(3))}
      ${kv('Inclination', a.el.i.toFixed(1) + '°')}
      ${kv('Period', a.el.per_y >= 2 ? a.el.per_y.toFixed(1) + ' yr' : (a.el.per_y * 365.25).toFixed(0) + ' d')}
      ${kv('Earth MOID', a.moid != null ? (a.moid * AU_KM / LD_KM).toFixed(1) + ' LD' : '—')}
    </div>
    <div class="p-src">Orbit &amp; physical data: NASA/JPL SBDB.<br>Valuation: Asterank model estimate.</div>`;
}

function select(i) {
  selIdx = i;
  if (i < 0) {
    panelEl.classList.remove('on');
    selOrbitLine.visible = false;
    selRing.material.opacity = 0;
    selLabel.style.opacity = '0';
    return;
  }
  const a = asts[i];
  panelEl.innerHTML = panelHTML(a);
  panelEl.classList.add('on');
  panelEl.scrollTop = 0;
  document.getElementById('p-close').addEventListener('click', () => select(-1));
  fillOrbit(selOrbitLine, a.el);
  selOrbitLine.visible = true;
  selLabel.textContent = a.name;
}

addEventListener('keydown', (e) => { if (e.key === 'Escape') select(-1); });

/* ============================================================
   Search — fuzzy find + fly-to
   ============================================================ */
// Frame both Earth (always at screen center — the camera orbits it) and the
// asteroid: pull back past the asteroid (R = 1.8·D) and swing the camera
// ~15° off its direction so it sits comfortably off-axis, Earth centered.
function flyToAsteroid(i) {
  const p = asts[i].scenePos;
  const D = p.length();
  const f = _tmp.copy(p).normalize();
  const up = Math.abs(f.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  // 12° sideways + a ~12° upward tilt: asteroid sits off-axis in a 3/4
  // perspective instead of edge-on to the ecliptic (total ~17° separation,
  // well inside the frustum at R = 1.8·D)
  const beta = 12 * DEG;
  const upPerp = new THREE.Vector3().copy(up).addScaledVector(f, -up.dot(f)).normalize();
  const camDir = f.multiplyScalar(Math.cos(beta)).addScaledVector(r, Math.sin(beta))
    .addScaledVector(upPerp, 0.21).normalize();
  const tTheta = Math.atan2(camDir.x, camDir.z);
  // shortest-path azimuth (theta is unbounded; don't unwind whole turns)
  let dt = (tTheta - ctrl.theta) % (Math.PI * 2);
  if (dt > Math.PI) dt -= Math.PI * 2;
  if (dt < -Math.PI) dt += Math.PI * 2;
  ctrl.tTheta = ctrl.theta + dt;
  ctrl.tPhi = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(camDir.y, -1, 1)), 0.05, Math.PI - 0.05);
  // may exceed the wheel-zoom max for the farthest objects — that's fine,
  // the next manual zoom clamps back
  ctrl.tRadius = Math.max(D * 1.8, ctrl.minR + 2);
  ctrl.vTheta = ctrl.vPhi = 0;
}

// Substring beats subsequence; word-start and consecutive runs score up.
function fuzzyScore(query, target) {
  const q = query.toLowerCase(), t = target.toLowerCase();
  if (!q.length) return -1;
  const sub = t.indexOf(q);
  if (sub >= 0) return 1000 - sub * 4 - t.length * 0.5;
  let ti = 0, prev = -2, streak = 0, score = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    if (c === ' ') { streak = 0; continue; }
    let found = -1;
    while (ti < t.length) { if (t[ti] === c) { found = ti; ti++; break; } ti++; }
    if (found < 0) return -1;
    streak = found === prev + 1 ? streak + 1 : 1;
    const wordStart = found === 0 || ' -(123456789'.includes(t[found - 1]);
    score += 10 + streak * 6 + (wordStart ? 14 : 0) - found * 0.25;
    prev = found;
  }
  return score;
}

{
  const input = document.getElementById('search');
  const list = document.getElementById('search-results');
  let rows = [], active = 0;

  function close() {
    list.classList.remove('on');
    list.innerHTML = '';
    rows = [];
  }
  function choose(idx) {
    select(idx);
    flyToAsteroid(idx);
    input.value = '';
    close();
    input.blur();
  }
  function setActive(k) {
    active = (k + rows.length) % rows.length;
    list.querySelectorAll('.sr-row').forEach((el, j) => el.classList.toggle('active', j === active));
    list.querySelectorAll('.sr-row')[active]?.scrollIntoView({ block: 'nearest' });
  }
  function runSearch() {
    const q = input.value.trim();
    if (!q) { close(); return; }
    rows = asts
      .map((a, i) => ({ i, s: Math.max(fuzzyScore(q, a.name) + 20, fuzzyScore(q, a.full)) }))
      .filter(r => r.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 8);
    if (!rows.length) { close(); return; }
    list.innerHTML = rows.map((r, j) => {
      const a = asts[r.i];
      return `<div class="sr-row${j === 0 ? ' active' : ''}" data-j="${j}" role="option">
        <span class="sr-dot" style="background:${GROUP_HEX[a.group]}"></span>
        <span class="sr-name">${a.name}</span>
        <span class="sr-des">${a.full}</span>
        <span class="sr-val">${fmtMoney(a.price) || '—'}</span>
      </div>`;
    }).join('');
    list.classList.add('on');
    active = 0;
  }

  input.addEventListener('input', runSearch);
  input.addEventListener('focus', runSearch);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();   // keep canvas shortcuts (Esc-deselect) out of typing
    if (e.key === 'ArrowDown') { e.preventDefault(); if (rows.length) setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (rows.length) setActive(active - 1); }
    else if (e.key === 'Enter') { if (rows.length) choose(rows[active].i); }
    else if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  // mousedown fires before the input's blur, so the row click always lands
  list.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.sr-row');
    if (row) { e.preventDefault(); choose(rows[Number(row.dataset.j)].i); }
  });
  addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });
}

/* ============================================================
   Explorer / leaderboard — sortable live table
   ============================================================ */
{
  const box = document.getElementById('explorer');
  const toggle = document.getElementById('exp-toggle');
  const rowsEl = document.getElementById('exp-rows');
  const headEl = box.querySelector('.exp-head');
  let open = false;
  let sortKey = 'value', sortDir = -1;   // -1 = desc

  // profit per lunar distance: the prospecting yield index
  const ppdOf = (a) => (a.profit != null && a.distKm > 0) ? a.profit / (a.distKm / LD_KM) : null;
  const METRIC = {
    value:  (a) => a.price,
    profit: (a) => a.profit,
    dist:   (a) => a.distKm,
    ppd:    ppdOf,
  };
  const DEFAULT_DIR = { value: -1, profit: -1, dist: 1, ppd: -1 };

  function fmtDistShort(km) {
    const ld = km / LD_KM;
    return ld < 100 ? ld.toFixed(1) + ' LD' : (km / AU_KM).toFixed(2) + ' AU';
  }

  function render() {
    const metric = METRIC[sortKey];
    const order = asts
      .map((a, i) => ({ i, v: metric(a) }))
      .sort((x, y) => {
        if (x.v == null && y.v == null) return 0;
        if (x.v == null) return 1;           // unknowns always sink
        if (y.v == null) return -1;
        return (x.v - y.v) * sortDir;
      });
    headEl.querySelectorAll('.hcell.sortable').forEach((h) => {
      const on = h.dataset.sort === sortKey;
      h.classList.toggle('active', on);
      h.textContent = h.textContent.replace(/ [▲▼]$/, '') + (on ? (sortDir < 0 ? ' ▼' : ' ▲') : '');
    });
    const scroll = rowsEl.scrollTop;
    rowsEl.innerHTML = order.map((o, rank) => {
      const a = asts[o.i];
      const ppd = ppdOf(a);
      const num = (v, fmt, cls = '') => v != null
        ? `<span class="num ${cls}">${fmt(v)}</span>`
        : `<span class="num na ${cls}">—</span>`;
      return `<div class="exp-row exp-grid${rank < 3 ? ' top3' : ''}${o.i === selIdx ? ' sel' : ''}" data-i="${o.i}">
        <span class="rank">${rank + 1}</span>
        <span class="dot" style="background:${GROUP_HEX[a.group]}"></span>
        <span class="name">${a.name}${a.pha ? '<span class="pha-tag">PHA</span>' : ''}</span>
        ${num(a.price, fmtMoney)}
        ${num(a.profit, fmtMoney, 'hide-sm')}
        ${num(a.distKm, fmtDistShort)}
        ${num(ppd, fmtMoney, 'gold')}
      </div>`;
    }).join('');
    rowsEl.scrollTop = scroll;
  }

  toggle.addEventListener('click', () => {
    open = !open;
    box.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) render();
  });
  headEl.addEventListener('click', (e) => {
    const h = e.target.closest('.hcell.sortable');
    if (!h) return;
    const key = h.dataset.sort;
    if (key === sortKey) sortDir = -sortDir;
    else { sortKey = key; sortDir = DEFAULT_DIR[key]; }
    render();
  });
  rowsEl.addEventListener('click', (e) => {
    const row = e.target.closest('.exp-row');
    if (!row) return;
    const i = Number(row.dataset.i);
    select(i);
    flyToAsteroid(i);
    render();
  });
  // distances (and their ranks) drift with time — refresh while open
  setInterval(() => { if (open) render(); }, 1000);
  window.__expRender = render;
}

/* ============================================================
   Pointer input
   ============================================================ */
const pointers = new Map();

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  if (pointers.size === 1) {
    mouse.dragging = false;
    mouse.downX = e.clientX; mouse.downY = e.clientY;
    canvas.classList.add('dragging');
  } else if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    mouse.pinch = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    if (Math.hypot(e.clientX - mouse.downX, e.clientY - mouse.downY) > 4) mouse.dragging = true;
    if (mouse.dragging) {
      const k = 0.0042;
      ctrl.tTheta -= dx * k;
      ctrl.tPhi = THREE.MathUtils.clamp(ctrl.tPhi - dy * k, 0.05, Math.PI - 0.05);
      ctrl.vTheta = -dx * k;
      ctrl.vPhi = -dy * k;
    }
  } else if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (mouse.pinch > 0) {
      ctrl.tRadius = THREE.MathUtils.clamp(ctrl.tRadius * (mouse.pinch / d), ctrl.minR, ctrl.maxR);
    }
    mouse.pinch = d;
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    canvas.classList.remove('dragging');
    if (!mouse.dragging && e.type === 'pointerup') {
      // click or tap: pick at the release point (touch has no hover phase;
      // give fingers a more forgiving radius)
      select(pickAt(e.clientX, e.clientY, e.pointerType === 'touch' ? 24 : 14));
    }
    mouse.dragging = false;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { mouse.x = -1e4; mouse.y = -1e4; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.deltaMode === 1 ? 0.05 : 0.0016;
  ctrl.tRadius = THREE.MathUtils.clamp(ctrl.tRadius * Math.exp(e.deltaY * k), ctrl.minR, ctrl.maxR);
}, { passive: false });

/* ============================================================
   Grid parallax (site signature)
   ============================================================ */
{
  const gridFine = document.getElementById('grid-fine');
  let gx = 0, gy = 0, cx = 0, cy = 0, raf = null;
  addEventListener('mousemove', (e) => {
    gx = (e.clientX / innerWidth - 0.5) * 2;
    gy = (e.clientY / innerHeight - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(tick);
  });
  function tick() {
    raf = null;
    cx += (gx * 40 - cx) * 0.06;
    cy += (gy * 40 - cy) * 0.06;
    gridFine.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
    if (Math.abs(gx * 40 - cx) > 0.05) raf = requestAnimationFrame(tick);
  }
}

/* ============================================================
   Resize
   ============================================================ */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ============================================================
   Main loop
   ============================================================ */
const _eHelio = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _proj = new THREE.Vector3();
let lastT = performance.now();
let running = true;
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) { lastT = performance.now(); requestAnimationFrame(frame); }
});

function project(v, out) {
  // returns false if behind camera
  _proj.copy(v).applyMatrix4(camera.matrixWorldInverse);
  if (_proj.z > -0.01) return false;
  _proj.copy(v).project(camera);
  out.x = (_proj.x * 0.5 + 0.5) * innerWidth;
  out.y = (-_proj.y * 0.5 + 0.5) * innerHeight;
  return true;
}
const _s = { x: 0, y: 0 };

// px per world-unit at a given world position (for screen-constant sprites)
function pxScale(worldPos) {
  const d = camera.position.distanceTo(worldPos);
  return (2 * Math.tan(camera.fov * 0.5 * DEG) * d) / innerHeight;
}

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = THREE.MathUtils.clamp((now - lastT) / 1000, 0, 0.1);
  lastT = now;

  // ---- time ----
  simMs += dt * 1000 * warp;
  if (warp === 1) simMs = Date.now();
  const jd = jdOf(simMs);
  clockEl.textContent = fmtClock(simMs) + (warp !== 1 ? '  ·  ×' + warp.toLocaleString('en-US') : '');

  // ---- camera smoothing ----
  const smooth = 1 - Math.exp(-dt * 7.5);
  if (pointers.size === 0) {
    // inertia
    ctrl.vTheta *= Math.exp(-dt * 3.2);
    ctrl.vPhi *= Math.exp(-dt * 3.2);
    ctrl.tTheta += ctrl.vTheta * dt * 60 * 0.35;
    ctrl.tPhi = THREE.MathUtils.clamp(ctrl.tPhi + ctrl.vPhi * dt * 60 * 0.35, 0.05, Math.PI - 0.05);
  }
  ctrl.theta += (ctrl.tTheta - ctrl.theta) * smooth;
  ctrl.phi += (ctrl.tPhi - ctrl.phi) * smooth;
  ctrl.radius += (ctrl.tRadius - ctrl.radius) * (1 - Math.exp(-dt * 5.0));
  applyCamera();
  camera.updateMatrixWorld();
  radiusEl.textContent = fmtRadius(ctrl.radius);

  // ---- ephemerides ----
  earthHelio(jd, _eHelio);                       // AU
  eclToScene(-_eHelio.x * AU, -_eHelio.y * AU, -_eHelio.z * AU, sunScene);
  sunLight.position.copy(sunScene).normalize().multiplyScalar(10);
  sunSprite.position.copy(sunScene);
  earthUniforms.uSunDir.value.copy(sunScene).normalize();

  // Earth spin (GMST) — texture prime meridian offset
  earthMesh.rotation.y = gmstRad(jd);

  // Moon
  moonGeo(jd, _tmp);                             // km ecliptic
  eclToScene(_tmp.x / ER_KM, _tmp.y / ER_KM, _tmp.z / ER_KM, moonMesh.position);

  // Orbit lines follow the sun
  earthOrbitLine.position.copy(sunScene);
  selOrbitLine.position.copy(sunScene);
  if (earthOrbitLine.userData.filled !== true) {
    fillOrbit(earthOrbitLine, earthElements(jd));
    earthOrbitLine.userData.filled = true;
  }
  earthOrbitLine.material.opacity = 0.10 * THREE.MathUtils.smoothstep(ctrl.radius, 900, 6000);
  orbitCloud.position.copy(sunScene);
  const cloudOp = 0.05 * THREE.MathUtils.smoothstep(ctrl.radius, 0.4 * AU, 1.8 * AU);
  orbitCloud.material.opacity = cloudOp;
  orbitCloud.visible = cloudOp > 0.003;

  // ---- asteroids ----
  const sizeAttr = astGeom.getAttribute('aSize');
  for (let i = 0; i < N_AST; i++) {
    const a = asts[i];
    helioPos(a.el, jd, _tmp);
    a.helio.copy(_tmp);
    eclToScene((_tmp.x - _eHelio.x) * AU, (_tmp.y - _eHelio.y) * AU, (_tmp.z - _eHelio.z) * AU, a.scenePos);
    a.distKm = a.scenePos.length() * ER_KM;
    astPos[i * 3] = a.scenePos.x;
    astPos[i * 3 + 1] = a.scenePos.y;
    astPos[i * 3 + 2] = a.scenePos.z;
    a.on = project(a.scenePos, _s);
    a.sx = _s.x; a.sy = _s.y;
    // smooth size toward hover/selection state
    const target = a.baseSize * (i === hoverIdx ? 1.9 : i === selIdx ? 1.5 : 1);
    sizeAttr.array[i] += (target - sizeAttr.array[i]) * Math.min(dt * 12, 1);
  }
  astGeom.getAttribute('position').needsUpdate = true;
  sizeAttr.needsUpdate = true;

  // ---- hover pick (only while no button is down; a press must not clear
  // the hover state, or the release would have nothing to select) ----
  if (pointers.size === 0) {
    const best = pickAt(mouse.x, mouse.y, 14);
    if (best !== hoverIdx) {
      hoverIdx = best;
      canvas.classList.toggle('hovering', best >= 0);
      if (best >= 0) { tipEl.innerHTML = tipHTML(asts[best]); tipEl.classList.add('on'); }
      else tipEl.classList.remove('on');
    }
  } else if (mouse.dragging && hoverIdx !== -1) {
    hoverIdx = -1;
    canvas.classList.remove('hovering');
    tipEl.classList.remove('on');
  }
  if (hoverIdx >= 0) {
    const a = asts[hoverIdx];
    tipEl.innerHTML = tipHTML(a);
    const tw = tipEl.offsetWidth, sxr = a.sx + 18 + tw > innerWidth;
    tipEl.style.left = (sxr ? a.sx - 18 - tw : a.sx + 18) + 'px';
    tipEl.style.top = Math.min(a.sy + 12, innerHeight - tipEl.offsetHeight - 90) + 'px';
  }

  // ---- selection visuals ----
  if (selIdx >= 0) {
    const a = asts[selIdx];
    selRing.position.copy(a.scenePos);
    const px = pxScale(a.scenePos);
    selRing.scale.setScalar(px * 34);
    selRing.material.opacity = 0.75 + Math.sin(now * 0.004) * 0.2;
    selRing.material.rotation = now * 0.0006;
    if (a.on) {
      selLabel.style.opacity = '1';
      selLabel.style.left = a.sx + 'px';
      selLabel.style.top = (a.sy + 16) + 'px';
    } else selLabel.style.opacity = '0';
    // live distance row refresh
    const distEl = document.getElementById('p-dist');
    if (distEl) distEl.textContent = fmtDist(a.distKm);
  }

  // ---- labels: moon & earth ----
  const moonVis = ctrl.radius > 6 && ctrl.radius < 2600 && project(moonMesh.position, _s);
  moonLabel.style.opacity = moonVis ? '0.8' : '0';
  if (moonVis) { moonLabel.style.left = _s.x + 'px'; moonLabel.style.top = (_s.y + 10) + 'px'; }
  const earthFar = ctrl.radius > 320;
  earthMarker.material.opacity = earthFar ? 0.85 : 0;
  earthMarker.scale.setScalar(pxScale(earthMarker.position) * 22);
  const earthVis = earthFar && project(earthMarker.position, _s);
  earthLabel.style.opacity = earthVis ? '0.9' : '0';
  if (earthVis) { earthLabel.style.left = _s.x + 'px'; earthLabel.style.top = (_s.y + 12) + 'px'; }

  // ---- distance rings ----
  for (const ring of RINGS) {
    const x = Math.log(ctrl.radius / ring.r);
    const op = Math.max(0, 1 - Math.abs(x - 1.1) / 1.7) * 0.20;
    ring.line.material.opacity = op;
    let lv = false;
    if (op > 0.02) {
      _tmp.set(Math.sin(ctrl.theta) * ring.r, 0, Math.cos(ctrl.theta) * ring.r);
      lv = project(_tmp, _s);
    }
    ring.el.style.opacity = lv ? (op * 4.5).toFixed(2) : '0';
    if (lv) { ring.el.style.left = _s.x + 'px'; ring.el.style.top = _s.y + 'px'; }
  }

  // ---- stars ----
  scene.userData.starMat.uniforms.uTime.value = now * 0.001;

  renderer.render(scene, camera);
}

/* ============================================================
   Boot: textures, veil, intro
   ============================================================ */
const veil = document.getElementById('veil');
const veilStatus = document.getElementById('veil-status');
veilStatus.textContent = 'Charting ' + N_AST + ' prospects';

Promise.race([
  Promise.all([loadTex(TEX.day), loadTex(TEX.night)]),
  new Promise((res) => setTimeout(() => res([null, null]), 9000)),
]).then(([day, night]) => {
  if (day) earthUniforms.uDay.value = day;
  if (night) earthUniforms.uNight.value = night;
  veil.classList.add('lifted');
  document.body.classList.add('ready');
  // cinematic pull-back from low orbit
  ctrl.tRadius = 14;
  if (!reduceMotion) ctrl.tTheta += 0.55;
});

requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });

// Debug hook: lets tooling drive frames when rAF is unavailable (hidden tab)
window.__dbg = {
  frame(t) { const r = running; running = true; frame(t); running = r; },
  ctrl, select, canvas, renderer, asts, pointers, mouse, pickAt,
  get hoverIdx() { return hoverIdx; },
};
