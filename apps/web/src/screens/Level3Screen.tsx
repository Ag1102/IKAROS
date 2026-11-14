import { useState } from "react";
import type { SimState } from "@ikaros/contracts";
import { Hangar } from "../level3/Hangar";
import { BUDGET_USD_M, checkDesign, type Design } from "../level3/catalog";
import { AU_KM } from "../sim/kepler";
import { CELL_LIMIT_C, Encounter, RSUN_KM, type EncounterConfig } from "../level3/encounter";
import { MISSION_EPOCH_DAY, trajectoryById } from "../level3/trajectory";
import { Level3Scene } from "../level3/Level3Scene";
import { EventLog, ResourcesPanel, TopBar } from "../ui/Panels";
import { Overlay, type OverlayKind } from "../ui/Overlay";
import { Assistant } from "../ui/Assistant";
import { formatNumber } from "../ui/format";
import { useGameLoop } from "../hooks/useGameLoop";
import { useHotkey } from "../hooks/useHotkey";

const INITIAL: Design = { parts: ["shield-flat", "pv-primary", "pv-secondary"], launcher: "l-m", trajectory: "v7" };

function toConfig(d: Design): EncounterConfig {
  const has = (id: string) => d.parts.includes(id);
  return {
    hasSecondary: has("pv-secondary"),
    hasReactor: has("reactor"),
    hasStirling: has("stirling"),
    liquidShield: has("shield-liquid"),
    hasHts: has("hts"),
    hasNano: has("nano"),
    hasCapsule: has("capsule"),
    extraUse_w: checkDesign(d).uses_w,
    perihelion_au: trajectoryById(d.trajectory).perihelion_au,
    aphelion_au: trajectoryById(d.trajectory).aphelion_au,
  };
}

export function Level3Screen({ onExit }: { onExit: () => void }) {
  const [design, setDesign] = useState<Design>(INITIAL);
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind>(null);

  return (
    <>
      {enc ? (
        <EncounterView enc={enc} design={design} onBack={() => setEnc(null)} onExit={onExit} onOverlay={setOverlay} />
      ) : (
        <Hangar
          design={design}
          onChange={setDesign}
          onExit={onExit}
          onCredits={() => setOverlay("credits")}
          onGlossary={() => setOverlay("glossary")}
          onLaunch={() => setEnc(new Encounter(toConfig(design)))}
        />
      )}
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </>
  );
}

