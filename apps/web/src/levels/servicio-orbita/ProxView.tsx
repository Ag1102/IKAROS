import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { SimState } from "@ikaros/contracts";
import { MODELS } from "../../ships/models";
import { C } from "../../data/sources";

/**
 * Vista desde la cámara de acople del transbordador. Ejes de la escena: X = derecha (z del motor),
 * Y = arriba (eje R), Z = hacia la nave (eje V). El puerto de la ISS está en el origen y la
 * estación se extiende hacia −Z. La nave mantiene la actitud: solo se traslada.
 */

/** Longitud real de la ISS de punta a punta, m (NASA, Space Station Facts and Figures). */
const ISS_SPAN_M = 109;

/** Coloca el modelo de NASA (sin modificar) con el extremo de los módulos en el puerto. */
function IssModel() {
  const { scene } = useGLTF(MODELS.iss.url);
  const object = useMemo(() => {
    const model = scene.clone(true);
    // En el modelo la armadura va en Z, los módulos en Y y X es el lado delgado. Una rotación
    // (sin espejo, para no invertir insignias) lleva la armadura a X, perpendicular al vuelo, y los
    // módulos a −Z, con el extremo de los módulos en el puerto.
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(1, 0, 0),
    );
    model.quaternion.setFromRotationMatrix(basis);
    const holder = new THREE.Group();
    holder.add(model);
    // Solo las piezas grandes cuentan para la caja (el modelo trae piezas sueltas pequeñas).
    const bigBox = () => {
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3();
      model.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        const b = new THREE.Box3().setFromObject(o);
        const s = b.getSize(new THREE.Vector3());
        if (Math.max(s.x, s.y, s.z) > 10 * model.scale.x) box.union(b);
      });
      return box;
    };
    const size = bigBox().getSize(new THREE.Vector3());
    model.scale.setScalar(ISS_SPAN_M / Math.max(size.x, size.y, size.z));
    const placed = bigBox();
    const center = placed.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -center.y, -placed.max.z);
    return holder;
  }, [scene]);
  return <primitive object={object} />;
}

/** Adaptador de acople y diana de alineación: piezas propias, low-poly. */
function DockingTarget({ lit }: { lit: boolean }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -1]}>
        <cylinderGeometry args={[0.8, 1.05, 2, 16, 1, true]} />
        <meshStandardMaterial color="#9aa4aa" metalness={0.4} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.8, 0.06, 8, 24]} />
        <meshStandardMaterial color="#c9d3d8" emissive={lit ? "#000000" : "#2a3a40"} />
      </mesh>
      {/* Diana: cruz sobre un poste, como las del eje del puerto. */}
      <mesh position={[0, 0, -0.3]}>
        <boxGeometry args={[0.9, 0.06, 0.02]} />
        <meshBasicMaterial color="#f2f2f2" />
      </mesh>
      <mesh position={[0, 0, -0.3]}>
        <boxGeometry args={[0.06, 0.9, 0.02]} />
        <meshBasicMaterial color="#f2f2f2" />
      </mesh>
      <mesh position={[0, 0, -0.9]}>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color="#111518" />
      </mesh>
      {[
        [0.9, 0, "#3fd07a"],
        [-0.9, 0, "#d4584a"],
        [0, 0.9, "#f2f2f2"],
      ].map(([x, y, c]) => (
        <mesh key={String(c)} position={[Number(x), Number(y), 0.05]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color={String(c)} />
        </mesh>
      ))}
    </group>
  );
}

/** La Tierra bajo la estación: radio real a 415 km por debajo. */
function EarthBelow({ alt_km }: { alt_km: number }) {
  const tex = useTexture("/textures/earth.jpg");
  const r = C.earthRadius * 1000;
  return (
    <mesh position={[0, -(r + alt_km * 1000), 0]} rotation={[0.3, 0, 0.2]}>
      <sphereGeometry args={[r, 96, 64]} />
      <meshStandardMaterial map={tex} roughness={1} metalness={0} />
    </mesh>
  );
}

/** Cámara de acople: se mueve con la nave y mira siempre a lo largo del eje del puerto. */
function DockingCamera({ latest }: { latest: MutableRefObject<SimState> }) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const p = latest.current.rel_position_m;
    if (!p) return;
    camera.position.set(p.z, p.y, Math.max(p.x, 0.4));
    camera.lookAt(p.z, p.y, Math.max(p.x, 0.4) - 10);
  });
  return null;
}

function Lights({ day }: { day: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const flood = useRef<THREE.SpotLight>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (flood.current) {
      flood.current.position.copy(camera.position);
      flood.current.target.position.set(camera.position.x, camera.position.y, camera.position.z - 20);
      flood.current.target.updateMatrixWorld();
    }
  });
  return (
    <>
      <ambientLight intensity={day ? 0.25 : 0.04} />
      <hemisphereLight args={["#9fc4ff", "#203040", day ? 0.35 : 0.05]} />
      <directionalLight ref={sun} position={[40, 60, 30]} intensity={day ? 2.6 : 0} />
      {/* Focos de la bodega del transbordador: lo único que ilumina la estación de noche. */}
      <spotLight ref={flood} intensity={day ? 0 : 900} angle={0.35} penumbra={0.6} distance={260} decay={1.2} />
    </>
  );
}

export function ProxView({ latest, day }: { latest: MutableRefObject<SimState>; day: boolean }) {
  useEffect(() => {
    useGLTF.preload(MODELS.iss.url);
  }, []);
  return (
    <Canvas
      camera={{ fov: 46, near: 0.2, far: 2e7, position: [0, 0, 122] }}
      gl={{ logarithmicDepthBuffer: true, antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#010203"]} />
      <Stars radius={5e6} depth={1e6} count={1500} factor={4} saturation={0} fade={false} />
      <Lights day={day} />
      <DockingCamera latest={latest} />
      <Suspense fallback={null}>
        <IssModel />
      </Suspense>
      <DockingTarget lit={day} />
      <Suspense fallback={null}>
        <EarthBelow alt_km={latest.current.target_altitude_km ?? 415} />
      </Suspense>
    </Canvas>
  );
}
