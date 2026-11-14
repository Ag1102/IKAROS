import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { planeToScene } from "../sim/orbit";

type PlanePos = () => { x: number; y: number };

interface ShipProps {
  pos: PlanePos;
  inclination_deg: number;
  /** Desplazamiento en unidades de escena, para mostrar ambos vehículos cerca. */
  offset?: [number, number, number];
}

function useShip({ pos, inclination_deg, offset }: ShipProps) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = pos();
    const [x, y, z] = planeToScene(p.x, p.y, inclination_deg);
    g.position.set(x + (offset?.[0] ?? 0), y + (offset?.[1] ?? 0), z + (offset?.[2] ?? 0));
    g.lookAt(0, 0, 0);
  });
  return group;
}

// El vehículo de servicio es un modelo low poly propio; el objetivo es de NASA.

/** Satélite objetivo: modelo del Hubble de NASA, sin modificar (public/CREDITS.md). */
const HUBBLE_URL = "/models/hubble.glb";
const HUBBLE_SIZE = 1.0; // dimensión mayor en unidades de escena

export function TargetSatellite(props: ShipProps) {
  const group = useShip(props);
  const { scene } = useGLTF(HUBBLE_URL);
  const { model, scale } = useMemo(() => {
    const model = scene.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    return { model, scale: HUBBLE_SIZE / Math.max(size.x, size.y, size.z, 1e-6) };
  }, [scene]);
  return (
    <group ref={group}>
      <primitive object={model} scale={scale} />
    </group>
  );
}

useGLTF.preload(HUBBLE_URL);

/** Vehículo de servicio. */
export function Servicer(props: ShipProps) {
  const group = useShip(props);
  return (
    <group ref={group} scale={0.16}>
      <mesh>
        <boxGeometry args={[0.9, 0.9, 1.3]} />
        <meshStandardMaterial color="#e6e8e9" flatShading roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, -0.8]}>
        <cylinderGeometry args={[0.35, 0.5, 0.4, 6]} />
        <meshStandardMaterial color="#e0a030" flatShading />
      </mesh>
      <mesh position={[1.1, 0, 0]}>
        <boxGeometry args={[1.3, 0.05, 0.7]} />
        <meshStandardMaterial color="#27415f" flatShading />
      </mesh>
      <mesh position={[-1.1, 0, 0]}>
        <boxGeometry args={[1.3, 0.05, 0.7]} />
        <meshStandardMaterial color="#27415f" flatShading />
      </mesh>
    </group>
  );
}
