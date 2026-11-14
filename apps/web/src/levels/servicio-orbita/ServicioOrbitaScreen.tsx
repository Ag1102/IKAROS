import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { physics } from "@ikaros/sim";
import { Scene } from "../../scene/Scene";
import { useSimulation } from "../../sim/useSimulation";
import { recordResult, recordStars } from "../../progress";
import { ScoreHud, ScoreProvider, pilotRatio, starsFor, useScore } from "../../game/score";
import { BoltSequence } from "../../game/BoltSequence";
import { menuLevels } from "../../menu/levels";
import { C } from "../../data/sources";
import { EventLog, ResourcesPanel, TopBar } from "../../ui/Panels";
import { HangarSlots } from "../../ui/HangarSlots";
import { Assistant } from "../../ui/Assistant";
import { Report } from "../../ui/Report";
import { useLaunchSequence } from "../../ui/LaunchSequence";
import { Overlay, type OverlayKind } from "../../ui/Overlay";
import { formatNumber } from "../../ui/format";
import { useHotkey } from "../../hooks/useHotkey";
import { HoldToBurn } from "../../game/HoldToBurn";
import { Callout } from "../../game/Callout";
import { Why } from "../../game/Why";
import { Stars } from "../../game/Stars";
import { unlock } from "../../game/achievements";
import { why } from "../../game/explanations";
import { MODELS } from "../../ships/models";
import { HangarLayout, focusName } from "../../ui/hangar/HangarLayout";
import { usePreview } from "../../ships/usePreview";
import { phaseLabel } from "../../ui/Panels";
import { tr } from "../../i18n";

const STEPS = ["hangar", "transfer", "repair", "complete"];

/** Altitud que alcanzaría una transferencia de Hohmann con este Δv, km (física del motor). */
/** Resultado del último encendido, en una frase. */
function LastBurn({ state }: { state: SimState }) {
  const miss = [...state.events].reverse().find((e) => e.trigger === "level1:miss");
  if (!miss) return null;
  const diff = (state.target_altitude_km ?? 0) - (state.altitude_km ?? 0);
  return (
    <Callout tone="almost">
      {diff > 0
        ? tr(`Te faltaron ${formatNumber(diff, 1)} km.`, `You were ${formatNumber(diff, 1)} km short.`)
        : tr(`Te pasaste ${formatNumber(-diff, 1)} km.`, `You overshot by ${formatNumber(-diff, 1)} km.`)}{" "}
      {tr("¡Corrige con otro impulso!", "Correct with another burn!")}
    </Callout>
  );
}

/** Estrellas del acople: menos encendidos, más estrellas. */
export function dockStars(state: SimState): number {
  const burns = state.events.filter((e) => e.trigger === "level1:burn").length;
  return burns <= 1 ? 3 : burns === 2 ? 2 : 1;
}

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
  const idx = STEPS.indexOf(phase);
  return (
    <ol className="stepper" aria-label={tr("Fases del nivel", "Level phases")}>
      {STEPS.map((s, i) => (
        <li key={s} className={i < idx ? "done" : i === idx ? "now" : ""}>
          {phaseLabel(s)}
        </li>
      ))}
    </ol>
  );
}

export function ServicioOrbitaScreen(props: { onExit: () => void }) {
  return (
    <ScoreProvider>
      <ServicioOrbitaGame {...props} />
    </ScoreProvider>
  );
}

/** Caminatas espaciales por misión: una en cada uno de los primeros pases con el enlace abierto. */
const EVAS = 2;

