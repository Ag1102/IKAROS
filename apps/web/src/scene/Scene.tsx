import { Suspense, useRef, type MutableRefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import type { SimState } from "@ikaros/contracts";
import { Earth } from "./Earth";
import { Servicer, TargetSatellite } from "./Ships";
import { FollowControls } from "./FollowControls";
import { OrbitRing } from "./OrbitRing";
import type { Selection } from "../ships/Spacecraft";
import { C } from "../data/sources";
import { SCENE_UNIT_KM, planeToScene } from "../sim/orbit";

/** Inclinación de la órbita del Hubble (28,5°), solo para la vista. Pendiente de pasar a data/. */
const INCLINATION_DEG = 28.5;
/** Adelanto visual del objetivo por km de diferencia de altitud (el motor no modela la fase). */
const LEAD_RAD_PER_KM = 0.004;
const HOME = new THREE.Vector3(0, 0, 0);
const OVERVIEW = new THREE.Vector3(19, 9, 22);

const meanMotion = (alt_km: number) => Math.sqrt(C.muEarth / (C.earthRadius + alt_km) ** 3);

/** Ángulos de las naves, integrados con el tiempo de misión del motor. */
function useAngles(latest: MutableRefObject<SimState>) {
  const angle = useRef(0);
  const lastT = useRef<number | null>(null);
  const read = () => {
    const s = latest.current;
    const t = s.resources.mission_elapsed_s;
    if (lastT.current !== null && t > lastT.current) {
      angle.current += meanMotion(s.altitude_km ?? 0) * (t - lastT.current);
    }
    lastT.current = t;
    return angle.current;
  };
  return read;
}

const point = (alt_km: number, angle: number) => {
  const r = C.earthRadius + alt_km;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
};

interface Props {
  latest: MutableRefObject<SimState>;
  docked: boolean;
  /** Altitud que dejaría el encendido que se está preparando, km. */
  previewAltitude: number | null;
  follow: boolean;
  selected: Selection;
}

export function Scene({ latest, docked, previewAltitude, follow, selected }: Props) {
  const angleOf = useAngles(latest);
  const previewRef = useRef(previewAltitude);
  previewRef.current = previewAltitude;

  const servicerPos = () => point(latest.current.altitude_km ?? 0, angleOf());
  const targetPos = () => {
    const s = latest.current;
    const diff = Math.abs((s.target_altitude_km ?? 0) - (s.altitude_km ?? 0));
    const lead = docked ? 0 : Math.min(0.6, diff * LEAD_RAD_PER_KM);
    return point(s.target_altitude_km ?? 0, angleOf() + lead);
  };

  return (
    <Canvas camera={{ position: [19, 9, 22], fov: 40, near: 0.001, far: 400 }} dpr={[1, 2]}>
      <color attach="background" args={["#070b0e"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[30, 12, 18]} intensity={2.4} />
      <Stars radius={120} depth={30} count={1800} factor={3} saturation={0} fade={false} />
      <Suspense fallback={null}>
        <Earth radius={C.earthRadius / SCENE_UNIT_KM} />
      </Suspense>
      <OrbitRing
        inclination_deg={INCLINATION_DEG}
        altitude={() => latest.current.target_altitude_km ?? null}
        color="#5fb4c4"
        opacity={0.5}
      />
      <OrbitRing
        inclination_deg={INCLINATION_DEG}
        altitude={() => (docked ? null : (latest.current.altitude_km ?? null))}
        color="#e0a030"
        opacity={0.8}
      />
      <OrbitRing
        inclination_deg={INCLINATION_DEG}
        altitude={() => previewRef.current}
        color="#e6e8e9"
        opacity={0.7}
        dashed
      />
      <Suspense fallback={null}>
        <TargetSatellite pos={targetPos} inclination_deg={INCLINATION_DEG} />
      </Suspense>
      <Servicer
        selected={selected}
        pos={docked ? targetPos : servicerPos}
        inclination_deg={INCLINATION_DEG}
        offset={docked ? [1.1, 0.4, 0] : undefined}
      />
      <FollowControls
        follow={follow}
        home={HOME}
        homeOffset={OVERVIEW}
        minDistance={0.8}
        maxDistance={80}
        getTarget={() => {
          const t = targetPos();
          return new THREE.Vector3(...planeToScene(t.x, t.y, INCLINATION_DEG));
        }}
        offset={() => {
          const t = targetPos();
          const r = Math.hypot(t.x, t.y);
          const out = new THREE.Vector3(...planeToScene(t.x / r, t.y / r, INCLINATION_DEG)).multiplyScalar(
            SCENE_UNIT_KM,
          );
          const tan = new THREE.Vector3(...planeToScene(-t.y / r, t.x / r, INCLINATION_DEG)).multiplyScalar(
            SCENE_UNIT_KM,
          );
          return out
            .multiplyScalar(1.6)
            .addScaledVector(tan, -2.6)
            .add(new THREE.Vector3(0, 0.8, 0));
        }}
      />
    </Canvas>
  );
}
