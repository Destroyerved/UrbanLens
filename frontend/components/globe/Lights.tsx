"use client";

/**
 * Lights — directional sun light + ambient fill.
 */
export default function Lights() {
  return (
    <>
      {/* Sun - directional, bright */}
      <directionalLight
        position={[5, 3, 5]}
        intensity={1.4}
        color="#fff8f0"
      />
      {/* Ambient fill — keeps night side from being pitch black */}
      <ambientLight intensity={0.15} color="#c8d8ff" />
      {/* Subtle rim from the opposite side to add depth */}
      <directionalLight
        position={[-4, -2, -4]}
        intensity={0.08}
        color="#3a6aff"
      />
    </>
  );
}
