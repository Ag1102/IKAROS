import { Suspense, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { Sky } from "../../scene/space/Sky";
import { Bloom } from "../../scene/space/Bloom";
import { DistantSun } from "../../scene/space/DistantSun";
import * as THREE from "three";
import type { SimState } from "@ikaros/contracts";
import { Earth } from "../../scene/Earth";
import { SmallSat } from "../../scene/Ships";
import { OrbitRing } from "../../scene/OrbitRing";
import { FollowControls } from "../../scene/FollowControls";
import { C } from "../../data/sources";
import { SCENE_UNIT_KM, planeToScene } from "../../sim/orbit";
import { orbitGeometry } from "./geometry";

const HOME = new THREE.Vector3(0, 0, 0);
const OVERVIEW = new THREE.Vector3(16, 10, 20);
const SUN_DISTANCE = 60;

/** Dirección del Sol en la escena según el ángulo que da la geometría de la órbita. */
function sunDirection(latest: MutableRefObject<SimState>, inclination: number) {
  const { sunAngle } = orbitGeometry(latest.current);
  return new THREE.Vector3(
    ...planeToScene(
      Math.cos(sunAngle) * SUN_DISTANCE * SCENE_UNIT_KM,
      Math.sin(sunAngle) * SUN_DISTANCE * SCENE_UNIT_KM,
      inclination,
    ),
  );
}

function SunLight({ latest, inclination }: { latest: MutableRefObject<SimState>; inclination: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    light.current?.position.copy(sunDirection(latest, inclination));
  });
  return <directionalLight ref={light} intensity={3} />;
}

/** Línea de enlace con la estación terrena mientras el motor indica pase abierto. */
function DownlinkBeam({ getPos, latest }: { getPos: () => THREE.Vector3; latest: MutableRefObject<SimState> }) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#5fb4c4", transparent: true, opacity: 0.9 }));
  }, []);
  useFrame(() => {
    const s = latest.current;
    const on = s.comm_window_open === true && (s.resources.downlink_rate_kbps ?? 0) > 0;
    line.visible = on;
    if (!on) return;
    const sat = getPos();
    const ground = sat
      .clone()
      .normalize()
      .multiplyScalar(C.earthRadius / SCENE_UNIT_KM);
    const pos = line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, sat.x, sat.y, sat.z);
    pos.setXYZ(1, ground.x, ground.y, ground.z);
    pos.needsUpdate = true;
  });
  return <primitive object={line} />;
}

export function ObservacionTierraScene({
  latest,
  follow,
  inclination_deg,
}: {
  latest: MutableRefObject<SimState>;
  follow: boolean;
  inclination_deg: number;
}) {
  const planePos = () => {
    const { alt, angle } = orbitGeometry(latest.current);
    const r = C.earthRadius + alt;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  };
  const scenePos = () => {
    const p = planePos();
    return new THREE.Vector3(...planeToScene(p.x, p.y, inclination_deg));
  };
  return (
    <Canvas camera={{ position: [16, 10, 20], fov: 40, near: 0.001, far: 400 }} dpr={[1, 2]}>
      <color attach="background" args={["#020407"]} />
      <ambientLight intensity={0.06} />
      <hemisphereLight args={["#9fc4ff", "#000000", 0.08]} />
      <SunLight latest={latest} inclination={inclination_deg} />
      <Suspense fallback={null}>
        <Sky radius={350} />
      </Suspense>
      <Stars radius={120} depth={30} count={1200} factor={2.5} saturation={0} fade={false} />
      <DistantSun direction={() => sunDirection(latest, inclination_deg)} distance={300} />
      <Suspense fallback={null}>
        <Earth radius={C.earthRadius / SCENE_UNIT_KM} sun={() => sunDirection(latest, inclination_deg)} />
      </Suspense>
      <OrbitRing
        inclination_deg={inclination_deg}
        altitude={() => latest.current.altitude_km ?? null}
        color="#e0a030"
        opacity={0.7}
      />
      <Suspense fallback={null}>
        <SmallSat pos={planePos} inclination_deg={inclination_deg} />
      </Suspense>
      <DownlinkBeam getPos={scenePos} latest={latest} />
      <FollowControls
        follow={follow}
        home={HOME}
        homeOffset={OVERVIEW}
        minDistance={0.8}
        maxDistance={80}
        getTarget={scenePos}
        offset={() =>
          scenePos()
            .normalize()
            .multiplyScalar(3)
            .add(new THREE.Vector3(0, 1.5, 0))
        }
      />
      <Bloom strength={0.6} threshold={0.95} />
    </Canvas>
  );
}

/** Vista previa del hangar: la Tierra y la órbita elegida, con su inclinación. */
export function OrbitPreview2({
  altitude_km,
  inclination_deg,
}: {
  altitude_km: number | null;
  inclination_deg: number;
}) {
  return (
    <Canvas camera={{ position: [14, 9, 17], fov: 40, near: 0.01, far: 200 }} dpr={[1, 2]}>
      <color attach="background" args={["#020407"]} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[30, 12, 18]} intensity={2.6} />
      <Suspense fallback={null}>
        <Sky radius={150} />
        <Earth radius={C.earthRadius / SCENE_UNIT_KM} sun={new THREE.Vector3(30, 12, 18)} />
      </Suspense>
      <OrbitRing inclination_deg={inclination_deg} altitude={() => altitude_km} color="#e0a030" opacity={0.9} />
    </Canvas>
  );
}
