import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

// Naves armadas con las piezas elegidas en el hangar. Modelos low poly propios (no son de
// NASA). Convención: +Z es el frente (lo que mira la nave: la Tierra en los niveles 1 y 2,
// el Sol en el nivel 3) y +Y es arriba.

export type ShipKind = "servicer" | "probe";
export type Selection = Record<string, string> | undefined;

const HIGHLIGHT = "#e0a030";

/** Material de una pieza; resaltada cuando es la que se está eligiendo. */
function Mat({
  color,
  hl = false,
  metal = 0.25,
  rough = 0.6,
  glow,
}: {
  color: string;
  hl?: boolean;
  metal?: number;
  rough?: number;
  glow?: string;
}) {
  return (
    <meshStandardMaterial
      color={color}
      flatShading
      metalness={metal}
      roughness={rough}
      emissive={hl ? HIGHLIGHT : (glow ?? "#000000")}
      emissiveIntensity={hl ? 0.6 : glow ? 0.9 : 0}
    />
  );
}

/** Escala el contenido para que su dimensión mayor mida 1, sea cual sea la configuración. */
function Normalized({ children, deps }: { children: ReactNode; deps: string }) {
  const inner = useRef<THREE.Group>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const g = inner.current;
    if (!g) return;
    // Tamaño en el espacio propio del modelo: el de mundo dividido por la escala acumulada.
    g.updateWorldMatrix(true, true);
    const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    const world = g.getWorldScale(new THREE.Vector3()).x || 1;
    const max = Math.max(size.x, size.y, size.z) / world;
    if (max > 0) setScale(1 / max);
  }, [deps]);
  return (
    <group scale={scale}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

const X90: [number, number, number] = [Math.PI / 2, 0, 0];

// Nivel 1: vehículo de servicio

function Servicer({ s, hl }: { s: Selection; hl?: string | null }) {
  const has = (slot: string) => Boolean(s?.[slot]);
  return (
    <group>
      <mesh>
        <boxGeometry args={[1, 1, 1.4]} />
        <Mat color="#e6e8e9" />
      </mesh>
      <mesh position={[0, 0, -0.85]} rotation={X90}>
        <cylinderGeometry args={[0.3, 0.45, 0.35, 8]} />
        <Mat color="#8a6d3b" metal={0.6} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * 1.2, 0, -0.1]}>
          <boxGeometry args={[1.3, 0.04, 0.7]} />
          <Mat color="#27415f" metal={0.5} rough={0.35} />
        </mesh>
      ))}
      {/* Brazo robótico */}
      <mesh position={[0.25, 0.25, 0.95]} rotation={[Math.PI / 3, 0, -0.3]}>
        <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
        <Mat color="#b8bcbf" metal={0.5} />
      </mesh>
      {has("panel") && (
        <group position={[0, 0.6, 0]}>
          <mesh>
            <boxGeometry args={[0.9, 0.14, 0.75]} />
            <Mat color="#1b2f4d" hl={hl === "panel"} metal={0.4} rough={0.4} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.95, 0.02, 0.8]} />
            <Mat color="#c9cdd0" hl={hl === "panel"} />
          </mesh>
        </group>
      )}
      {has("antenna") && (
        <group position={[0.7, 0.25, 0.3]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh>
            <coneGeometry args={[0.38, 0.18, 14, 1, true]} />
            <Mat color="#dfe3e6" hl={hl === "antenna"} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.3, 6]} />
            <Mat color="#9aa0a4" hl={hl === "antenna"} />
          </mesh>
        </group>
      )}
      {has("toolkit") && (
        <mesh position={[-0.7, -0.15, 0.2]}>
          <boxGeometry args={[0.35, 0.32, 0.55]} />
          <Mat color="#c9a227" hl={hl === "toolkit"} />
        </mesh>
      )}
      {has("camera") && (
        <group position={[0.42, 0.55, 1.25]} rotation={X90}>
          <mesh>
            <cylinderGeometry args={[0.09, 0.11, 0.25, 8]} />
            <Mat color="#1a1f24" hl={hl === "camera"} />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.02, 8]} />
            <Mat color="#5fb4c4" hl={hl === "camera"} glow="#2a6f7a" />
          </mesh>
        </group>
      )}
    </group>
  );
}

// Nivel 3: sonda solar

