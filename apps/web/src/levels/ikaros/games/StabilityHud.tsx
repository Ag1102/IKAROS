import { useEffect, useRef } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { PAPER } from "../../../data/sources";
import { formatNumber } from "../../../ui/format";
import { tr } from "../../../i18n";
import { apertureBand, areaToKnob, knobToArea } from "../stability";
import { useFrameLoop, useHeldKeys } from "../../../game/minigame";
import { KeyHint, KeyHints } from "../../../game/KeyHint";

/**
 * Puzzle de estabilidad del paso por el Sol. La perilla vertical abre o cierra la matriz
 * secundaria tras el escudo (escala logarítmica); la franja verde es la zona donde hay
 * energía suficiente y las celdas no pasan de 120 °C. La franja se estrecha y se mueve al
 * acercarse al Sol. Mantener pulsado «Transmitir» gira la antena a la Tierra para bajar
 * datos, pero saca los radiadores de la sombra.
 */
export function StabilityHud({
  state,
  def,
  act,
}: {
  state: SimState;
  def: ScenarioDefinition;
  act: (a: PlayerAction) => void;
}) {
  const reactor = state.selected?.energy === "fission-reactor";
  const { min, max, full } = apertureBand(state, def);
  const area = state.array_illuminated_cm2 ?? full;
  const k = areaToKnob(area, full);
  const kMin = areaToKnob(min, full);
  const kMax = areaToKnob(max, full);
  const inBand = reactor || (area >= min && area <= max);
  const track = useRef<HTMLDivElement>(null);

  const setKnob = (v: number) => {
    const a = knobToArea(v, full);
    act({ type: "retract-array", fraction: Math.max(0, Math.min(1, 1 - a / full)) });
  };
  const fromPointer = (clientY: number) => {
    const r = track.current?.getBoundingClientRect();
    if (r) setKnob(1 - (clientY - r.top) / r.height);
  };
  // ↑/↓ mantenidas abren o cierran la matriz de forma continua.
  const held = useHeldKeys(["ArrowUp", "ArrowDown"]);
  const kRef = useRef(k);
  kRef.current = k;
  useFrameLoop((dt) => {
    if (reactor) return;
    const dir = (held.current.has("ArrowUp") ? 1 : 0) - (held.current.has("ArrowDown") ? 1 : 0);
    if (dir !== 0) setKnob(kRef.current + dir * 0.25 * dt);
  });

  const cell = state.cell_temperature_c ?? 0;
  const power = state.resources.power_generated_w;
  const load = state.power_load_w ?? 0;
  const storage = def.params.data_storage_mb?.value ?? 1;
  const stored = state.resources.data_stored_mb;
  const transmitting = state.attitude === "antenna-to-earth";
  const setAttitude = (a: "shield-to-sun" | "antenna-to-earth") => {
    if (state.attitude !== a) act({ type: "set-attitude", attitude: a });
  };
  // T mantenida: antena a la Tierra mientras se pulsa.
  const attRef = useRef(setAttitude);
  attRef.current = setAttitude;
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if ((e.key === "t" || e.key === "T") && !e.repeat) attRef.current("antenna-to-earth");
    };
    const u = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") attRef.current("shield-to-sun");
    };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, []);

  return (
    <section className="stability" aria-label={tr("Estabilidad de la sonda", "Probe stability")}>
      <div className="stab-dial">
        <p className="game-kicker">{tr("Matriz secundaria", "Secondary array")}</p>
        {reactor ? (
          <p className="note">
            {tr(
              "⚗ El reactor da la energía: la matriz queda guardada tras el escudo.",
              "⚗ The reactor supplies power: the array stays behind the shield.",
            )}
          </p>
        ) : (
          <div
            ref={track}
            className={`aperture${inBand ? " ok" : " off"}`}
            role="slider"
            tabIndex={0}
            aria-label={tr("Área iluminada", "Illuminated area")}
            aria-valuetext={`${formatNumber(area, area < 10 ? 1 : 0)} cm²`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPointer(e.clientY);
            }}
            onPointerMove={(e) => e.buttons && fromPointer(e.clientY)}
            onWheel={(e) => setKnob(k - Math.sign(e.deltaY) * 0.02)}
          >
            <i
              className="aperture-band"
              style={{ bottom: `${kMin * 100}%`, height: `${Math.max(1, (kMax - kMin) * 100)}%` }}
            />
            <b className="aperture-knob" style={{ bottom: `${k * 100}%` }} />
          </div>
        )}
        {!reactor && (
          <p className="stab-read num">
            {formatNumber(area, area < 10 ? 1 : 0)} cm²
            <small>
              {tr("zona", "zone")} {formatNumber(min, min < 10 ? 1 : 0)}–{formatNumber(max, max < 10 ? 1 : 0)}
            </small>
          </p>
        )}
      </div>

      <div className="stab-panel">
        <p className={`stab-status ${inBand && cell <= PAPER.cellDesignLimit_c ? "good" : "bad"}`}>
          {!inBand && area > max
            ? tr("¡Demasiada luz! Cierra la matriz", "Too much light! Close the array")
            : !inBand
              ? tr("Falta energía: abre la matriz", "Not enough power: open the array")
              : cell > PAPER.cellDesignLimit_c
                ? tr("Celdas calientes: espera a que bajen", "Cells hot: wait for them to cool")
                : tr("Sonda estable", "Probe stable")}
        </p>
        <dl className="stab-grid">
          <dt>{tr("Distancia", "Distance")}</dt>
          <dd className="num">{formatNumber(state.distance_to_sun_rsun ?? 0, 1)} R☉</dd>
          <dt>{tr("Velocidad", "Speed")}</dt>
          <dd className="num">{formatNumber(state.speed_km_s ?? 0, 1)} km/s</dd>
          <dt>{tr("Celdas", "Cells")}</dt>
          <dd className={`num${cell > PAPER.cellDesignLimit_c ? " neg-text" : ""}`}>
            {formatNumber(cell)} / {PAPER.cellDesignLimit_c} °C
          </dd>
          <dt>{tr("Energía", "Power")}</dt>
          <dd className={`num${power < load ? " neg-text" : ""}`}>
            {formatNumber(power)} / {formatNumber(load)} W
          </dd>
          <dt>{tr("Casco", "Hull")}</dt>
          <dd className="num">{formatNumber(state.hull_durability_pct ?? 0, 1)} %</dd>
          <dt>{tr("Batería", "Battery")}</dt>
          <dd className="num">
            {formatNumber(((state.battery_wh ?? 0) / Math.max(1, state.battery_capacity_wh ?? 1)) * 100)} %
          </dd>
        </dl>
        <div className="stab-data">
          <span>
            {tr("Memoria", "Memory")}{" "}
            <span className="num">
              {formatNumber(stored)} / {formatNumber(storage)} MB
            </span>
          </span>
          <div className="gauge-bar">
            <div style={{ width: `${Math.min(100, (stored / storage) * 100)}%` }} />
          </div>
          <button
            className={`hold-btn${transmitting ? " on" : ""}`}
            onPointerDown={() => setAttitude("antenna-to-earth")}
            onPointerUp={() => setAttitude("shield-to-sun")}
            onPointerLeave={() => setAttitude("shield-to-sun")}
            onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setAttitude("antenna-to-earth")}
            onKeyUp={() => setAttitude("shield-to-sun")}
          >
            {transmitting
              ? tr("Transmitiendo… radiadores al sol", "Transmitting… radiators in sunlight")
              : tr("Mantener para transmitir datos", "Hold to transmit data")}
          </button>
          <KeyHints>
            {!reactor && <KeyHint keys={["↑", "↓"]}>{tr("matriz (mantén)", "array (hold)")}</KeyHint>}
            <KeyHint keys={["T"]}>{tr("transmitir (mantén)", "transmit (hold)")}</KeyHint>
          </KeyHints>
        </div>
      </div>
    </section>
  );
}
