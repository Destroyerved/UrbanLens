"use client";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import * as THREE from "three";

/**
 * useTextures
 * Loads all Earth textures from /public/textures/.
 * Wrapped in Suspense by the parent — useLoader throws a Promise while loading.
 */
export function useTextures() {
  const [dayMap, nightMap, normalMap, specularMap, cloudsMap] = useLoader(
    TextureLoader,
    [
      "/textures/earth_day.jpg",
      "/textures/earth_night.jpg",
      "/textures/earth_normal.jpg",
      "/textures/earth_specular.jpg",
      "/textures/clouds_alpha.jpg",
    ]
  );

  // Set correct colour space for colour textures
  if (dayMap) (dayMap as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
  if (nightMap) (nightMap as THREE.Texture).colorSpace = THREE.SRGBColorSpace;

  return {
    dayMap: dayMap as THREE.Texture,
    nightMap: nightMap as THREE.Texture,
    normalMap: normalMap as THREE.Texture,
    specularMap: specularMap as THREE.Texture,
    cloudsMap: cloudsMap as THREE.Texture,
  };
}
