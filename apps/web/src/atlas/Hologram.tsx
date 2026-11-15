// Atlas como holograma, a partir de la hoja de poses (public/atlas/atlas-poses.webp):
// 4 filas de pose (reposo, señalar, advertir, explicar) × 3 columnas de boca (cerrada, media,
// abierta). El shader convierte el brillo en transparencia (el fondo oscuro desaparece), tiñe
// la imagen, le suma líneas de escaneo y parpadeo, y la "proyecta" de abajo hacia arriba.
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { voiceLevel } from "./voice";

export type Gesture = "idle" | "point" | "warn" | "explain";

const SHEET_URL = "/atlas/atlas-poses.webp";
const SHEET_W = 1536;
const SHEET_H = 1024;
const ROW_H = 256;
/** Ventana de cada pose, en px de la hoja, centrada en la cabeza para que no salte al cambiar. */
const WIN_W = 470;
const HEAD_LEFT = 230;
/** Centro x de la cabeza en cada celda [fila][boca], medido sobre la hoja. */
const HEAD_X = [
  [321, 770, 1217],
  [254, 705, 1158],
  [325, 781, 1230],
  [308, 766, 1221],
];
const ROW: Record<Gesture, number> = { idle: 0, point: 1, warn: 2, explain: 3 };
export const HOLO_ASPECT = WIN_W / ROW_H;

/** Rectángulo UV (x, y, ancho, alto) de una celda; y crece hacia arriba como en WebGL. */
function cellRect(row: number, mouth: number): THREE.Vector4 {
  const x0 = HEAD_X[row]![mouth]! - HEAD_LEFT;
  const y0 = SHEET_H - (row + 1) * ROW_H;
  return new THREE.Vector4(x0 / SHEET_W, y0 / SHEET_H, WIN_W / SHEET_W, ROW_H / SHEET_H);
}

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uSheet;
  uniform vec4 uRectA;
  uniform vec4 uRectB;
  uniform float uMix;
  uniform vec3 uTint;
  uniform float uTime;
  uniform float uLevel;
  uniform float uReveal;
  varying vec2 vUv;

  vec4 cell(vec4 r) { return texture2D(uSheet, r.xy + vUv * r.zw); }

  void main() {
    if (vUv.y > uReveal) discard;
    vec3 rgb = mix(cell(uRectB).rgb, cell(uRectA).rgb, uMix);
    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
    // El fondo de la hoja es oscuro: lo que no brilla se vuelve transparente.
    // El halo del fondo ronda 0,20–0,22 de brillo y el traje oscuro 0,31: el corte va entre ambos.
    float body = smoothstep(0.24, 0.42, lum);
    float scan = 0.72 + 0.28 * step(0.5, fract(vUv.y * 90.0 - uTime * 1.5));
    float flicker = 0.93 + 0.07 * sin(uTime * 41.0) * sin(uTime * 11.0);
    // Bordes y base difuminados: la figura sale de la tarjeta como de un proyector.
    float edges = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x) * smoothstep(0.0, 0.22, vUv.y);
    // Línea brillante del frente de proyección, solo mientras aparece.
    float front = smoothstep(0.06, 0.0, uReveal - vUv.y) * 0.9 * (1.0 - smoothstep(0.92, 1.0, uReveal));
    vec3 col = uTint * (0.35 + 1.25 * lum) + rgb * 0.25 + uTint * front;
    col *= flicker * (1.0 + uLevel * 0.25);
    gl_FragColor = vec4(col, (body * scan + front) * edges);
  }
`;

function Figure({ gesture, visible, warn }: { gesture: Gesture; visible: boolean; warn: boolean }) {
  const sheet = useTexture(SHEET_URL);
  const { viewport } = useThree();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uSheet: { value: null },
          uRectA: { value: cellRect(0, 0) },
          uRectB: { value: cellRect(0, 0) },
          uMix: { value: 1 },
          uTint: { value: new THREE.Color("#5fd4e6") },
          uTime: { value: 0 },
          uLevel: { value: 0 },
          uReveal: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  const row = useRef(ROW[gesture]);
  const mouth = useRef(0);
  const level = useRef(0);
  const reveal = useRef(0);

  useEffect(() => {
    sheet.colorSpace = THREE.SRGBColorSpace;
    sheet.minFilter = THREE.LinearFilter;
    sheet.generateMipmaps = false;
    material.uniforms.uSheet!.value = sheet;
  }, [sheet, material]);

  useEffect(() => () => material.dispose(), [material]);

  // Cada aparición se vuelve a proyectar desde abajo.
  useEffect(() => {
    if (visible) reveal.current = 0;
  }, [visible]);

  useFrame((state, delta) => {
    // Tras una pausa (frameloop "demand") el primer cuadro trae todo el tiempo detenido.
    const dt = Math.min(delta, 0.1);
    const u = material.uniforms;
    const t = state.clock.elapsedTime;
    u.uTime!.value = t;
    reveal.current += ((visible ? 1.02 : 0) - reveal.current) * (1 - Math.exp(-dt * (visible ? 3 : 6)));
    u.uReveal!.value = reveal.current;
    level.current += (voiceLevel() - level.current) * (1 - Math.exp(-dt * 20));
    u.uLevel!.value = level.current;
    (u.uTint!.value as THREE.Color).lerp(new THREE.Color(warn ? "#ffb347" : "#5fd4e6"), 1 - Math.exp(-dt * 5));

    // Boca según el volumen, con un poco de margen para que no tiemble entre dos estados.
    const lv = level.current;
    const m = mouth.current;
    const nextMouth = lv > (m === 2 ? 0.26 : 0.32) ? 2 : lv > (m >= 1 ? 0.07 : 0.11) ? 1 : 0;
    const nextRow = ROW[gesture];
    if (nextRow !== row.current) {
      // Cambio de pose: fundido corto desde la celda anterior.
      (u.uRectB!.value as THREE.Vector4).copy(u.uRectA!.value as THREE.Vector4);
      u.uMix!.value = 0;
      row.current = nextRow;
    }
    mouth.current = nextMouth;
    (u.uRectA!.value as THREE.Vector4).copy(cellRect(row.current, mouth.current));
    u.uMix!.value = Math.min(1, (u.uMix!.value as number) + dt / 0.25);
  });

  // La figura ocupa todo el lienzo sin deformarse.
  const w = Math.min(viewport.width, viewport.height * HOLO_ASPECT);
  return (
    <mesh material={material} scale={[w, w / HOLO_ASPECT, 1]}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

/**
 * Lienzo del holograma. Mientras no se ve deja de dibujar (frameloop "demand"); sigue montado
 * para no crear un contexto WebGL nuevo en cada línea.
 */
export default function Hologram({
  gesture,
  visible,
  warn = false,
  className,
}: {
  gesture: Gesture;
  visible: boolean;
  warn?: boolean;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        orthographic
        frameloop={visible ? "always" : "demand"}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: false }}
        camera={{ position: [0, 0, 5], zoom: 100 }}
      >
        <Figure gesture={gesture} visible={visible} warn={warn} />
      </Canvas>
    </div>
  );
}
