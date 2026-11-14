import { useEffect } from "react";
import type { PlayerAction, SimState } from "@ikaros/contracts";
import { PAPER } from "../data/sources";
import { formatElapsed, formatNumber } from "../ui/format";
import { balanceOf, balanceText } from "./encounter";
import { Why } from "./Why";
import { why } from "./explanations";
import { tr } from "../i18n";

/** Retracción en escala logarítmica sobre el área iluminada: de toda la matriz a ~1 cm². */
const SLIDER_MAX = 1000;
const DECADES = 3;
const areaFromSlider = (v: number, full: number) => (v <= 0 ? 0 : full * 10 ** (DECADES * (v / SLIDER_MAX - 1)));
const sliderFromArea = (area: number, full: number) =>
  area <= 0 ? 0 : Math.round(SLIDER_MAX * (1 + Math.log10(Math.max(area, 1e-9) / full) / DECADES));

function Bar({
  label,
  pct,
  tone,
  marks,
}: {
  label: string;
  pct: number;
  tone: "good" | "warn" | "bad";
  marks?: number[];
}) {
  return (
    <div className={`sbar sbar-${tone}`}>
      <span className="sbar-label">{label}</span>
      <div className="sbar-track" aria-hidden="true">
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        {marks?.map((m) => (
          <i key={m} style={{ left: `${m}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Supervivencia en el encuentro solar: un solo control (esconder ⟷ exponer la matriz) y tres
 * barras. Si se acaba la energía, una cuenta atrás marca el apagón que hace perder la misión.
 */
export function SurvivalHud({
  state,
  fullArea_cm2,
  act,
  blackoutLeft_s,
}: {
  state: SimState;
  fullArea_cm2: number;
  act: (a: PlayerAction) => void;
  /** Tiempo de misión hasta perder la nave por falta de energía, o null si hay energía. */
  blackoutLeft_s: number | null;
}) {
  const area = state.array_illuminated_cm2 ?? fullArea_cm2;
  const slider = Math.max(0, Math.min(SLIDER_MAX, sliderFromArea(area, fullArea_cm2)));
  const set = (v: number) => {
    const a = areaFromSlider(Math.max(0, Math.min(SLIDER_MAX, v)), fullArea_cm2);
    act({ type: "retract-array", fraction: 1 - a / fullArea_cm2 });
  };

  // Flechas ↑ / ↓ para exponer o esconder sin usar el ratón.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") set(slider + 25);
      if (e.key === "ArrowDown") set(slider - 25);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const balance = balanceOf(state);
  const battery = ((state.battery_wh ?? 0) / Math.max(1, state.battery_capacity_wh ?? 1)) * 100;
  const cell = state.cell_temperature_c ?? 0;
  const CELL_SCALE = 400;
  const hull = state.hull_durability_pct ?? 100;

  return (
    <div className="survival">
      <p className="survival-dist">
        <span className="num">{formatNumber(state.distance_to_sun_rsun ?? 0, 1)}</span>{" "}
        {tr("R☉ del Sol", "R☉ from the Sun")}
      </p>
      <p className={`survival-state survival-${balance}`} role="status">
        {balanceText(balance)}
      </p>
      {blackoutLeft_s !== null && (
        <p className="blackout" role="alert">
          {tr("¡Sin energía! Apagón total en", "No power! Total blackout in")} {formatElapsed(blackoutLeft_s)}
        </p>
      )}
      <Bar
        label={tr("Batería", "Battery")}
        pct={battery}
        tone={battery < 25 ? "bad" : battery < 60 ? "warn" : "good"}
      />
      <Bar
        label={tr("Celdas", "Cells")}
        pct={(cell / CELL_SCALE) * 100}
        tone={cell > PAPER.cellDegradation_c ? "bad" : cell > PAPER.cellDesignLimit_c ? "warn" : "good"}
        marks={[(PAPER.cellDesignLimit_c / CELL_SCALE) * 100, (PAPER.cellDegradation_c / CELL_SCALE) * 100]}
      />
      <Bar label={tr("Casco", "Hull")} pct={hull} tone={hull < 30 ? "bad" : hull < 60 ? "warn" : "good"} />

      <label className="power survival-control" htmlFor="ret">
        <span>{tr("Esconder ⟷ Exponer · ↓ ↑", "Hide ⟷ Expose · ↓ ↑")}</span>
        <input
          id="ret"
          type="range"
          min={0}
          max={SLIDER_MAX}
          step={1}
          value={slider}
          onChange={(e) => set(Number(e.target.value))}
        />
      </label>
      <Why {...why("heat")} />
    </div>
  );
}
