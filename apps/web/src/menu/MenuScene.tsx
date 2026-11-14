import { memo, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, Stars, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Sun } from "../scene/space/Sun";
import { Bloom } from "../scene/space/Bloom";
import { Sky } from "../scene/space/Sky";
import { Earth as EarthGlobe } from "../scene/Earth";
import { MODELS } from "../ships/models";
import { useUnlocked } from "../progress";
import { menuLevels, type MenuLevel } from "./levels";

type LevelN = MenuLevel["n"];

const EARTH = new THREE.Vector3(-5.2, -2.3, 7.6);
const EARTH_RADIUS = 1.1;

/** Encuadre de cámara por misión: posición y punto al que mira (el sujeto queda a la derecha del menú). */
const SHOTS: Record<LevelN, { pos: THREE.Vector3; look: THREE.Vector3 }> = {
  // La Tierra se mira desde el lado del Sol, para ver el lado de día.
  1: {
    pos: EARTH.clone().add(new THREE.Vector3(7.4, 2.4, 0.4)),
    look: EARTH.clone().add(new THREE.Vector3(-0.2, 0.1, 2.9)),
  },
  2: {
    pos: EARTH.clone().add(new THREE.Vector3(5.6, 5.6, 2.0)),
    look: EARTH.clone().add(new THREE.Vector3(-0.2, -0.3, 2.6)),
  },
  3: { pos: new THREE.Vector3(-4.5, 2.2, 15.5), look: new THREE.Vector3(-4.6, 0, 0) },
};

// ---------- Cámara ----------

function CameraRig({ selected, motion }: { selected: LevelN; motion: number }) {
  const look = useRef(SHOTS[selected].look.clone());
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, pointer, clock }, delta) => {
    const shot = SHOTS[selected];
    const k = 1 - Math.exp(-delta * 2.2);
    // Paralaje con el ratón y una deriva lenta, como una cámara en mano.
    const drift = Math.sin(clock.elapsedTime * 0.15) * 0.25 * motion;
    target.set(shot.pos.x + pointer.x * 0.6 * motion + drift, shot.pos.y + pointer.y * 0.35 * motion, shot.pos.z);
    camera.position.lerp(target, k);
    look.current.lerp(shot.look, k);
    camera.lookAt(look.current);
  });
  return null;
}

// ---------- Objetos ----------

function useNormalizedModel(url: string, size: number) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const model = scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const dims = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = size / Math.max(dims.x, dims.y, dims.z);
    model.position.copy(center).multiplyScalar(-scale);
    model.scale.setScalar(scale);
    const wrap = new THREE.Group();
    wrap.add(model);
    return wrap;
  }, [scene, size]);
}

function Earth({ motion }: { motion: number }) {
  // El Sol está en el origen: la luz llega desde -EARTH.
  const sun = useMemo(() => EARTH.clone().negate(), []);
  return (
    <group position={EARTH} rotation={[0, 0, 0.41]}>
      <EarthGlobe radius={EARTH_RADIUS} sun={sun} spin={0.05 * motion} />
    </group>
  );
}

/** Órbita circular alrededor de un centro, con un objeto que la recorre. */
function OrbitPath({
  radius,
  tilt,
  color,
  opacity,
}: {
  radius: number;
  tilt: [number, number, number];
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const pts = Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    });
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [radius]);
  return (
    <group rotation={tilt}>
      <lineLoop geometry={geometry}>
        <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </lineLoop>
    </group>
  );
}

