import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Stars, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { SimState } from "@ikaros/contracts";
import { FollowControls } from "../scene/FollowControls";
import { Spacecraft, matchesParker } from "../ships/Spacecraft";
import { displaySize } from "../scene/screenSize";
import { anomalyFromDistance, ellipsePoints, orbitFromApsides, type HelioOrbit } from "../sim/kepler";
import { C, PAPER } from "../data/sources";
import { tr } from "../i18n";
import { MISSION_EPOCH_DAY, PLANETS, planetAt, planetOrbit, type Planet } from "./planets";

/**
 * 1 unidad de escena = 1 millón de km. Distancias y Sol a escala real; los cuerpos que a escala
 * real no se verían (planetas, sonda) se dibujan con un tamaño mínimo en pantalla.
 */
const U = 1e6;
const AU = C.au / U;
const SUN_RADIUS = C.sunRadius / U;
const PROBE_URL = "/models/parker-solar-probe.glb";
/** Envergadura de la sonda, km (unos 3 m). */
const PROBE_SIZE_KM = 0.003;
// Tamaños mínimos en pantalla (fracción de la distancia a la cámara). Se respeta el orden real
// de tamaños: el Sol se ve mayor que los planetas, y los planetas mayores que la sonda.
const SUN_MIN = 0.008;
const PLANET_MIN = 0.0035;
const PROBE_MIN = 0.015;
/** Al seguir a la sonda, ella es el sujeto de la vista y se dibuja más grande. */
const PROBE_MIN_FOLLOW = 0.08;
const ORIGIN = new THREE.Vector3(0, 0, 0);
const OVERVIEW = new THREE.Vector3(0, 430, 80);

/** Plano de la eclíptica (x, y en AU) → escena (y hacia arriba). */
const toScene = (x_au: number, y_au: number) => new THREE.Vector3(x_au * AU, 0, -y_au * AU);

/** Órbita de la sonda a partir del perihelio actual (motor) y el afelio del escenario. */
export function probeOrbit(perihelion_rsun: number, aphelion_au: number): HelioOrbit {
  return orbitFromApsides((perihelion_rsun * C.sunRadius) / C.au, aphelion_au);
}

/**
 * Etiqueta HTML sobre la escena. Se monta un cuadro después: si se crea antes de que el
 * lienzo esté conectado al DOM, drei puede no insertarla (le pasaba a la primera etiqueta).
 */
function Label({
  position,
  offsetY = -12,
  children,
}: {
  position: [number, number, number];
  offsetY?: number;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!ready) return null;
  return (
    <Html
      center
      zIndexRange={[1, 0]}
      className="space-label"
      position={position}
      style={{ transform: `translateY(${offsetY}px)` }}
    >
      {children}
    </Html>
  );
}

function Ring({
  points,
  color,
  opacity,
  dashed = false,
}: {
  points: [number, number][];
  color: string;
  opacity: number;
  dashed?: boolean;
}) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => toScene(x, y)));
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 2, gapSize: 2 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const l = new THREE.LineLoop(geo, mat);
    if (dashed) l.computeLineDistances();
    return l;
  }, [points, color, opacity, dashed]);
  return <primitive object={line} />;
}

function Sun() {
  const ref = useRef<THREE.Mesh>(null);
  const camera = useThree((st) => st.camera);
  useFrame(() => {
    // Tamaño real cerca; desde lejos, un mínimo para que no desaparezca.
    if (ref.current) ref.current.scale.setScalar(displaySize(camera, ORIGIN, SUN_RADIUS, SUN_MIN) / SUN_RADIUS);
  });
  return (
    <>
      <mesh ref={ref}>
        <icosahedronGeometry args={[SUN_RADIUS, 4]} />
        <meshBasicMaterial color="#ffc15a" />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={4} decay={0} />
    </>
  );
}

