// Reference copy — the shader actually used lives in shaders/atmosphere.ts
// (no raw-loader configuration required). Keep the two in sync if you edit.
uniform vec3 uColor;
uniform vec3 uSunDirection;
uniform float uIntensity;

varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  float fresnel = pow(1.0 - abs(dot(N, V)), 4.2);
  float lit = smoothstep(-0.6, 0.5, dot(N, normalize(uSunDirection)));
  gl_FragColor = vec4(uColor, fresnel * (0.16 + lit * 0.84) * uIntensity);
}