function EncounterView({
  enc,
  design,
  onBack,
  onExit,
  onOverlay,
}: {
  enc: Encounter;
  design: Design;
  onBack: () => void;
  onExit: () => void;
  onOverlay: (k: OverlayKind) => void;
}) {
  const [, setFrame] = useState(0);
  const [timeScale, setTimeScale] = useState(3600);
  const [exposed, setExposed] = useState(100);
  const [hideUi, setHideUi] = useState(false);
  const [follow, setFollow] = useState(true);

  useGameLoop(
    (dt) => enc.step(dt),
    () => setFrame((n) => n + 1),
    timeScale,
  );
  useHotkey("h", () => setHideUi((v) => !v));

  const check = checkDesign(design);
  // Se arma en cada render para que los paneles reflejen los cambios también en pausa.
  const state: SimState = {
    scenario: "level3-ikaros",
    resources: {
      mass_kg: check.mass_kg,
      power_generated_w: enc.powerW,
      power_consumed_w: enc.requiredW,
      budget_usd_m: BUDGET_USD_M - check.cost_usd_m,
      data_stored_mb: 0,
      downlink_rate_kbps: 0,
      mission_elapsed_s: enc.t,
    },
    health:
      enc.outcome === "failure" || enc.damage >= 100
        ? "critical"
        : enc.cellTemp_c > CELL_LIMIT_C || enc.powerW < enc.requiredW
          ? "warning"
          : "nominal",
    phase: enc.phase,
    events: enc.events,
  };

  const reference = Math.min(100, (16 / enc.suns) * 100);
  const done = enc.outcome !== null;
  const lowPct = (enc.belowMin_s / enc.durationS) * 100;
  const traj = trajectoryById(design.trajectory);
  const periRsun = (traj.perihelion_au * AU_KM) / RSUN_KM;
  // Día (desde J2000) del perihelio, solo para situar los planetas en la escena.
  const encounterDay = MISSION_EPOCH_DAY + traj.duration_yr * 365.25;

  return (
    <div className={hideUi ? "shell hide-ui" : "shell"}>
      <div className="viewport">
        <Level3Scene enc={enc} follow={follow} encounterDay={encounterDay} />
      </div>
      <TopBar
        state={state}
        timeScale={timeScale}
        onTimeScale={setTimeScale}
        onTogglePanels={() => setHideUi((v) => !v)}
        follow={follow}
        onFollow={() => setFollow((v) => !v)}
        onGlossary={() => onOverlay("glossary")}
        onCredits={() => onOverlay("credits")}
        onExit={onExit}
        subtitle="Nivel 3 · Encuentro solar"
        scales={[0, 600, 3600, 21600]}
      />
      <aside className="side">
        <ResourcesPanel state={state} />
        <EventLog events={state.events} />
      </aside>
      <footer className="orbit-note">
        Distancias y Sol a escala real; planetas y sonda con tamaño mínimo para verlos · Arrastra: girar · Rueda: zoom ·
        Clic derecho: desplazar · H: paneles
      </footer>
      <aside className="guide-wrap">
        <section className="panel guide" aria-labelledby="enc-h">
          <h2 id="enc-h">Encuentro solar</h2>
          <p className="note">⚗ Simulación de prueba: la física definitiva la aporta el motor de simulación.</p>
          <table className="mini">
            <tbody>
              <tr>
                <th>Distancia al Sol</th>
                <td className="num">
                  {formatNumber(enc.distanceRsun, 1)} R☉ · {formatNumber(enc.distanceAU, 3)} AU
                </td>
              </tr>
              <tr>
                <th>Intensidad solar</th>
                <td className="num">{formatNumber(enc.suns)} × AM0</td>
              </tr>
              <tr className={enc.cellTemp_c > CELL_LIMIT_C ? "neg" : ""}>
                <th>Temperatura de celdas</th>
                <td className="num">
                  {enc.cfg.hasSecondary ? `${formatNumber(enc.cellTemp_c)} °C / ${CELL_LIMIT_C}` : "—"}
                </td>
              </tr>
              <tr>
                <th>Daño de celdas</th>
                <td className="num">{formatNumber(enc.damage, 1)} %</td>
              </tr>
              <tr className={enc.powerW < enc.requiredW ? "neg" : ""}>
                <th>Potencia</th>
                <td className="num">
                  {formatNumber(enc.powerW)} / {formatNumber(enc.requiredW)} W
                </td>
              </tr>
              <tr>
                <th>Perihelio previsto</th>
                <td className="num">
                  {formatNumber(periRsun, 1)} R☉ · {traj.flybys} sobrevuelos de Venus
                </td>
              </tr>
            </tbody>
          </table>

          {!done && (
            <div className="burn">
              <label htmlFor="exp">
                Matriz secundaria expuesta <span className="num">{formatNumber(exposed, 1)} %</span>
              </label>
              <input
                id="exp"
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={exposed}
                disabled={!enc.cfg.hasSecondary}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setExposed(v);
                  enc.setExposed(v / 100);
                }}
              />
              <p className="note">
                Referencia del paper: la matriz se retrae para mantener casi constante la carga térmica. Con la
                intensidad actual, exposición ≈ 16 / intensidad ={" "}
                <span className="num">{formatNumber(reference, 1)} %</span>.
              </p>
              <Assistant trigger="l3:encounter" />
            </div>
          )}

          {done && (
            <>
              <p className={enc.outcome === "failure" ? "neg-text" : "ok-text"}>
                {enc.outcome === "success"
                  ? "MISIÓN CUMPLIDA"
                  : enc.outcome === "partial"
                    ? "MISIÓN PARCIAL"
                    : "MISIÓN FALLIDA"}{" "}
                · Puntuación <span className="num">{formatNumber(enc.score)}</span>
              </p>
              <ul className="segments" aria-label="Informe por segmentos de misión">
                <li>
                  <b>Lanzamiento</b>
                  Masa {formatNumber(check.mass_kg)} kg de {formatNumber(check.capacity_kg)} kg; costo{" "}
                  {formatNumber(check.cost_usd_m)} M USD de {formatNumber(BUDGET_USD_M)} M USD.
                </li>
                <li>
                  <b>Espacio</b>
                  {enc.cfg.hasSecondary
                    ? `Temperatura máxima de celdas ${formatNumber(enc.maxTemp_c)} °C (límite ${CELL_LIMIT_C} °C); daño ${formatNumber(enc.damage, 1)} %; `
                    : "Sin matriz solar en servicio; "}
                  {formatNumber(lowPct, 1)} % del tiempo con potencia insuficiente.
                </li>
                <li>
                  <b>Tierra</b>
                  Comunicaciones durante el encuentro: no modeladas en este prototipo.
                </li>
                <li>
                  <b>Usuario</b>
                  {enc.outcome === "failure"
                    ? "La sonda no completó el encuentro."
                    : `La sonda llegó a ${formatNumber(periRsun, 1)} R☉ y volvió a salir${enc.cfg.hasCapsule ? ", con muestras de la corona (⚗)" : ""}.`}
                </li>
              </ul>
              <Assistant trigger="l3:result" />
              <button className="primary" onClick={onBack}>
                Volver al hangar
              </button>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