function PlanetBody({ planet, getDay }: { planet: Planet; getDay: () => number }) {
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const camera = useThree((st) => st.camera);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const p = planetAt(planet, getDay());
    g.position.copy(toScene(p.x, p.y));
    body.current?.scale.setScalar(displaySize(camera, g.position, planet.radius_km / U, PLANET_MIN));
  });
  return (
    <group ref={ref}>
      <mesh ref={body}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial color={planet.color} flatShading />
      </mesh>
      <Label position={[0, 0, 0]} offsetY={-16}>
        {planetName(planet.name)}
      </Label>
    </group>
  );
}

/** Sol, órbitas de Mercurio, Venus y la Tierra, y los planetas en el día indicado (desde J2000). */
function SolarSystem({ getDay }: { getDay: () => number }) {
  const rings = useMemo(() => PLANETS.map((p) => ({ p, pts: ellipsePoints(planetOrbit(p)) })), []);
  const stow = useMemo(() => ellipsePoints({ a: PAPER.mainArrayLimit_au, e: 0, varpi: 0 }, 128), []);
  return (
    <>
      <Sun />
      {rings.map(({ p, pts }) => (
        <group key={p.id}>
          <Ring points={pts} color={p.color} opacity={0.45} />
          <PlanetBody planet={p} getDay={getDay} />
        </group>
      ))}
      <Ring points={stow} color="#e0a030" opacity={0.35} dashed />
    </>
  );
}

/** Elipse de la sonda con marcas de perihelio y afelio. */
function ProbeOrbit({
  orbit,
  color = "#e6e8e9",
  labels = true,
}: {
  orbit: HelioOrbit;
  color?: string;
  labels?: boolean;
}) {
  const pts = useMemo(() => ellipsePoints(orbit), [orbit]);
  const q = orbit.a * (1 - orbit.e);
  const Q = orbit.a * (1 + orbit.e);
  const peri = toScene(q * Math.cos(orbit.varpi), q * Math.sin(orbit.varpi));
  const aph = toScene(-Q * Math.cos(orbit.varpi), -Q * Math.sin(orbit.varpi));
  return (
    <>
      <Ring points={pts} color={color} opacity={0.8} />
      {labels && <Label position={[peri.x, peri.y, peri.z]}>{tr("Perihelio", "Perihelion")}</Label>}
      {labels && <Label position={[aph.x, aph.y, aph.z]}>{tr("Afelio", "Aphelion")}</Label>}
    </>
  );
}

/** Posición de la sonda: distancia del motor y anomalía deducida de si se acerca o se aleja del Sol. */
function useProbePosition(latest: MutableRefObject<SimState>, aphelion_au: number) {
  const lastR = useRef<number | null>(null);
  const receding = useRef(false);
  return () => {
    const s = latest.current;
    const r = s.distance_to_sun_au ?? 1;
    if (lastR.current !== null && Math.abs(r - lastR.current) > 1e-7) receding.current = r > lastR.current;
    lastR.current = r;
    const orbit = probeOrbit(s.perihelion_rsun ?? 9.5, aphelion_au);
    // Antes del lanzamiento la sonda está en la Tierra (1 AU), fuera de su órbita futura.
    const nu = r >= orbit.a * (1 + orbit.e) ? Math.PI : anomalyFromDistance(orbit, r, receding.current);
    return { x: r * Math.cos(nu), y: r * Math.sin(nu) };
  };
}

