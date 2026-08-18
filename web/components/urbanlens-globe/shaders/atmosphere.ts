/**
 * Atmospheric rim (Fresnel).
 *
 * Kept as exported strings rather than .vert/.frag files on purpose: importing
 * raw shader files needs a webpack/turbopack loader, and this module is meant
 * to drop into an existing Next.js app with zero build configuration.
 * `shaders/atmosphere.vert` / `.frag` mirror these for reference only.
 */

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDirection;
  uniform float uIntensity;

  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);

    // rim: brightest exactly at the limb, invisible face-on
    float fresnel = pow(1.0 - abs(dot(N, V)), 4.2);

    // the atmosphere is lit by the sun, so the dark limb stays dark
    float lit = smoothstep(-0.6, 0.5, dot(N, normalize(uSunDirection)));

    gl_FragColor = vec4(uColor, fresnel * (0.16 + lit * 0.84) * uIntensity);
  }
`;
