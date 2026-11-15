import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Earth } from "../../../scene/Earth";
import { Sky } from "../../../scene/space/Sky";
import { Bloom } from "../../../scene/space/Bloom";
import { DistantSun } from "../../../scene/space/DistantSun";
import { MODELS } from "../../../ships/models";
import { tr } from "../../../i18n";

const SUN = new THREE.Vector3(1, 0.25, -0.6).normalize();
const DURATION = 5;

function Probe({ arriving }: { arriving: boolean }) {
  const { scene } = useGLTF(MODELS.parker.url);
  const model = useMemo(() => {
    const m = scene.clone(true);
    const box = new THREE.Box3().setFromObject(m);
    const s = 0.6 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
    m.scale.setScalar(s);
    m.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-s);
    return m;
  }, [scene]);
  const ref = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = Math.min(1, clock.elapsedTime / DURATION);
    const g = ref.current;
    if (!g) return;
    if (arriving) {
      // La cápsula cae hacia la Tierra con plasma en la nariz.
      const p = new THREE.Vector3(6, 3.4, 2).lerp(new THREE.Vector3(1.3, 0.55, 0.6), t * t);
      g.position.copy(p);
      g.scale.setScalar(0.5);
      g.lookAt(0, 0, 0);
    } else {
      // La sonda sale de la Tierra y se aleja hacia el Sol.
      const p = new THREE.Vector3(1.4, 0.3, 0.8).lerp(SUN.clone().multiplyScalar(14), t * t);
      g.position.copy(p);
      g.lookAt(SUN.clone().multiplyScalar(30));
    }
    if (trail.current) {
      const mat = trail.current.material as THREE.MeshBasicMaterial;
      mat.opacity = arriving ? 0.9 * Math.sin(Math.PI * t) : 0.6 * (1 - t);
    }
  });
  return (
    <group ref={ref}>
      {arriving ? (
        <mesh>
          <sphereGeometry args={[0.12, 24, 24]} />
          <meshStandardMaterial color="#8a7a66" metalness={0.4} roughness={0.5} />
        </mesh>
      ) : (
        <primitive object={model} />
      )}
      <mesh ref={trail} position={[0, 0, arriving ? 0.25 : -0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.16, 1.2, 16, 1, true]} />
        <meshBasicMaterial
          color={arriving ? new THREE.Color(3, 1.2, 0.3) : new THREE.Color(1.2, 2, 3)}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Cinemática de salida desde la Tierra o de llegada de la cápsula; termina sola o con «Saltar». */
export function Cinematic({
  kind,
  capsule = true,
  onDone,
}: {
  kind: "departure" | "arrival";
  /** En la llegada: true si vuelve la cápsula; si no, llegan solo los datos. */
  capsule?: boolean;
  onDone: () => void;
}) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), DURATION * 1000 + 600);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "Enter" || e.key === "Escape") done.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const arriving = kind === "arrival";
  return (
    <div className="cinematic">
      <Canvas camera={{ position: arriving ? [5, 1.5, 2.6] : [4.2, 1.6, 2.8], fov: 40 }} dpr={[1, 2]}>
        <color attach="background" args={["#020407"]} />
        <ambientLight intensity={0.12} />
        <directionalLight position={SUN.clone().multiplyScalar(10)} intensity={3} />
        <Sky radius={200} />
        <Stars radius={100} depth={30} count={1500} factor={2.5} saturation={0} fade />
        <DistantSun direction={SUN} distance={150} apparentRadius_deg={0.6} />
        <Suspense fallback={null}>
          <Earth radius={1} sun={SUN} spin={0.05} />
          {(!arriving || capsule) && <Probe arriving={arriving} />}
        </Suspense>
        <Bloom strength={0.8} threshold={0.9} />
      </Canvas>
      <div className="cinematic-caption">
        <span className="game-kicker">{arriving ? tr("Llegada", "Arrival") : tr("Despegue", "Liftoff")}</span>
        <h2>
          {arriving && !capsule
            ? tr("Los datos de Ikaros llegan a la Tierra", "Ikaros's data reaches Earth")
            : arriving
              ? tr("La cápsula vuelve a casa", "The capsule comes home")
              : tr("Ikaros deja la Tierra rumbo a Venus", "Ikaros leaves Earth for Venus")}
        </h2>
        <button className="scale-btn" onClick={() => done.current()}>
          <kbd>Enter</kbd> {tr("Saltar", "Skip")}
        </button>
      </div>
    </div>
  );
}