function ServicioOrbitaGame({ onExit }: { onExit: () => void }) {
  const [timeScale, setTimeScale] = useState(60);
  const [dv, setDv] = useState(0);
  const [hideUi, setHideUi] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [follow, setFollow] = useState(false);
  const [eva, setEva] = useState<number | null>(null);
  const score = useScore();
  const { state, latest, act, restart, report, def } = useSimulation("level1-repair", eva === null ? timeScale : 0);
  const launchSeq = useLaunchSequence(state.phase, def.title);

  // Una misión cumplida desbloquea el nivel siguiente; las estrellas suman la destreza del piloto.
  const stars = report ? starsFor(report.outcome, pilotRatio(score.ratings)) : 0;
  useEffect(() => {
    if (!report) return;
    recordResult(1, report.outcome);
    recordStars(1, stars);
  }, [report, stars]);

  // Cada llegada de una transferencia se califica: acople a la primera = perfecto.
  const seenEvents = useRef(0);
  const evaCount = useRef(0);
  useEffect(() => {
    const evs = state.events.slice(seenEvents.current);
    seenEvents.current = state.events.length;
    for (const e of evs) {
      if (e.trigger === "level1:docked") {
        const n = dockStars(state);
        score.add(n === 3 ? "perfect" : "good", tr("Acople", "Docking"));
      } else if (e.trigger === "level1:miss") {
        score.add("fail", tr("Transferencia corta o larga", "Transfer off target"));
      } else if (e.trigger === "level1:aos" && state.phase === "repair" && evaCount.current < EVAS) {
        evaCount.current++;
        setEva(evaCount.current);
      }
    }
    // score.add es estable; basta con los eventos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.events]);

  useHotkey("h", () => setHideUi((v) => !v));

  const docked = state.phase === "repair" || report?.metrics.docked === true;
  useEffect(() => {
    if (state.phase === "repair") setFollow(true);
  }, [state.phase]);

  const transferring = inTransfer(state);
  const canBurn = state.phase === "transfer" && !transferring;
  const preview = useMemo(() => (canBurn && dv !== 0 ? altitudeAfter(state, dv) : null), [canBurn, dv, state]);

  const onRestart = () => {
    seenEvents.current = 0;
    evaCount.current = 0;
    setEva(null);
    score.reset();
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
      <footer className="orbit-note">{tr("H · ocultar paneles", "H · hide panels")}</footer>
      <aside className="guide-wrap">
        <section className="panel guide" aria-labelledby="guide-h">
          <h2 id="guide-h">{tr("Guía de misión", "Mission guide")}</h2>
          <Stepper phase={state.phase} />
          {state.phase === "transfer" && (
            <TransferStep
              state={state}
              setDv={setDv}
              transferring={transferring}
              onBurn={(value) => {
                act({ type: "burn", delta_v_m_s: value });
                setDv(0);
              }}
            />
          )}
          {state.phase === "repair" && <RepairStep state={state} />}
          {report && (
            <Report
              report={report}
              onRestart={onRestart}
              unlocks={menuLevels()[1]?.name}
              extra={
                <div className="debrief-stars">
                  <Stars n={stars} />
                  <span>
                    {tr("Puntos de piloto", "Pilot points")} <b className="num">{formatNumber(score.points)}</b>
                  </span>
                </div>
              }
            />
          )}
          <Assistant events={state.events} />
        </section>
      </aside>
      <ScoreHud />
      {eva !== null && (
        <div className="game-layer">
          <BoltSequence
            key={eva}
            seed={eva * 5}
            title={
              eva === 1
                ? tr("Cambia el panel solar", "Replace the solar panel")
                : tr("Monta la antena", "Mount the antenna")
            }
            onDone={(r) => {
              score.add(r, tr(`Caminata espacial ${eva}`, `Spacewalk ${eva}`));
              setEva(null);
            }}
          />
        </div>
      )}
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
      : state.events.slice(attemptFrom).filter((e) => e.kind === "warning" && /bloqueado|blocked/i.test(e.text));
  const cargo = def.components.filter((c) => state.selected?.[c.slot] === c.id).reduce((m, c) => m + c.mass_kg, 0);
  const cap = state.mass_capacity_kg ?? 0;
  const budget = state.budget_remaining_usd_m ?? 0;
  const { preview, highlight, onPreview } = usePreview(state.selected);

  return (
    <HangarLayout
      levelTitle={def.title}
      heading={tr("Carga del transbordador", "Shuttle cargo")}
      stage={tr("Etapa de diseño: estudio de compromisos (CML 3).", "Design stage: trade study (CML 3).")}
      briefing={def.briefing}
      objectives={def.objectives}
      model={MODELS.shuttle}
      focus={focusName(def, preview, highlight)}
      slots={<HangarSlots def={def} state={state} act={act} onPreview={onPreview} />}
      stats={[
        { label: tr("Carga en bodega", "Cargo in bay"), value: cargo, max: cap, unit: "kg", warn: cargo > cap },
        {
          label: tr("Δv disponible", "Available Δv"),
          value: state.delta_v_remaining_m_s ?? 0,
          digits: 1,
          unit: "m/s",
        },
        {
          label: tr("Presupuesto restante", "Budget left"),
          value: budget,
          max: def.params.budget_usd_m?.value ?? budget,
          unit: "M USD",
          warn: budget < 0,
        },
      ]}
      problems={blocked.map((e) => e.text)}
      launchLabel={tr("Lanzar", "Launch")}
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
  setDv,
  transferring,
  onBurn,
}: {
  state: SimState;
  setDv: (v: number) => void;
  transferring: boolean;
  onBurn: (dv_m_s: number) => void;
}) {
  const alt = state.altitude_km ?? 0;
  const target = state.target_altitude_km ?? 0;
  return (
    <>
      <table className="mini">
        <tbody>
          <tr>
            <th>{tr("Altitud actual", "Current altitude")}</th>
            <td className="num">{formatNumber(alt, 1)} km</td>
          </tr>
          <tr>
            <th>{tr("Altitud del satélite", "Satellite altitude")}</th>
            <td className="num">{formatNumber(target, 1)} km</td>
          </tr>
          <tr>
            <th>{tr("Diferencia", "Difference")}</th>
            <td className="num">{formatNumber(target - alt, 1)} km</td>
          </tr>
        </tbody>
      </table>
      {transferring ? (
        <p className="note">{tr("En camino… acelera el tiempo.", "On the way… speed up time.")}</p>
      ) : (
        <>
          <LastBurn state={state} />
          <HoldToBurn
            alt_km={alt}
            target_km={target}
            maxDv_m_s={state.delta_v_remaining_m_s ?? 0}
            onAim={(v) => setDv(v ?? 0)}
            onBurn={onBurn}
          />
          <Why {...why("hohmann")} />
        </>
      )}
    </>
  );
}

function RepairStep({ state }: { state: SimState }) {
  const progress = state.repair_progress_pct ?? 0;
  const stars = dockStars(state);
  useEffect(() => {
    if (stars === 3) unlock("dock-first-try");
  }, [stars]);
  return (
    <>
      <Stars n={stars} />
      <Callout tone="good">{tr("¡Acoplado!", "Docked!")}</Callout>
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
        {state.comm_window_open
          ? tr("Reparando…", "Repairing…")
          : tr("Esperando a la estación terrena…", "Waiting for the ground station…")}
      </p>
    </>
  );
}
