import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { FollowControls } from "./FollowControls";
import * as THREE from "three";
import { Earth } from "./Earth";
import { Servicer, TargetSatellite } from "./Ships";
import { EARTH_RADIUS_KM, SCENE_UNIT_KM, planeToScene } from "../sim/orbit";
import type { Level1, Orbit, Phase } from "../level1/game";
import { LEVEL1_GEOMETRY } from "../level1/game";

interface Props {
  game: Level1;
  phase: Phase;
  servicer: Orbit;
  preview: Orbit | null;
  follow: boolean;
  docked: boolean;
}

function EllipseLine({
  orbit,
  color,
  opacity = 0.6,
  dashed = false,
}: {
  orbit: Orbit;
  color: string;
  opacity?: number;
  dashed?: boolean;
}) {
  const line = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const p = orbit.a * (1 - orbit.e * orbit.e);
    for (let i = 0; i < 240; i++) {
      const nu = (i / 240) * Math.PI * 2;
      const r = p / (1 + orbit.e * Math.cos(nu));
      const ang = orbit.w + nu;
      const [x, y, z] = planeToScene(r * Math.cos(ang), r * Math.sin(ang), LEVEL1_GEOMETRY.inclination_deg);
      pts.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.25, gapSize: 0.18 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const l = new THREE.LineLoop(geo, mat);
    if (dashed) l.computeLineDistances();
    return l;
  }, [orbit, color, opacity, dashed]);
  return <primitive object={line} />;
}

const HOME = new THREE.Vector3(0, 0, 0);
const TARGET_ORBIT: Orbit = { a: LEVEL1_GEOMETRY.R2, e: 0, w: 0, tp: 0 };

export function Scene({ game, phase, servicer, preview, follow, docked }: Props) {
  const radius = EARTH_RADIUS_KM / SCENE_UNIT_KM;
  const inc = LEVEL1_GEOMETRY.inclination_deg;
  const targetPos = () => game.positions().target;
  const servicerPos = () => game.positions().servicer;

  return (
    <Canvas camera={{ position: [19, 9, 22], fov: 40, near: 0.1, far: 400 }} dpr={[1, 2]}>
      <color attach="background" args={["#070b0e"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[30, 12, 18]} intensity={2.4} />
      <Stars radius={120} depth={30} count={1800} factor={3} saturation={0} fade={false} />
      <Suspense fallback={null}>
        <Earth radius={radius} />
      </Suspense>
      <EllipseLine orbit={TARGET_ORBIT} color="#5fb4c4" opacity={0.5} />
      {phase !== "briefing" && !docked && <EllipseLine orbit={servicer} color="#e0a030" opacity={0.8} />}
      {preview && <EllipseLine orbit={preview} color="#e6e8e9" opacity={0.7} dashed />}
      <Suspense fallback={null}>
        <TargetSatellite pos={targetPos} inclination_deg={inc} />
      </Suspense>
      <Servicer
        pos={docked ? targetPos : servicerPos}
        inclination_deg={inc}
        offset={docked ? [0.5, 0.35, 0] : undefined}
      />
      <FollowControls
        follow={follow}
        home={HOME}
        minDistance={0.8}
        maxDistance={80}
        getTarget={() => {
          const t = game.positions().target;
          return new THREE.Vector3(...planeToScene(t.x, t.y, inc));
        }}
        offset={() => {
          const t = game.positions().target;
          const r = Math.hypot(t.x, t.y);
          const out = new THREE.Vector3(...planeToScene(t.x / r, t.y / r, inc)).multiplyScalar(SCENE_UNIT_KM);
          const tan = new THREE.Vector3(...planeToScene(-t.y / r, t.x / r, inc)).multiplyScalar(SCENE_UNIT_KM);
          return out
            .multiplyScalar(1.6)
            .addScaledVector(tan, -2.6)
            .add(new THREE.Vector3(0, 0.8, 0));
        }}
      />
    </Canvas>
  );
}
