import { useEffect, useMemo, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { physics } from "@ikaros/sim";
import { Scene } from "../../scene/Scene";
import { useSimulation } from "../../sim/useSimulation";
import { C } from "../../data/sources";
import { EventLog, ResourcesPanel, TopBar } from "../../ui/Panels";
import { HangarSlots } from "../../ui/HangarSlots";
import { Assistant } from "../../ui/Assistant";
import { Report } from "../../ui/Report";
import { useLaunchSequence } from "../../ui/LaunchSequence";
import { Overlay, type OverlayKind } from "../../ui/Overlay";
import { formatNumber } from "../../ui/format";
import { useHotkey } from "../../hooks/useHotkey";
import { MODELS } from "../../ships/models";
import { HangarLayout, focusName } from "../../ui/hangar/HangarLayout";
import { usePreview } from "../../ships/usePreview";

const STEPS = [
  { phase: "hangar", label: "Hangar" },
  { phase: "transfer", label: "Transferencia" },
  { phase: "repair", label: "Reparación" },
  { phase: "complete", label: "Informe" },
];

/** Altitud que alcanzaría una transferencia de Hohmann con este Δv, km (física del motor). */
function altitudeAfter(state: SimState, dv_m_s: number): number {
  const r1 = C.earthRadius + (state.altitude_km ?? 0);
  return physics.hohmannTarget(C.muEarth, r1, dv_m_s / 1000) - C.earthRadius;
}

/** Hay una transferencia en curso si el último encendido aún no tuvo llegada (acople o fallo). */
function inTransfer(state: SimState): boolean {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const t = state.events[i]?.trigger;
    if (t === "level1:docked" || t === "level1:miss") return false;
    if (t === "level1:burn") return true;
  }
  return false;
}