function Orbiter({
  radius,
  tilt,
  period,
  phase = 0,
  motion,
  children,
}: {
  radius: number;
  tilt: [number, number, number];
  period: number;
  phase?: number;
  motion: number;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const angle = useRef(phase);
  useFrame((_, delta) => {
    angle.current += (delta * motion * Math.PI * 2) / period;
    ref.current?.position.set(Math.cos(angle.current) * radius, 0, Math.sin(angle.current) * radius);
    ref.current?.rotation.set(0, -angle.current, 0);
  });
  return (
    <group rotation={tilt}>
      <group ref={ref}>{children}</group>
    </group>
  );
}

/** Marco de selección: anillo que mira a la cámara y late. */
function Reticle({ size, active, hovered }: { size: number; active: boolean; hovered: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ camera, clock }) => {
    if (!ref.current || !material.current) return;
    ref.current.quaternion.copy(camera.quaternion);
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.04;
    ref.current.scale.setScalar(active ? pulse : hovered ? 1.06 : 1);
    material.current.opacity = active ? 0.95 : hovered ? 0.6 : 0;
  });
  return (
    <mesh ref={ref}>
      <ringGeometry args={[size, size * 1.035, 96]} />
      <meshBasicMaterial
        ref={material}
        color={new THREE.Color(1.6, 1.05, 0.35)}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Etiqueta HTML junto al objeto. Se monta un cuadro después del lienzo: si drei crea su raíz
 * durante el mismo render, React avisa de un desmontaje síncrono.
 */
const Label = memo(function Label({ level, active }: { level: MenuLevel; active: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!ready) return null;
  return (
    <Html center position={[0, -0.25, 0]} style={{ pointerEvents: "none" }} zIndexRange={[5, 0]}>
      <div className={`node-label${active ? " active" : ""}${level.ready ? "" : " locked"}`}>
        <span>{String(level.n).padStart(2, "0")}</span>
        {level.name}
      </div>
    </Html>
  );
});

interface NodeProps {
  level: MenuLevel;
  selected: LevelN;
  hovered: LevelN | null;
  reticle: number;
  labelOffset: [number, number, number];
  onHover: (n: LevelN | null) => void;
  onSelect: (n: LevelN) => void;
  onEnter: (n: LevelN) => void;
  children?: ReactNode;
}

/** Objeto seleccionable de la escena: zona de clic, marco y etiqueta. */
function MissionNode({
  level,
  selected,
  hovered,
  reticle,
  labelOffset,
  onHover,
  onSelect,
  onEnter,
  children,
}: NodeProps) {
  const stop = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();
  return (
    <group>
      {children}
      <mesh
        visible={false}
        onPointerOver={(e) => {
          stop(e);
          onHover(level.n);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          stop(e);
          onSelect(level.n);
        }}
        onDoubleClick={(e) => {
          stop(e);
          if (level.ready) onEnter(level.n);
        }}
      >
        <sphereGeometry args={[reticle, 16, 16]} />
      </mesh>
      <Reticle size={reticle} active={selected === level.n} hovered={hovered === level.n} />
      <group position={labelOffset}>
        <Label level={level} active={selected === level.n} />
      </group>
    </group>
  );
}

function Hubble() {
  return <primitive object={useNormalizedModel(MODELS.hubble.url, 0.42)} />;
}

function Landsat() {
  return <primitive object={useNormalizedModel(MODELS.landsat.url, 0.36)} />;
}

function Probe() {
  const model = useNormalizedModel(MODELS.parker.url, 0.55);
  const ref = useRef<THREE.Group>(null);
  // El escudo térmico mira siempre al Sol, que está en el origen.
  useFrame(() => ref.current?.lookAt(0, 0, 0));
  return (
    <group ref={ref}>
      <primitive object={model} />
      <pointLight color="#ffb070" intensity={2} distance={1.5} />
    </group>
  );
}

function Scene({
  selected,
  motion,
  onSelect,
  onEnter,
}: {
  selected: LevelN;
  motion: number;
  onSelect: (n: LevelN) => void;
  onEnter: (n: LevelN) => void;
}) {
  const [hovered, setHovered] = useState<LevelN | null>(null);
  const unlocked = useUnlocked();
  // Un nivel bloqueado se dibuja como no disponible y no se puede abrir con doble clic.
  const level = (n: LevelN) => {
    const l = menuLevels().find((x) => x.n === n)!;
    return { ...l, ready: l.ready && n <= unlocked };
  };
  const common = { selected, hovered, onHover: setHovered, onSelect, onEnter };

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <>
      <color attach="background" args={["#020407"]} />
      <ambientLight intensity={0.04} />
      <pointLight position={[0, 0, 0]} intensity={220} decay={2} color="#fff1dc" />
      <Suspense fallback={null}>
        <Sky radius={300} />
      </Suspense>
      <Stars radius={140} depth={60} count={2500} factor={3} saturation={0} fade speed={0.4 * motion} />
      <CameraRig selected={selected} motion={motion} />

      <MissionNode level={level(3)} reticle={3.7} labelOffset={[0, -4.3, 0]} {...common}>
        <Sun speed={motion} />
        <OrbitPath radius={5.4} tilt={[0.18, 0, 0.08]} color="#e0a030" opacity={0.18} />
        <Orbiter radius={5.4} tilt={[0.18, 0, 0.08]} period={60} phase={2.2} motion={motion}>
          <Suspense fallback={null}>
            <Probe />
          </Suspense>
        </Orbiter>
      </MissionNode>

      <group position={EARTH}>
        <OrbitPath radius={1.65} tilt={[0.5, 0, 0.2]} color="#5fb4c4" opacity={0.35} />
        <OrbitPath radius={1.85} tilt={[Math.PI / 2 - 0.15, 0.3, 0]} color="#5fb4c4" opacity={0.14} />
        <Orbiter radius={1.65} tilt={[0.5, 0, 0.2]} period={24} motion={motion}>
          <MissionNode level={level(1)} reticle={0.42} labelOffset={[0, -0.3, 0]} {...common}>
            <Suspense fallback={null}>
              <Hubble />
            </Suspense>
          </MissionNode>
        </Orbiter>
        <Orbiter radius={1.85} tilt={[Math.PI / 2 - 0.15, 0.3, 0]} period={30} phase={1.4} motion={motion}>
          <MissionNode level={level(2)} reticle={0.32} labelOffset={[0, -0.25, 0]} {...common}>
            <Suspense fallback={null}>
              <Landsat />
            </Suspense>
          </MissionNode>
        </Orbiter>
      </group>
      <Suspense fallback={null}>
        <Earth motion={motion} />
      </Suspense>
      <Bloom />
    </>
  );
}

export default function MenuScene(props: {
  selected: LevelN;
  onSelect: (n: LevelN) => void;
  onEnter: (n: LevelN) => void;
}) {
  const reduced = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);
  return (
    <Canvas
      className="menu-canvas"
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 500, position: SHOTS[props.selected].pos.toArray() }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      <Scene {...props} motion={reduced ? 0.2 : 1} />
    </Canvas>
  );
}
