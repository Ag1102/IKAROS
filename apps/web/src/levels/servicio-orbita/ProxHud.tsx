import { useEffect, useRef } from "react";
import type { PlayerAction, SimState, Vec3 } from "@ikaros/contracts";
import { formatNumber } from "../../ui/format";
import { KeyHint, KeyHints } from "../../game/KeyHint";
import { tr } from "../../i18n";

/** Velocidad lateral mientras se mantiene una tecla de centrado, m/s; con Mayús, fina. */
const LATERAL = 0.15;
const LATERAL_FINE = 0.04;
/** Lo que cambia la velocidad de cierre por cada repetición de W/S, m/s. */
const STEP = 0.02;
/** Cada cuánto se ordena a los propulsores mientras se pilota, ms. */
const TICK_MS = 100;
/** Velocidad de contacto máxima del juego, m/s (data/scenarios/level1-repair.json). */
const CONTACT_MAX = 0.15;

type Axis = "fwd" | "back" | "left" | "right" | "up" | "down";

const KEYS: Record<string, Axis> = {
  w: "fwd",
  s: "back",
  a: "left",
  d: "right",
  r: "up",
  f: "down",
  arrowup: "fwd",
  arrowdown: "back",
  arrowleft: "left",
  arrowright: "right",
};

export interface Thrusters {
  press: (a: Axis) => void;
  release: (a: Axis) => void;
  brake: () => void;
}

/**
 * Estabilizar: anula la deriva lateral y deja la velocidad de cierre en la sugerida si va más
 * rápido (o en cero si la nave se aleja). Lo que ya va despacio hacia el puerto se conserva.
 */
export function brakePulse(p: Vec3, v: Vec3): { x: number; y: number; z: number } {
  const closing = -v.x;
  const target = closing < 0 ? 0 : Math.min(closing, suggestedSpeed(Math.max(0, p.x)));
  return { x: -target - v.x, y: -v.y, z: -v.z };
}

/**
 * Mando por velocidad, como en los acoples modernos: mientras se mantiene A/D o R/F la nave se
 * desplaza a velocidad fija y al soltar se detiene sola. W sube el cierre hasta el sugerido y S lo
 * baja (hasta retroceder despacio). Devuelve el Δv que piden los propulsores.
 */
export function commandDv(held: ReadonlySet<Axis>, fine: boolean, p: Vec3, v: Vec3): Vec3 {
  const lat = fine ? LATERAL_FINE : LATERAL;
  const axis = (plus: Axis, minus: Axis) => (held.has(plus) ? lat : 0) - (held.has(minus) ? lat : 0);
  const dv = { x: 0, y: axis("up", "down") - v.y, z: axis("right", "left") - v.z };
  const closing = -v.x;
  if (held.has("fwd")) {
    const cap = Math.max(suggestedSpeed(Math.max(0, p.x)), 0.05);
    dv.x = -Math.min(cap, Math.max(closing, 0) + STEP) - v.x;
  } else if (held.has("back")) {
    dv.x = -Math.max(-0.1, closing - STEP) - v.x;
  }
  return dv;
}

/** Propulsores: teclado y botones, en cualquier combinación. */
export function useThrusters(
  act: (a: PlayerAction) => void,
  enabled: boolean,
  motion: () => { p?: Vec3; v?: Vec3 },
): Thrusters {
  const held = useRef(new Set<Axis>());
  const fine = useRef(false);
  const actRef = useRef(act);
  actRef.current = act;
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const send = (dv: Vec3) => {
    if (Math.hypot(dv.x, dv.y, dv.z) > 1e-3) actRef.current({ type: "rcs", ...dv });
  };
  const brake = () => {
    const { p, v } = motionRef.current();
    if (p && v) send(brakePulse(p, v));
  };
  const tick = () => {
    const { p, v } = motionRef.current();
    if (p && v) send(commandDv(held.current, fine.current, p, v));
  };

  useEffect(() => {
    if (!enabled) return;
    const keys = held.current;
    const id = window.setInterval(tick, TICK_MS);
    const down = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      fine.current = e.shiftKey;
      if ((e.key === " " || e.key.toLowerCase() === "b") && !e.repeat) {
        e.preventDefault();
        brake();
        return;
      }
      const a = KEYS[e.key.toLowerCase()];
      if (!a) return;
      e.preventDefault();
      if (!keys.has(a)) {
        keys.add(a);
        tick();
      }
    };
    const up = (e: KeyboardEvent) => {
      fine.current = e.shiftKey;
      const a = KEYS[e.key.toLowerCase()];
      if (a && keys.delete(a)) tick();
    };
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      keys.clear();
    };
    // tick y brake leen refs: basta con montar una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    press: (a) => {
      held.current.add(a);
      tick();
    },
    release: (a) => {
      if (held.current.delete(a)) tick();
    },
    brake,
  };
}