function Stepper({ phase }: { phase: string }) {
  const idx = STEPS.findIndex((s) => s.phase === phase);
  return (
    <ol className="stepper" aria-label="Fases del nivel">
      {STEPS.map((s, i) => (
        <li key={s.phase} className={i < idx ? "done" : i === idx ? "now" : ""}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

export function ServicioOrbitaScreen({ onExit }: { onExit: () => void }) {
  const [timeScale, setTimeScale] = useState(60);
  const [dv, setDv] = useState(0);
  const [hideUi, setHideUi] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [follow, setFollow] = useState(false);
  const { state, latest, act, restart, report, def } = useSimulation("level1-repair", timeScale);
  const launchSeq = useLaunchSequence(state.phase, def.title);

  useHotkey("h", () => setHideUi((v) => !v));

  const docked = state.phase === "repair" || report?.metrics.docked === true;
  useEffect(() => {
    if (state.phase === "repair") setFollow(true);
  }, [state.phase]);

  const transferring = inTransfer(state);
  const canBurn = state.phase === "transfer" && !transferring;
  const preview = useMemo(() => (canBurn && dv !== 0 ? altitudeAfter(state, dv) : null), [canBurn, dv, state]);

  const onRestart = () => {
    setDv(0);
    setFollow(false);
    restart();
  };

  if (state.phase === "hangar") {
    return (
      <>
        <HangarPage def={def} state={state} act={act} onExit={onExit} onOverlay={setOverlay} />
        <Overlay kind={overlay} onClose={() => setOverlay(null)} />
      </>
    );
  }

  return (
    <div className={hideUi ? "shell hide-ui" : "shell"}>
      <div className="viewport">
        <Scene latest={latest} docked={docked} previewAltitude={preview} follow={follow} />
      </div>
      <TopBar
        state={state}
        timeScale={timeScale}
        onTimeScale={setTimeScale}
        onTogglePanels={() => setHideUi((v) => !v)}
        follow={follow}
        onFollow={() => setFollow((v) => !v)}
        onGlossary={() => setOverlay("glossary")}
        onCredits={() => setOverlay("credits")}
        onExit={onExit}
        subtitle={def.title}
      />
      <aside className="side">
        <ResourcesPanel state={state} />
        <EventLog events={state.events} />
      </aside>
      <footer className="orbit-note">
        Tierra y órbitas a escala real; naves con tamaño mínimo para verlas · Arrastra: girar · Rueda: zoom · Clic
        derecho: desplazar · H: paneles
      </footer>
      <aside className="guide-wrap">
        <section className="panel guide" aria-labelledby="guide-h">
          <h2 id="guide-h">Guía de misión</h2>
          <Stepper phase={state.phase} />
          {state.phase === "transfer" && (
            <TransferStep
              state={state}
              dv={dv}
              setDv={setDv}
              preview={preview}
              transferring={transferring}
              onBurn={() => {
                act({ type: "burn", delta_v_m_s: dv });
                setDv(0);
              }}
            />
          )}
          {state.phase === "repair" && <RepairStep state={state} />}
          {report && <Report report={report} onRestart={onRestart} />}
          <Assistant events={state.events} />
        </section>
      </aside>
      {launchSeq}
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </div>
  );
}

function HangarPage({
  def,
  state,
  act,
  onExit,
  onOverlay,
}: {
  def: ScenarioDefinition;
  state: SimState;
  act: (a: PlayerAction) => void;
  onExit: () => void;
  onOverlay: (k: OverlayKind) => void;
}) {
  const [attemptFrom, setAttemptFrom] = useState<number | null>(null);
  const blocked =
    attemptFrom === null
      ? []
      : state.events.slice(attemptFrom).filter((e) => e.kind === "warning" && /bloqueado/i.test(e.text));
  const cargo = def.components.filter((c) => state.selected?.[c.slot] === c.id).reduce((m, c) => m + c.mass_kg, 0);
  const cap = state.mass_capacity_kg ?? 0;
  const budget = state.budget_remaining_usd_m ?? 0;
  const { preview, highlight, onPreview } = usePreview(state.selected);

  return (
    <HangarLayout
      levelTitle={def.title}
      heading="Carga del transbordador"
      stage="Etapa de diseño: estudio de compromisos (CML 3)."
      briefing={def.briefing}
      objectives={def.objectives}
      model={MODELS.shuttle}
      focus={focusName(def, preview, highlight)}
      slots={<HangarSlots def={def} state={state} act={act} onPreview={onPreview} />}
      stats={[
        { label: "Carga en bodega", value: cargo, max: cap, unit: "kg", warn: cargo > cap },
        { label: "Δv disponible", value: state.delta_v_remaining_m_s ?? 0, digits: 1, unit: "m/s" },
        {
          label: "Presupuesto restante",
          value: budget,
          max: def.params.budget_usd_m?.value ?? budget,
          unit: "M USD",
          warn: budget < 0,
        },
      ]}
      extra={
        <p className="note">
          Cada kilo en la bodega reduce el Δv (ecuación de Tsiolkovsky). Lleva solo lo que piden las reparaciones.
        </p>
      }
      problems={blocked.map((e) => e.text)}
      launchLabel="Lanzar"
      onLaunch={() => {
        setAttemptFrom(state.events.length);
        act({ type: "launch" });
      }}
      assistant={<Assistant events={state.events} max={1} />}
      onExit={onExit}
      onGlossary={() => onOverlay("glossary")}
      onCredits={() => onOverlay("credits")}
    />
  );
}

function TransferStep({
  state,
  dv,
  setDv,
  preview,
  transferring,
  onBurn,
}: {
  state: SimState;
  dv: number;
  setDv: (v: number) => void;
  preview: number | null;
  transferring: boolean;
  onBurn: () => void;
}) {
  const alt = state.altitude_km ?? 0;
  const target = state.target_altitude_km ?? 0;
  const max = Math.max(1, Math.min(80, state.delta_v_remaining_m_s ?? 0));
  return (
    <>
      <table className="mini">
        <tbody>
          <tr>
            <th>Altitud actual</th>
            <td className="num">{formatNumber(alt, 1)} km</td>
          </tr>
          <tr>
            <th>Altitud del satélite</th>
            <td className="num">{formatNumber(target, 1)} km</td>
          </tr>
          <tr>
            <th>Diferencia</th>
            <td className="num">{formatNumber(target - alt, 1)} km</td>
          </tr>
        </tbody>
      </table>
      {transferring ? (
        <p className="note">Transferencia en curso. Puedes acelerar el tiempo hasta la llegada.</p>
      ) : (
        <div className="burn">
          <label htmlFor="dv">
            Δv del encendido <span className="num">{formatNumber(dv, 1)} m/s</span>
          </label>
          <input
            id="dv"
            type="range"
            min={-20}
            max={max}
            step={0.1}
            value={dv}
            onChange={(e) => setDv(Number(e.target.value))}
          />
          <p className="note">
            Altitud tras la transferencia:{" "}
            <span className="num">{preview === null ? "—" : `${formatNumber(preview, 1)} km`}</span> (línea punteada).
            Hay que quedar a ±2 km del satélite.
          </p>
          <button className="primary" disabled={dv === 0} onClick={onBurn}>
            Encender
          </button>
        </div>
      )}
    </>
  );
}

function RepairStep({ state }: { state: SimState }) {
  const progress = state.repair_progress_pct ?? 0;
  return (
    <>
      <p>
        Acoplado.{" "}
        {state.comm_window_open
          ? "Estación terrena a la vista: se repara."
          : "Sin enlace: la reparación espera al siguiente pase."}
      </p>
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div style={{ width: `${progress}%` }} />
      </div>
      <p className="note">
        Progreso <span className="num">{formatNumber(progress, 0)} %</span> · datos enviados{" "}
        <span className="num">{formatNumber(state.data_downlinked_mb ?? 0, 1)} MB</span>
      </p>
    </>
  );
}
