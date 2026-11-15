import { Suspense, type MutableRefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { Sky } from "./space/Sky";
import { Bloom } from "./space/Bloom";
import { DistantSun } from "./space/DistantSun";
import * as THREE from "three";
import type { SimState } from "@ikaros/contracts";
import { Earth } from "./Earth";
import { Servicer, Station } from "./Ships";
import { FollowControls } from "./FollowControls";
import { OrbitRing } from "./OrbitRing";
import { C } from "../data/sources";
import { SCENE_UNIT_KM, planeToScene } from "../sim/orbit";

const HOME = new THREE.Vector3(0, 0, 0);
const OVERVIEW = new THREE.Vector3(19, 9, 22);
const deg = Math.PI / 180;

const point = (alt_km: number, angle_rad: number) => {
  const r = C.earthRadius + alt_km;
  return { x: r * Math.cos(angle_rad), y: r * Math.sin(angle_rad) };
};

interface Props {
  latest: MutableRefObject<SimState>;
  /** Inclinación de la órbita de la ISS, grados (del motor). */
  inclination_deg: number;
  follow: boolean;
}

/**
 * Vista orbital del nivel 1: la Tierra, la órbita de la ISS y la del transbordador, con las
 * posiciones que calcula el motor. El Sol está en el ángulo 0 del plano orbital, como en el motor,
 * así que la noche de la escena coincide con la noche orbital.
 */
export function Scene({ latest, inclination_deg, follow }: Props) {
  const inc = inclination_deg;
  const sunDir = new THREE.Vector3(...planeToScene(1, 0, inc)).normalize();
  const shipPos = () => {
    const s = latest.current;
    return point(s.altitude_km ?? 0, (s.orbit_angle_deg ?? 0) * deg);
  };
  const issPos = () => {
    const s = latest.current;
    return point(s.target_altitude_km ?? 0, (s.target_orbit_angle_deg ?? 0) * deg);
  };
  // Cerca de la ISS las dos naves se dibujan una al lado de la otra para que se distingan.
  const close = () => Math.abs(latest.current.separation_km ?? Infinity) < 30;

  return (
    <Canvas camera={{ position: [19, 9, 22], fov: 40, near: 0.001, far: 400 }} dpr={[1, 2]}>
      <color attach="background" args={["#020407"]} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={["#9fc4ff", "#000000", 0.18]} />
      <directionalLight position={sunDir.clone().multiplyScalar(50)} intensity={3} />
      <Suspense fallback={null}>
        <Sky radius={350} />
      </Suspense>
      <Stars radius={120} depth={30} count={1200} factor={2.5} saturation={0} fade={false} />
      <DistantSun direction={sunDir} distance={300} />
      <Suspense fallback={null}>
        <Earth radius={C.earthRadius / SCENE_UNIT_KM} sun={sunDir} />
      </Suspense>
      <OrbitRing
        inclination_deg={inc}
        altitude={() => latest.current.target_altitude_km ?? null}
        color="#5fb4c4"
        opacity={0.5}
      />
      <OrbitRing
        inclination_deg={inc}
        altitude={() => (close() ? null : (latest.current.altitude_km ?? null))}
        color="#e0a030"
        opacity={0.8}
      />
      <Suspense fallback={null}>
        <Station pos={issPos} inclination_deg={inc} />
      </Suspense>
      <Suspense fallback={null}>
        <Servicer pos={shipPos} inclination_deg={inc} offset={[1.2, 0.3, 0]} />
      </Suspense>
      <FollowControls
        follow={follow}
        home={HOME}
        homeOffset={OVERVIEW}
        minDistance={0.8}
        maxDistance={80}
        getTarget={() => {
          const t = shipPos();
          return new THREE.Vector3(...planeToScene(t.x, t.y, inc));
        }}
        offset={() => {
          const t = shipPos();
          const r = Math.hypot(t.x, t.y);
          const out = new THREE.Vector3(...planeToScene(t.x / r, t.y / r, inc)).multiplyScalar(SCENE_UNIT_KM);
          const tan = new THREE.Vector3(...planeToScene(-t.y / r, t.x / r, inc)).multiplyScalar(SCENE_UNIT_KM);
          return out
            .multiplyScalar(1.6)
            .addScaledVector(tan, -2.6)
            .add(new THREE.Vector3(0, 0.8, 0));
        }}
      />
      <Bloom strength={0.6} threshold={0.95} />
    </Canvas>
  );
}