/** Gravedad estándar, m/s² (data/constants.json). */
const G0 = 9.80665;

/**
 * Maniobras que quedan antes de tocar la reserva: cada una es arrancar y parar un
 * desplazamiento lateral (Tsiolkovsky con la masa actual).
 */
export function maneuversLeft(spare_kg: number, mass_kg: number, isp_s: number): number {
  const perManeuver = (2 * LATERAL * mass_kg) / (isp_s * G0);
  return Math.max(0, Math.floor(spare_kg / perManeuver));
}

/** mm:ss */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Velocidad de cierre sugerida a una distancia, m/s: rápido lejos, muy lento al final. */
export function suggestedSpeed(range_m: number): number {
  return Math.min(0.5, 0.03 + range_m / 400);
}

/** HUD de la cámara de acople: retícula, alineación, distancia y velocidad de cierre. */
export function ProxHud({
  state,
  thrusters,
  isp_s,
  keep_kg_min,
}: {
  state: SimState;
  thrusters: Thrusters;
  isp_s: number;
  keep_kg_min: number;
}) {
  const spare = Math.max(0, (state.fuel_kg ?? 0) - (state.fuel_reserve_kg ?? 0));
  const moves = maneuversLeft(spare, state.resources.mass_kg, isp_s);
  const left = Math.max(0, (state.approach_deadline_s ?? 0) - state.resources.mission_elapsed_s);
  const p = state.rel_position_m ?? { x: 0, y: 0, z: 0 };
  const v = state.rel_velocity_m_s ?? { x: 0, y: 0, z: 0 };
  const closing = -v.x;
  const lateral = Math.hypot(p.y, p.z);
  const suggested = suggestedSpeed(p.x);
  const tooFast = closing > suggested * 1.3 || (p.x < 10 && closing > CONTACT_MAX);
  // Indicador de alineación: el punto es el puerto visto desde la nave (como en la vista 3D),
  // ±3 m en el recuadro. Hay que ir hacia él hasta meterlo en el círculo.
  const SPAN = 3;
  const dot = (m: number) => 50 + Math.max(-1, Math.min(1, m / SPAN)) * 50;
  // Una sola indicación a la vez: lo siguiente que conviene hacer.
  const hint =
    closing > suggested * 1.3 || (p.x < 10 && closing > CONTACT_MAX * 0.8)
      ? tr("Demasiado rápido: estabiliza con Espacio", "Too fast: stabilize with Space")
      : closing < -0.01
        ? tr("Te alejas: estabiliza con Espacio y acércate con W", "Drifting away: stabilize with Space, then W")
        : lateral > 0.25
          ? tr("Ve hacia el punto naranja: mantén A/D o R/F", "Move toward the orange dot: hold A/D or R/F")
          : closing < 0.02
            ? tr("Centrado: mantén W para acercarte", "Centered: hold W to close in")
            : tr("Bien. Mantén el rumbo y llega despacio", "Good. Hold course and arrive slowly");
  const btn = (a: Axis, label: string) => (
    <button
      className="rcs-btn"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        thrusters.press(a);
      }}
      onPointerUp={() => thrusters.release(a)}
      onPointerCancel={() => thrusters.release(a)}
      aria-label={label}
    >
      {label}
    </button>
  );
  return (
    <div className={`prox-hud${state.in_daylight === false ? " night" : ""}`}>
      <svg className="reticle" viewBox="-50 -50 100 100" aria-hidden="true">
        <circle r="18" />
        <line x1="-40" y1="0" x2="-8" y2="0" />
        <line x1="8" y1="0" x2="40" y2="0" />
        <line x1="0" y1="-40" x2="0" y2="-8" />
        <line x1="0" y1="8" x2="0" y2="40" />
      </svg>

      <p className="prox-hint">{hint}</p>

      <div className="prox-read">
        <div className="prox-res">
          <div className={`prox-big${left < 300 ? " warn" : ""}`}>
            <span>{tr("Ventana", "Window")}</span>
            <b className="num">{clock(left)}</b>
          </div>
          <div className={`prox-big${moves <= 2 ? " warn" : ""}`}>
            <span>{tr("Combustible útil", "Usable fuel")}</span>
            <b className="num">{formatNumber(spare)} kg</b>
            <small className="num">
              ≈ {moves} {tr("maniobras", "maneuvers")} · −{formatNumber(keep_kg_min)} kg/min
            </small>
          </div>
        </div>
        <div className="prox-big">
          <span>{tr("Distancia", "Range")}</span>
          <b className="num">{formatNumber(Math.max(0, p.x), p.x < 10 ? 2 : 1)} m</b>
        </div>
        <div className={`prox-big${tooFast ? " warn" : ""}`}>
          <span>{tr("Cierre", "Closing")}</span>
          <b className="num">{formatNumber(closing * 100, 1)} cm/s</b>
          <small className="num">
            {tr("sugerido", "suggested")} ≤ {formatNumber(suggested * 100, 0)}
          </small>
        </div>
        <div className="align" aria-label={tr("Alineación con el puerto", "Alignment with the port")}>
          <span className="align-cap" />
          <span className="align-dot" style={{ left: `${dot(-p.z)}%`, top: `${dot(p.y)}%` }} />
        </div>
        <div className="prox-small num">
          {tr("Desvío", "Offset")} {formatNumber(lateral * 100, 0)} cm · ↕ {formatNumber(p.y, 2)} · ↔{" "}
          {formatNumber(p.z, 2)} m
        </div>
        <div className="prox-chips">
          <span className={`chip${state.in_corridor === false ? " bad" : ""}`}>
            {state.in_corridor === false ? tr("FUERA DEL CORREDOR", "OUT OF CORRIDOR") : tr("CORREDOR", "CORRIDOR")}
          </span>
          <span className="chip">{state.in_daylight === false ? tr("NOCHE", "NIGHT") : tr("DÍA", "DAY")}</span>
        </div>
      </div>

      <div className="rcs-pad" aria-label={tr("Propulsores", "Thrusters")}>
        <div className="rcs-row">
          {btn("up", "R ▲")}
          {btn("fwd", "W ⇡")}
        </div>
        <div className="rcs-row">
          {btn("left", "A ◀")}
          {btn("back", "S ⇣")}
          {btn("right", "D ▶")}
        </div>
        <div className="rcs-row">
          {btn("down", "F ▼")}
          <button className="rcs-btn brake" onClick={thrusters.brake}>
            {tr("Estabilizar", "Stabilize")} ␣
          </button>
        </div>
        <KeyHints>
          <KeyHint keys={[tr("Espacio", "Space")]}>{tr("estabilizar", "stabilize")}</KeyHint>
          <KeyHint keys={["W", "S"]}>{tr("acercar / alejar", "closer / back")}</KeyHint>
          <KeyHint keys={["A", "D", "R", "F"]}>{tr("mantener para centrar", "hold to center")}</KeyHint>
          <KeyHint keys={[tr("Mayús", "Shift")]}>{tr("lento", "slow")}</KeyHint>
        </KeyHints>
      </div>
    </div>
  );
}
