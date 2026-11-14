import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls, Stars, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Bloom } from "../../scene/space/Bloom";
import { Sky } from "../../scene/space/Sky";
import type { NasaModelInfo } from "../../ships/models";

/** Modelo de NASA centrado, apoyado sobre la plataforma y con su dimensión mayor = `size`. */
function Model({ url, size }: { url: string; size: number }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const model = scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const dims = box.getSize(new THREE.Vector3());
    const scale = size / Math.max(dims.x, dims.y, dims.z, 1e-9);
    const center = box.getCenter(new THREE.Vector3());
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    return model;
  }, [scene, size]);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    // Flota apenas sobre la plataforma, como sostenida por la grúa del hangar.
    if (ref.current) ref.current.position.y = 0.25 + Math.sin(clock.elapsedTime * 0.8) * 0.03;
  });
  return (
    <group ref={ref}>
      <primitive object={object} />
    </group>
  );
}

/** Plataforma con anillos de luz que giran: el pedestal de la nave. */
function Platform({ active }: { active: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.25;
    if (ring2.current) ring2.current.rotation.z -= dt * 0.12;
  });
  const glow = active ? new THREE.Color(2.4, 1.5, 0.45) : new THREE.Color(0.5, 1.1, 1.3);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh receiveShadow>
        <circleGeometry args={[2.4, 96]} />
        <meshStandardMaterial color="#0b1116" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh ref={ring} position={[0, 0, 0.003]}>
        <ringGeometry args={[2.05, 2.08, 128, 1, 0, Math.PI * 1.6]} />
        <meshBasicMaterial color={glow} toneMapped={false} />
      </mesh>
      <mesh ref={ring2} position={[0, 0, 0.004]}>
        <ringGeometry args={[2.25, 2.27, 128, 1, 0.4, Math.PI * 0.9]} />
        <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[1.2, 1.205, 96]} />
        <meshBasicMaterial color="#2a3a44" />
      </mesh>
    </group>
  );
}

/**
 * Fondo 3D del hangar: la nave real de la misión gira sobre su plataforma, con luz de
 * estudio, sombras de contacto y bloom. El jugador puede girarla con el ratón.
 */
export default function HangarStage({ model, active }: { model: NasaModelInfo; active: boolean }) {
  return (
    <Canvas
      className="hangar-canvas"
      shadows
      dpr={[1, 2]}
      camera={{ position: [4.2, 2.1, 5.4], fov: 34, near: 0.05, far: 200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
    >
      <color attach="background" args={["#030507"]} />
      <fog attach="fog" args={["#030507", 9, 22]} />
      <Sky radius={80} intensity={1.4} />
      <Stars radius={60} depth={20} count={1500} factor={2} saturation={0} fade />
      <ambientLight intensity={0.15} />
      <spotLight position={[4, 7, 3]} angle={0.5} penumbra={0.8} intensity={60} castShadow color="#fff4e2" />
      <directionalLight position={[-5, 2, -4]} intensity={1.4} color="#5fb4c4" />
      <pointLight
        position={[0, 0.4, 0]}
        intensity={active ? 6 : 3}
        distance={4}
        color={active ? "#e0a030" : "#5fb4c4"}
      />
      <group position={[0.9, -0.9, 0]}>
        <Suspense fallback={null}>
          <Model url={model.url} size={2.9} />
        </Suspense>
        <Platform active={active} />
        <ContactShadows position={[0, 0.01, 0]} opacity={0.6} scale={6} blur={2.4} far={3} />
      </group>
      <OrbitControls
        target={[0.9, 0.2, 0]}
        autoRotate
        autoRotateSpeed={0.6}
        enablePan={false}
        minDistance={3.5}
        maxDistance={11}
        minPolarAngle={0.5}
        maxPolarAngle={1.55}
      />
      <Bloom strength={0.7} threshold={0.95} />
    </Canvas>
  );
}
