import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Sun, SUN_RADIUS } from "./Sun";

/**
 * El Sol animado del menú, lejos y en la dirección de la luz de la escena. Con `distance` y
 * el radio aparente real (~0,27° visto desde la Tierra) se ve del tamaño correcto en el cielo.
 */
export function DistantSun({
  direction,
  distance,
  apparentRadius_deg = 0.27,
}: {
  direction: THREE.Vector3 | (() => THREE.Vector3);
  distance: number;
  apparentRadius_deg?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const dir = typeof direction === "function" ? direction() : direction;
    ref.current?.position.copy(dir).normalize().multiplyScalar(distance);
  });
  const scale = (Math.tan((apparentRadius_deg * Math.PI) / 180) * distance) / SUN_RADIUS;
  return (
    <group ref={ref} scale={scale}>
      <Sun />
    </group>
  );
}
