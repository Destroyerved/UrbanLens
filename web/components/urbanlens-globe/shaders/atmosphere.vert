// Reference copy — the shader actually used lives in shaders/atmosphere.ts
// (no raw-loader configuration required). Keep the two in sync if you edit.
varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
