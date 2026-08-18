import * as THREE from "three";

/**
 * Fixed world-space sun. The globe rotates beneath it, so the terminator
 * stays composed in frame: lit limb screen-left, night limb + city lights screen-right.
 */
export const SUN_DIR = new THREE.Vector3(-1.5, 0.55, 0.9).normalize();

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vNormalV;
varying vec3 vPosW;

void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vNormalV = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/* ------------------------------------------------------------------ */
/* Earth surface — NASA Blue Marble day / Black Marble night           */
/* ------------------------------------------------------------------ */

const EARTH_FRAG = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uOcean;
uniform vec3 uSunDir;
uniform vec3 uAtmColor;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSunDir);

  float sunDot = dot(N, L);
  float dayF = smoothstep(-0.12, 0.32, sunDot);

  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 nightTex = texture2D(uNight, vUv).rgb;
  float ocean = texture2D(uOcean, vUv).r;

  // day side — soft spherical shading
  vec3 dayLit = day * (0.14 + 1.02 * max(sunDot, 0.0));

  // subtle sun glint on water only
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 48.0) * ocean;
  dayLit += vec3(0.42, 0.55, 0.65) * spec * 0.5 * dayF;

  // night side — faint moonlit earth + warm city lights
  float lightsF = smoothstep(0.10, -0.30, sunDot);
  vec3 lights = pow(nightTex, vec3(1.35)) * vec3(1.0, 0.82, 0.55) * 1.5;
  vec3 nightSide = day * vec3(0.012, 0.018, 0.032) + lights * lightsF;

  vec3 color = mix(nightSide, dayLit, dayF);

  // thin fresnel scattering hugging the limb
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
  color += uAtmColor * fres * (0.10 + 0.55 * dayF);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createEarthMaterial(
  day: THREE.Texture,
  night: THREE.Texture,
  ocean: THREE.Texture
) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: EARTH_FRAG,
    uniforms: {
      uDay: { value: day },
      uNight: { value: night },
      uOcean: { value: ocean },
      uSunDir: { value: SUN_DIR.clone() },
      uAtmColor: { value: new THREE.Color(0.24, 0.55, 0.92) },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Cloud layer — separate sphere, drifts independently                 */
/* ------------------------------------------------------------------ */

const CLOUDS_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSunDir;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  float a = texture2D(uMap, vUv).a * uOpacity;
  float sunDot = dot(normalize(vNormalW), normalize(uSunDir));
  float dayF = smoothstep(-0.18, 0.30, sunDot);
  vec3 col = mix(vec3(0.05, 0.08, 0.16), vec3(0.985, 0.99, 1.0), dayF);
  gl_FragColor = vec4(col, a * (0.22 + 0.78 * dayF));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createCloudsMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: CLOUDS_FRAG,
    uniforms: {
      uMap: { value: map },
      uSunDir: { value: SUN_DIR.clone() },
      uOpacity: { value: 0.85 },
    },
    transparent: true,
    depthWrite: false,
  });
}

/* ------------------------------------------------------------------ */
/* Atmosphere — thin backside rim, sun-weighted, never a neon halo     */
/* ------------------------------------------------------------------ */

const ATMO_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uIntensity;

varying vec3 vNormalV;
varying vec3 vNormalW;

void main() {
  // backside sphere: view-space normal.z is -1 at disk centre, 0 at the edge.
  float d = dot(normalize(vNormalV), vec3(0.0, 0.0, 1.0));
  float rim = pow(clamp(-d, 0.0, 1.0), 2.1);
  float sunF = 0.30 + 0.70 * clamp(dot(normalize(vNormalW), normalize(uSunDir)) * 0.7 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.10, 0.32, 0.72), vec3(0.35, 0.78, 1.0), rim);
  float a = rim * sunF * uIntensity;
  gl_FragColor = vec4(col * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: ATMO_FRAG,
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uIntensity: { value: 3.5 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/* ------------------------------------------------------------------ */
/* Fallback — procedural dark planet if textures fail to load         */
/* ------------------------------------------------------------------ */

const FALLBACK_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uAtmColor;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSunDir);
  float sunDot = dot(N, L);
  float dayF = smoothstep(-0.12, 0.32, sunDot);

  float n = noise(vUv * vec2(14.0, 7.0)) * 0.6 + noise(vUv * vec2(42.0, 21.0)) * 0.4;
  vec3 base = mix(vec3(0.012, 0.05, 0.10), vec3(0.05, 0.11, 0.19), smoothstep(0.42, 0.78, n));
  vec3 lit = base * (0.16 + 1.0 * max(sunDot, 0.0));
  vec3 dark = base * vec3(0.05, 0.07, 0.12);
  vec3 color = mix(dark, lit, dayF);

  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
  color += uAtmColor * fres * (0.12 + 0.5 * dayF);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createFallbackMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FALLBACK_FRAG,
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uAtmColor: { value: new THREE.Color(0.24, 0.55, 0.92) },
    },
  });
}