function Probe({ s, hl }: { s: Selection; hl?: string | null }) {
  const energy = s?.energy;
  const shield = s?.shield;
  const science = s?.science;
  return (
    <group>
      {/* Cuerpo hexagonal detrás del escudo */}
      <mesh position={[0, 0, -0.2]} rotation={X90}>
        <cylinderGeometry args={[0.45, 0.45, 0.9, 6]} />
        <Mat color="#2b2f33" />
      </mesh>

      {shield === "shield-cc" && (
        <mesh position={[0, 0, 0.55]} rotation={X90}>
          <cylinderGeometry args={[1.15, 1.15, 0.12, 24]} />
          <Mat color="#f0efe9" hl={hl === "shield"} rough={0.9} metal={0} />
        </mesh>
      )}
      {shield === "shield-liquid-metal" && (
        <mesh position={[0, 0, 0.6]} rotation={X90}>
          <cylinderGeometry args={[1.1, 1.1, 0.28, 24]} />
          <Mat color="#c8d0d6" hl={hl === "shield"} metal={0.55} rough={0.3} />
        </mesh>
      )}

      {energy === "pv-cooled" && (
        <group>
          {[-1, 1].map((k) => (
            <group key={k}>
              <mesh position={[k * 0.85, 0, 0.15]} rotation={[0, 0, k * 0.25]}>
                <boxGeometry args={[0.7, 0.03, 0.45]} />
                <Mat color="#27415f" hl={hl === "energy"} metal={0.5} rough={0.35} />
              </mesh>
              <mesh position={[k * 0.38, 0.05, -0.75]}>
                <boxGeometry args={[0.05, 0.55, 0.6]} />
                <Mat color="#e6e8e9" hl={hl === "energy"} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {energy === "stirling" &&
        [-1, 1].map((k) => (
          <group key={k} position={[k * 0.6, 0, -0.35]}>
            <mesh rotation={X90}>
              <cylinderGeometry args={[0.15, 0.15, 0.55, 10]} />
              <Mat color="#9c7a45" hl={hl === "energy"} metal={0.7} rough={0.35} />
            </mesh>
            {[-0.15, 0, 0.15].map((z) => (
              <mesh key={z} position={[k * 0.2, 0, z]}>
                <boxGeometry args={[0.25, 0.4, 0.03]} />
                <Mat color="#d9dcde" hl={hl === "energy"} />
              </mesh>
            ))}
          </group>
        ))}
      {energy === "fission-reactor" && (
        <group>
          <mesh position={[0, 0, -1.35]} rotation={X90}>
            <cylinderGeometry args={[0.04, 0.04, 1.5, 6]} />
            <Mat color="#9aa0a4" hl={hl === "energy"} />
          </mesh>
          <mesh position={[0, 0, -2.2]} rotation={X90}>
            <cylinderGeometry args={[0.22, 0.22, 0.5, 10]} />
            <Mat color="#6b4a1f" hl={hl === "energy"} glow="#a35a10" />
          </mesh>
          {[-1, 1].map((k) => (
            <mesh key={k} position={[k * 0.9, 0, -1.8]}>
              <boxGeometry args={[1.4, 0.03, 0.5]} />
              <Mat color="#e6e8e9" hl={hl === "energy"} />
            </mesh>
          ))}
        </group>
      )}

      {s?.defense === "hts-field" && (
        <mesh position={[0, 0, -0.15]}>
          <torusGeometry args={[0.78, 0.045, 8, 32]} />
          <Mat color="#5fb4c4" hl={hl === "defense"} glow="#1f6a78" />
        </mesh>
      )}
      {s?.repair === "nanobots" &&
        (
          [
            [0.42, 0.42],
            [-0.42, 0.42],
            [0.42, -0.42],
            [-0.42, -0.42],
          ] as const
        ).map(([x, y]) => (
          <mesh key={`${x}${y}`} position={[x, y, -0.55]}>
            <icosahedronGeometry args={[0.09, 0]} />
            <Mat color="#b9c2c9" hl={hl === "repair"} metal={0.8} rough={0.3} />
          </mesh>
        ))}

      {science && (
        <group>
          {/* Copa de plasma que asoma por el borde del escudo */}
          <mesh position={[0.95, 0.35, 0.78]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.13, 0.22, 10, 1, true]} />
            <Mat color="#c9cdd0" hl={hl === "science"} metal={0.6} />
          </mesh>
          {/* Mástil del magnetómetro hacia atrás */}
          <mesh position={[0, 0.35, -1.15]} rotation={X90}>
            <cylinderGeometry args={[0.025, 0.025, 1.3, 5]} />
            <Mat color="#9aa0a4" hl={hl === "science"} />
          </mesh>
          <mesh position={[0, 0.35, -1.8]}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
            <Mat color="#2b2f33" hl={hl === "science"} />
          </mesh>
          {science === "sensors-capsule" && (
            <mesh position={[0, -0.35, -1.0]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.28, 0.4, 10]} />
              <Mat color="#e6e8e9" hl={hl === "science"} glow="#3a2a10" />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}

/** Nave armada con la selección del hangar, normalizada a tamaño 1. */
export function Spacecraft({
  kind,
  selected,
  highlight,
}: {
  kind: ShipKind;
  selected: Selection;
  highlight?: string | null;
}) {
  const deps = `${kind}|${JSON.stringify(selected ?? {})}`;
  return (
    <Normalized deps={deps}>
      {kind === "servicer" && <Servicer s={selected} hl={highlight} />}
      {kind === "probe" && <Probe s={selected} hl={highlight} />}
    </Normalized>
  );
}

/** Configuración real del paper (Solar Probe+): con ella se muestra el modelo de NASA. */
export const PARKER_CONFIG: Record<string, string> = {
  energy: "pv-cooled",
  shield: "shield-cc",
  science: "corona-sensors",
};

export function matchesParker(selected: Selection): boolean {
  if (!selected) return false;
  const keys = Object.keys(selected);
  return (
    keys.length === Object.keys(PARKER_CONFIG).length &&
    Object.entries(PARKER_CONFIG).every(([slot, id]) => selected[slot] === id)
  );
}

/** Piezas con modelo 3D. Objetivo, órbita y lanzador no son piezas de la nave. */
export const MODELED_PARTS = new Set([
  "panel-spare",
  "antenna-spare",
  "toolkit-std",
  "camera-insp",
  "pv-cooled",
  "stirling",
  "fission-reactor",
  "shield-cc",
  "shield-liquid-metal",
  "hts-field",
  "nanobots",
  "corona-sensors",
  "sensors-capsule",
]);
