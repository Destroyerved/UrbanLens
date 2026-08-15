"use client";

/**
 * GlobePlaceholder — shown by Suspense while textures are still loading.
 * A wireframe sphere so the user sees something immediately.
 */
export default function GlobePlaceholder() {
  return (
    <mesh>
      <sphereGeometry args={[2.5, 24, 24]} />
      <meshBasicMaterial color="#1a3a5c" wireframe opacity={0.4} transparent />
    </mesh>
  );
}
