import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SCENE_UNIT_KM, planeToScene } from "../sim/orbit";
import { MARKER_FRACTION, displaySize } from "./screenSize";
import { MODELS, type NasaModelInfo } from "../ships/models";

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

/** Normaliza un modelo para que su dimensión mayor mida 1 y quede centrado. */
function useNormalized(url: string) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const model = scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = 1 / Math.max(size.x, size.y, size.z, 1e-9);
    model.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
    model.scale.setScalar(scale);
    return model;
  }, [scene]);
}

/** Nave con un modelo de NASA sin modificar (public/CREDITS.md), a tamaño real o mínimo visible. */
function NasaShip({ model, ...props }: ShipProps & { model: NasaModelInfo }) {
  const group = useShip(props);
  const object = useNormalized(model.url);
  return (
    <group ref={group}>
      <primitive object={object} />
    </group>
  );
}

/** Destino del nivel 1: la Estación Espacial Internacional. */
export function Station(props: Omit<ShipProps, "realSize_km">) {
  return <NasaShip {...props} model={MODELS.iss} realSize_km={MODELS.iss.size_km} />;
}

/** Nave del nivel 1: el transbordador, que se acopló a la ISS entre 1998 y 2011. */
export function Servicer(props: Omit<ShipProps, "realSize_km">) {
  return <NasaShip {...props} model={MODELS.shuttle} realSize_km={MODELS.shuttle.size_km} />;
}

for (const m of [MODELS.iss, MODELS.shuttle]) useGLTF.preload(m.url);
