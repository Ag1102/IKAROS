import { memo, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Stars, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Sun } from "./Sun";
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

// ---------- Postproceso ----------

/** Bloom con los pases de three.js: el Sol y el plasma brillan más allá de 1.0 y se derraman. */
function Bloom() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.55, 0.92));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((_, delta) => composer.render(delta), 1);
  return null;
}

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

const atmosphereMaterial = () =>
  new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vView)), 4.5);
        gl_FragColor = vec4(vec3(0.3, 0.65, 1.0) * rim * 0.9, rim * 0.8);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });

function Earth({ motion }: { motion: number }) {
  const map = useLoader(THREE.TextureLoader, "/textures/earth.jpg");
  const body = useRef<THREE.Mesh>(null);
  const atmosphere = useMemo(atmosphereMaterial, []);
  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  }, [map]);
  useFrame((_, delta) => {
    if (body.current) body.current.rotation.y += delta * 0.05 * motion;
  });
  return (
    <group position={EARTH} rotation={[0, 0, 0.41]}>
      <mesh ref={body}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
        <meshStandardMaterial map={map} roughness={0.85} metalness={0} />
      </mesh>
      <mesh material={atmosphere} scale={1.04}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      </mesh>
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
  return <primitive object={useNormalizedModel("/models/hubble.glb", 0.42)} />;
}

function Probe() {
  const model = useNormalizedModel("/models/parker-solar-probe.glb", 0.55);
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
  const level = (n: LevelN) => menuLevels().find((l) => l.n === n)!;
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
      <Stars radius={140} depth={60} count={6000} factor={4} saturation={0} fade speed={0.4 * motion} />
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
            <mesh>
              <boxGeometry args={[0.12, 0.12, 0.2]} />
              <meshStandardMaterial color="#8a9aa3" metalness={0.6} roughness={0.4} />
            </mesh>
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
