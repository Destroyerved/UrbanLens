/**
 * Earth surface shader.
 *
 * Day/night blending across a soft terminator, a single restrained ocean
 * specular, a warm sliver at the day/night boundary, and an optional analysis
 * "scan" band used when the intelligence layers come up.
 */

export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uOcean;
  uniform vec3 uSunDirection;
  uniform vec3 uRimColor;
  uniform float uNightIntensity;
  uniform float uExposure;
  uniform float uRimStrength;
  uniform float uScanY;
  uniform float uScanAmount;
  uniform vec3 uScanColor;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uSunDirection);
    vec3 V = normalize(vViewDir);

    float sun = dot(N, L);
    float dayAmount = smoothstep(-0.18, 0.42, sun);

    vec3 day = texture2D(uDay, vUv).rgb * uExposure;
    vec3 night = texture2D(uNight, vUv).rgb * uNightIntensity;
    float ocean = texture2D(uOcean, vUv).r;

    vec3 color = mix(night, day, dayAmount);

    // one soft specular lobe on water only — never a hotspot on land
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 46.0) * ocean * 0.55 * dayAmount;
    color += vec3(0.40, 0.60, 0.95) * spec;

    // warm scatter along the terminator
    color += vec3(0.16, 0.09, 0.04) * smoothstep(0.34, 0.0, abs(sun)) * 0.5;

    // atmospheric rim on the surface itself, so the limb never goes flat
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.1);
    color += uRimColor * fresnel * (0.3 + 0.7 * smoothstep(-0.55, 0.6, sun)) * uRimStrength;

    // slow analysis sweep
    float band = smoothstep(0.03, 0.0, abs(vUv.y - uScanY));
    color += uScanColor * band * uScanAmount * 0.4;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Procedural cloud deck, used when no cloud texture is installed. */
export const cloudFragmentProcedural = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vec2(vUv.x * 13.0 + uTime * 0.01, vUv.y * 6.5);
    float n = fbm(p + fbm(p * 1.7) * 0.55);

    float lat = abs(vUv.y - 0.5) * 2.0;
    float cover = smoothstep(0.56, 0.92, n) * (1.0 - smoothstep(0.72, 1.0, lat));

    vec3 N = normalize(vNormalW);
    float lit = smoothstep(-0.12, 0.5, dot(N, normalize(uSunDirection)));
    float fres = pow(1.0 - max(dot(N, normalize(vViewDir)), 0.0), 2.0);

    vec3 color = mix(vec3(0.26, 0.39, 0.58), vec3(0.95, 0.97, 1.0), lit);
    gl_FragColor = vec4(color, cover * uOpacity * (0.22 + lit * 0.78) * (0.7 + fres * 0.45));
  }
`;

/** Cloud deck driven by an alpha texture (earth-clouds.png). */
export const cloudFragmentTextured = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSunDirection;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vec4 tex = texture2D(uClouds, vUv);
    // NASA cloud plates are white-on-black: use luminance when alpha is opaque
    float cover = tex.a < 0.99 ? tex.a : max(tex.r, max(tex.g, tex.b));

    vec3 N = normalize(vNormalW);
    float lit = smoothstep(-0.12, 0.5, dot(N, normalize(uSunDirection)));
    float fres = pow(1.0 - max(dot(N, normalize(vViewDir)), 0.0), 2.0);

    vec3 color = mix(vec3(0.26, 0.39, 0.58), vec3(0.96, 0.98, 1.0), lit);
    gl_FragColor = vec4(color, cover * uOpacity * (0.2 + lit * 0.8) * (0.7 + fres * 0.4));
  }
`;
