import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Earth } from "../scene/Earth";
import { C } from "../data/sources";
import { SCENE_UNIT_KM, planeToScene } from "../sim/orbit";
import type { LeoProjection } from "./projection";

const COLOR = { circular: "#5fb4c4", elliptical: "#e0a030", reentry: "#d4584a", escape: "#d4584a" } as const;
const FLIGHT_S = 3;

const toScene = (x: number, y: number, inc: number) => new THREE.Vector3(...planeToScene(x, y, inc));

/** Puntos de la trayectoria (cónica con foco en la Tierra) desde el punto de inserción (ángulo 0). */
function path(p: LeoProjection, inc: number, sweep = Math.PI * 2) {
  const semiLatus = p.a_km * (1 - p.e * p.e);
  // Si la inserción es en el perigeo, el perigeo está en el ángulo 0; si no, allí está el apogeo.
  const omega = p.insertionAtPerigee ? 0 : Math.PI;
  const nu0 = p.insertionAtPerigee ? 0 : Math.PI;
  const nuMax = p.outcome === "escape" ? Math.acos(-1 / p.e) * 0.98 : Infinity;
  const pts: THREE.Vector3[] = [];
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const nu = nu0 + (i / steps) * sweep;
    if (nu > nuMax) break;
    const r = semiLatus / (1 + p.e * Math.cos(nu));
    if (r <= 0 || r > C.earthRadius * 7) break;
    pts.push(toScene(r * Math.cos(omega + nu), r * Math.sin(omega + nu), inc));
    if (p.outcome === "reentry" && r < C.earthRadius) break;
  }
  return pts;
}

function Line({
  points,
  color,
  dashed = false,
  opacity = 1,
}: {
  points: THREE.Vector3[];
  color: string;
  dashed?: boolean;
  opacity?: number;
}) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.3, gapSize: 0.2 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const l = new THREE.Line(geo, mat);
    if (dashed) l.computeLineDistances();
    return l;
  }, [points, color, dashed, opacity]);
  return <primitive object={line} />;
}

function Tube({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const geo = useMemo(
    () =>
      points.length > 3
        ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length, 0.06, 6, false)
        : null,
    [points],
  );
  if (!geo) return null;
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/** El satélite recorre su trayectoria tras el lanzamiento. */
function Flight({
  points,
  color,
  startedAt,
  onDone,
}: {
  points: THREE.Vector3[];
  color: string;
  startedAt: number;
  onDone: () => void;
}) {
  const dot = useRef<THREE.Mesh>(null);
  const done = useRef(false);
  useFrame(() => {
    const f = Math.min(1, (performance.now() - startedAt) / (FLIGHT_S * 1000));
    const i = Math.min(points.length - 1, Math.floor(f * (points.length - 1)));
    const p = points[i];
    if (dot.current && p) dot.current.position.copy(p);
    if (f >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <mesh ref={dot}>
      <sphereGeometry args={[0.18, 12, 12]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/**
 * Vista de la inserción: órbita pedida (punteada), arco corto de puntería mientras se ajusta la
 * potencia y, al lanzar, el satélite recorre la trayectoria que sale de esa potencia.
 */
export function LaunchView({
  alt_km,
  inclination_deg,
  projection,
  flying,
  landed,
  onFlightEnd,
}: {
  alt_km: number;
  inclination_deg: number;
  projection: LeoProjection;
  /** Instante (performance.now) del lanzamiento, o null mientras se apunta. */
  flying: number | null;
  /** El vuelo terminó: se dibuja la trayectoria completa. */
  landed: boolean;
  onFlightEnd: () => void;
}) {
  const r = C.earthRadius + alt_km;
  const desired = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      pts.push(toScene(r * Math.cos(a), r * Math.sin(a), inclination_deg));
    }
    return pts;
  }, [r, inclination_deg]);
  const aim = useMemo(() => path(projection, inclination_deg, Math.PI / 3), [projection, inclination_deg]);
  const full = useMemo(() => path(projection, inclination_deg), [projection, inclination_deg]);
  const color = COLOR[projection.outcome];
  return (
    <Canvas camera={{ position: [13, 9, 17], fov: 40, near: 0.01, far: 300 }} dpr={[1, 2]}>
      <color attach="background" args={["#070b0e"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[30, 12, 18]} intensity={2} />
      <Suspense fallback={null}>
        <Earth radius={C.earthRadius / SCENE_UNIT_KM} spin={0} />
      </Suspense>
      <Line points={desired} color="#e6e8e9" dashed opacity={0.5} />
      {flying === null && !landed && <Tube points={aim} color="#e0a030" />}
      {flying !== null && !landed && <Flight points={full} color={color} startedAt={flying} onDone={onFlightEnd} />}
      {landed && <Tube points={full} color={color} />}
      <mesh position={toScene(r, 0, inclination_deg)}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshBasicMaterial color="#e0a030" />
      </mesh>
      <OrbitControls enablePan={false} minDistance={8} maxDistance={60} />
    </Canvas>
  );
}
