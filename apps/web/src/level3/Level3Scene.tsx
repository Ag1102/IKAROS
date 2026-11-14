import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { FollowControls } from "../scene/FollowControls";
import { AU_KM, D_START_AU, RSUN_KM, type Encounter } from "./encounter";

/** 1 unidad de escena = 1 millón de km. */
const U = 1e6;
const PROBE_URL = "/models/parker-solar-probe.glb";
const PROBE_SIZE = 1.2;

function Sun() {
  return (
    <>
      <mesh>
        <icosahedronGeometry args={[RSUN_KM / U, 3]} />
        <meshBasicMaterial color="#ffc15a" />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={60} decay={1} />
    </>
  );
}

// Modelo de NASA sin modificar (public/CREDITS.md).
function Probe({ enc }: { enc: Encounter }) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF(PROBE_URL);
  const { model, scale } = useMemo(() => {
    const model = scene.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    return { model, scale: PROBE_SIZE / Math.max(size.x, size.y, size.z, 1e-6) };
  }, [scene]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(enc.distanceKm / U, 0, 0);
    g.lookAt(0, 0, 0);
  });
  return (
    <group ref={group}>
      <primitive object={model} scale={scale} />
    </group>
  );
}

useGLTF.preload(PROBE_URL);

function Path() {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3((D_START_AU * AU_KM) / U, 0, 0),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: "#5fb4c4", transparent: true, opacity: 0.35 });
    return new THREE.Line(geo, mat);
  }, []);
  // Marcas cada 5 millones de km para percibir el avance de la sonda.
  const ticks = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let x = 5; x <= (D_START_AU * AU_KM) / U; x += 5) {
      pts.push(new THREE.Vector3(x, -0.35, 0), new THREE.Vector3(x, 0.35, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: "#5fb4c4", transparent: true, opacity: 0.5 }),
    );
  }, []);
  return (
    <>
      <primitive object={line} />
      <primitive object={ticks} />
    </>
  );
}

export function Level3Scene({ enc, follow }: { enc: Encounter; follow: boolean }) {
  return (
    <Canvas camera={{ position: [10, 1, 3], fov: 40, near: 0.01, far: 400 }} dpr={[1, 2]}>
      <color attach="background" args={["#05080b"]} />
      <ambientLight intensity={0.5} />
      <Stars radius={150} depth={30} count={1500} factor={3} saturation={0} fade={false} />
      <Sun />
      <Path />
      <Suspense fallback={null}>
        <Probe enc={enc} />
      </Suspense>
      <FollowControls
        follow={follow}
        minDistance={0.4}
        maxDistance={150}
        getTarget={() => new THREE.Vector3(enc.distanceKm / U, 0, 0)}
        offset={() => new THREE.Vector3(2.4, 1.2, 3.2)}
      />
    </Canvas>
  );
}
