import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SCENE_UNIT_KM, planeToScene } from "../sim/orbit";
import { MARKER_FRACTION, displaySize } from "./screenSize";
import { Spacecraft, type Selection } from "../ships/Spacecraft";

type PlanePos = () => { x: number; y: number };

interface ShipProps {
  pos: PlanePos;
  inclination_deg: number;
  /** Tamaño real de la nave, km. */
  realSize_km: number;
  /** Desplazamiento en múltiplos del tamaño dibujado, para mostrar dos naves juntas. */
  offset?: [number, number, number];
}

/** Coloca la nave en su órbita y le da tamaño real o, si no se vería, un tamaño mínimo en pantalla. */
function useShip({ pos, inclination_deg, realSize_km, offset }: ShipProps) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = pos();
    g.position.set(...planeToScene(p.x, p.y, inclination_deg));
    const size = displaySize(camera, g.position, realSize_km / SCENE_UNIT_KM, MARKER_FRACTION);
    if (offset) g.position.add(new THREE.Vector3(...offset).multiplyScalar(size));
    g.scale.setScalar(size);
    g.lookAt(0, 0, 0);
  });
  return group;
}

/** Normaliza un modelo para que su dimensión mayor mida 1. */
function useNormalized(url: string) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const model = scene.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    return { model, scale: 1 / Math.max(size.x, size.y, size.z, 1e-9) };
  }, [scene]);
}

/** Satélite objetivo: modelo del Hubble de NASA, sin modificar (public/CREDITS.md). */
const HUBBLE_URL = "/models/hubble.glb";
/** Longitud del Hubble, km (13,2 m). */
const HUBBLE_LENGTH_KM = 0.0132;

export function TargetSatellite(props: Omit<ShipProps, "realSize_km">) {
  const group = useShip({ ...props, realSize_km: HUBBLE_LENGTH_KM });
  const { model, scale } = useNormalized(HUBBLE_URL);
  return (
    <group ref={group}>
      <primitive object={model} scale={scale} />
    </group>
  );
}

useGLTF.preload(HUBBLE_URL);

/** Vehículo de servicio con la carga elegida en el hangar (modelo low poly propio, unos 8 m). */
export function Servicer(props: Omit<ShipProps, "realSize_km"> & { selected: Selection }) {
  const group = useShip({ ...props, realSize_km: 0.008 });
  return (
    <group ref={group}>
      <Spacecraft kind="servicer" selected={props.selected} />
    </group>
  );
}

/** Satélite de observación armado en el hangar (modelo low poly propio, unos 1,5 m). */
export function SmallSat(props: Omit<ShipProps, "realSize_km"> & { selected: Selection }) {
  const group = useShip({ ...props, realSize_km: 0.0015 });
  return (
    <group ref={group}>
      <Spacecraft kind="smallsat" selected={props.selected} />
    </group>
  );
}