// Si el diseño coincide con Parker Solar Probe se usa el modelo de NASA sin modificar
// (public/CREDITS.md); si no, la nave armada en el hangar. A escala real no se vería: tamaño mínimo.
function Probe({
  getPos,
  getEarth,
  latest,
  emphasis,
}: {
  getPos: () => { x: number; y: number };
  getEarth: () => THREE.Vector3;
  latest: MutableRefObject<SimState>;
  emphasis: boolean;
}) {
  const parker = matchesParker(latest.current.selected);
  const group = useRef<THREE.Group>(null);
  const camera = useThree((st) => st.camera);
  const { scene } = useGLTF(PROBE_URL);
  const { model, scale } = useMemo(() => {
    const model = scene.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    return { model, scale: 1 / Math.max(size.x, size.y, size.z, 1e-9) };
  }, [scene]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = getPos();
    g.position.copy(toScene(p.x, p.y));
    g.scale.setScalar(displaySize(camera, g.position, PROBE_SIZE_KM / U, emphasis ? PROBE_MIN_FOLLOW : PROBE_MIN));
    // Escudo al Sol, o antena hacia la Tierra, según la actitud que manda el motor.
    g.lookAt(latest.current.attitude === "antenna-to-earth" ? getEarth() : ORIGIN);
  });
  return (
    <group ref={group}>
      {parker ? (
        // lookAt apunta +Z al objetivo; el escudo del modelo de NASA mira hacia −Z: media vuelta.
        <group rotation={[0, Math.PI, 0]}>
          <primitive object={model} scale={scale} />
        </group>
      ) : (
        // El diseño propio ya tiene el escudo en +Z.
        <Spacecraft kind="probe" selected={latest.current.selected} />
      )}
    </group>
  );
}

useGLTF.preload(PROBE_URL);

export function Level3Scene({
  latest,
  follow,
  aphelion_au,
  perihelion_rsun,
}: {
  latest: MutableRefObject<SimState>;
  follow: boolean;
  aphelion_au: number;
  perihelion_rsun: number;
}) {
  const getDay = () => MISSION_EPOCH_DAY + latest.current.resources.mission_elapsed_s / 86400;
  const getPos = useProbePosition(latest, aphelion_au);
  const earth = PLANETS.find((p) => p.id === "earth")!;
  const getEarth = () => {
    const e = planetAt(earth, getDay());
    return toScene(e.x, e.y);
  };
  const orbit = useMemo(() => probeOrbit(perihelion_rsun, aphelion_au), [perihelion_rsun, aphelion_au]);

  return (
    <Canvas camera={{ position: [0, 430, 80], fov: 40, near: 0.01, far: 5000 }} dpr={[1, 2]}>
      <color attach="background" args={["#05080b"]} />
      <ambientLight intensity={0.35} />
      <Stars radius={1500} depth={200} count={2500} factor={6} saturation={0} fade={false} />
      <SolarSystem getDay={getDay} />
      <ProbeOrbit orbit={orbit} />
      <Suspense fallback={null}>
        <Probe getPos={getPos} getEarth={getEarth} latest={latest} emphasis={follow} />
      </Suspense>
      <FollowControls
        follow={follow}
        home={ORIGIN}
        homeOffset={OVERVIEW}
        minDistance={2}
        maxDistance={900}
        getTarget={() => {
          const p = getPos();
          return toScene(p.x, p.y);
        }}
        offset={() => {
          // Desde fuera de la órbita y algo elevada: la sonda delante y el Sol al fondo.
          const p = getPos();
          return toScene(p.x, p.y)
            .normalize()
            .multiplyScalar(4)
            .add(new THREE.Vector3(0, 2.5, 0));
        }}
      />
    </Canvas>
  );
}

/** Vista desde arriba con la órbita inicial (gris) y la final prevista (blanca), para el hangar. */
export function OrbitPreview({ start, final }: { start: HelioOrbit; final: HelioOrbit }) {
  const getDay = () => MISSION_EPOCH_DAY;
  return (
    <Canvas camera={{ position: [0, 420, 1], fov: 40, near: 1, far: 2000 }} dpr={[1, 2]}>
      <color attach="background" args={["#070b0e"]} />
      <ambientLight intensity={0.6} />
      <SolarSystem getDay={getDay} />
      <ProbeOrbit orbit={start} color="#7d8d96" labels={false} />
      <ProbeOrbit orbit={final} />
    </Canvas>
  );
}

/** Nombre del planeta en el idioma actual (planets.ts guarda el nombre en español). */
function planetName(name: string): string {
  const en: Record<string, string> = { Mercurio: "Mercury", Venus: "Venus", Tierra: "Earth" };
  return tr(name, en[name] ?? name);
}
