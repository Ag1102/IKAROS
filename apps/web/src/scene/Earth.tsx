import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// Tierra con la textura de NASA (Earth (A)), sin modificar. Ver public/CREDITS.md.
export function Earth({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const map = useTexture("/textures/earth.jpg");
  map.colorSpace = THREE.SRGBColorSpace;

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.02;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[radius, 64, 48]} />
      <meshStandardMaterial map={map} roughness={1} metalness={0} />
    </mesh>
  );
}
