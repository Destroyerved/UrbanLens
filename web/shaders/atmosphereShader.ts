// Atmosphere GLSL shaders for the Earth globe
// Fresnel rim glow effect using BackSide rendering + AdditiveBlending

export const atmosphereVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const atmosphereFragmentShader = /* glsl */`
  uniform vec3 glowColor;
  uniform float glowIntensity;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Fresnel factor: bright at the edges, dark in the centre
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    intensity = clamp(intensity * glowIntensity, 0.0, 1.0);
    gl_FragColor = vec4(glowColor, intensity);
  }
`;

export const outerHaloFragmentShader = /* glsl */`
  uniform vec3 glowColor;
  uniform float glowIntensity;
  varying vec3 vNormal;

  void main() {
    float intensity = pow(0.5 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
    intensity = clamp(intensity * glowIntensity * 0.6, 0.0, 1.0);
    gl_FragColor = vec4(glowColor, intensity);
  }
`;
