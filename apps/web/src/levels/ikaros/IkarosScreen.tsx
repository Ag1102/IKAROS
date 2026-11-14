import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimEvent, SimState } from "@ikaros/contracts";
import { useSimulation } from "../../sim/useSimulation";
import { recordResult } from "../../progress";
import { IkarosScene, OrbitPreview, probeOrbit } from "./IkarosScene";
import { TopBar, type TimeScale } from "../../ui/Panels";
import { Report } from "../../ui/Report";
import { Assistant } from "../../ui/Assistant";
import { Overlay, type OverlayKind } from "../../ui/Overlay";
import { useHotkey } from "../../hooks/useHotkey";
import { usePreview } from "../../ships/usePreview";
import { MODELS } from "../../ships/models";
import { HangarLayout, focusName } from "../../ui/hangar/HangarLayout";
import { unlock } from "../../game/achievements";
import { tr } from "../../i18n";
import { apertureBand, encounterTimeScale } from "./stability";
import { DragParts, DropZone } from "./games/DragParts";
import { Cinematic } from "./games/Cinematic";
import { TapBoost } from "./games/TapBoost";
import { LeverAlign } from "./games/LeverAlign";
import { FoldArray } from "./games/FoldArray";
import { StabilityHud } from "./games/StabilityHud";
import { NanoRepair } from "./games/NanoRepair";
import { ShieldCharge } from "./games/ShieldCharge";
import { ReactorRods } from "./games/ReactorRods";
import { TimingBar } from "./games/TimingBar";
import { Reentry } from "./games/Reentry";

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;
const flybysOf = (def: ScenarioDefinition) =>
  Object.keys(def.params).filter((k) => /^perihelion_after_flyby_\d+_rsun$/.test(k)).length;
const openDecision = (events: SimEvent[], trigger: string) =>
  events.find((e) => e.trigger === trigger && e.choices && !e.resolved);

/** Velocidad del crucero entre ventanas de Venus: 4 semanas por segundo. */
const CRUISE_SCALE = 2_419_200;
/** Velocidad base del encuentro; el límite real lo pone encounterTimeScale. */
const ENCOUNTER_SCALE = 43_200;
/** Por debajo de esta distancia, si hay reactor, aparece su minijuego. */
const REACTOR_TRIGGER_AU = 0.12;

/**
 * Etapas del nivel. Las de juego pausan el tiempo; su resultado se traduce en acciones del
 * motor (ventanas de Venus, matriz, actitud, CME, eyección), que sigue mandando en la física.
 */
type Stage =
  | { k: "departure" }
  | { k: "cruise" }
  | { k: "venus-boost"; id: string; n: number }
  | { k: "venus-levers"; id: string; n: number; boost: boolean }
  | { k: "fold" }
  | { k: "sun" }
  | { k: "cme"; id: string }
  | { k: "reactor" }
  | { k: "samples" }
  | { k: "eject"; id: string }
  | { k: "reentry" }
  | { k: "arrival" }
  | { k: "debrief" };

interface Log {
  venus: boolean[];
  cme?: string;
  reactor?: boolean;
  samples?: number;
  eject?: boolean;
  reentry?: boolean;
  stable_s: number;
  encounter_s: number;
}

const GAME_STAGES = new Set<Stage["k"]>([
  "departure",
  "venus-boost",
  "venus-levers",
  "fold",
  "cme",
  "reactor",
  "samples",
  "eject",
  "reentry",
  "arrival",
]);

export function IkarosScreen({ onExit }: { onExit: () => void }) {
  const [stage, setStage] = useState<Stage>({ k: "cruise" });
  const [paused, setPaused] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [hideUi, setHideUi] = useState(false);
  const [log, setLog] = useState<Log>({ venus: [], stable_s: 0, encounter_s: 0 });
  const defRef = useRef<ScenarioDefinition | null>(null);

  const playing = !paused && !GAME_STAGES.has(stage.k);
  const baseScale = stage.k === "sun" ? ENCOUNTER_SCALE : CRUISE_SCALE;
  const { state, latest, act, restart, report, def } = useSimulation("level3-ikaros", playing ? baseScale : 0, (s) => {
    // Con una decisión abierta el tiempo se detiene hasta que el minijuego la responda.
    if (s.events.some((e) => e.choices && !e.resolved)) return 0;
    return s.phase === "encounter" && defRef.current ? encounterTimeScale(s, defRef.current) : Infinity;
  });
  defRef.current = def;
  useHotkey("h", () => setHideUi((v) => !v));

  const capsule = state.selected?.science === "sensors-capsule";
  const reactor = state.selected?.energy === "fission-reactor";

  // ---- Transiciones que dicta el motor ----
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    const from = prevPhase.current;
    prevPhase.current = state.phase;
    if (from === "hangar" && state.phase !== "hangar") setStage({ k: "departure" });
  }, [state.phase]);

  const flags = useRef({ reactor: false, samples: false });
  useEffect(() => {
    const s = state;
    if (stage.k === "cruise" && s.phase === "cruise") {
      const ev = openDecision(s.events, "level3:venus-window");
      if (ev) setStage({ k: "venus-boost", id: ev.id, n: log.venus.length + 1 });
      return;
    }
    if (stage.k === "cruise" && s.phase === "encounter") {
      setStage({ k: "fold" });
      return;
    }
    if (stage.k === "sun") {
      const cme = openDecision(s.events, "level3:cme");
      if (cme) return setStage({ k: "cme", id: cme.id });
      const r = s.distance_to_sun_au ?? 1;
      if (reactor && !flags.current.reactor && r < REACTOR_TRIGGER_AU) {
        flags.current.reactor = true;
        return setStage({ k: "reactor" });
      }
      if (!flags.current.samples && (s.distance_to_sun_rsun ?? Infinity) <= (s.perihelion_rsun ?? 0) * 1.04) {
        flags.current.samples = true;
        return setStage({ k: "samples" });
      }
      const ej = openDecision(s.events, "level3:ejection");
      if (ej) return setStage({ k: "eject", id: ej.id });
    }
    if (s.phase === "complete" && (stage.k === "sun" || stage.k === "cruise")) {
      // Fin por fallo (casco o energía) o sin cápsula: se pasa a la llegada o al informe.
      const failed = report?.outcome === "failure";
      setStage(failed ? { k: "debrief" } : { k: "arrival" });
    }
  }, [state, stage.k, reactor, report, log.venus.length]);

  // Tiempo de encuentro dentro de la zona estable (para la bitácora).
  const lastT = useRef<number | null>(null);
  useEffect(() => {
    if (stage.k !== "sun" || state.phase !== "encounter") {
      lastT.current = null;
      return;
    }
    const t = state.resources.mission_elapsed_s;
    if (lastT.current !== null && t > lastT.current) {
      const dt = t - lastT.current;
      const { min, max } = apertureBand(state, def);
      const area = state.array_illuminated_cm2 ?? 0;
      const ok = reactor || (area >= min && area <= max);
      setLog((l) => ({ ...l, encounter_s: l.encounter_s + dt, stable_s: l.stable_s + (ok ? dt : 0) }));
    }
    lastT.current = t;
  }, [state, stage.k, def, reactor]);

  useEffect(() => {
    if (report) recordResult(3, report.outcome);
    if (report?.outcome === "success") unlock("sun-survivor");
  }, [report]);

  const onRestart = () => {
    flags.current = { reactor: false, samples: false };
    setLog({ venus: [], stable_s: 0, encounter_s: 0 });
    setStage({ k: "cruise" });
    setPaused(false);
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

  if (stage.k === "departure" || stage.k === "arrival") {
    return (
      <Cinematic
        kind={stage.k}
        capsule={capsule && log.reentry === true}
        onDone={() => setStage(stage.k === "departure" ? { k: "cruise" } : { k: "debrief" })}
      />
    );
  }

  const flybys = flybysOf(def);
  const scales: TimeScale[] = [
    { value: 0, label: tr("Pausa", "Pause") },
    { value: baseScale, label: tr("Jugar", "Play") },
  ];

  return (
    <div className={hideUi ? "shell hide-ui" : "shell"}>
      <div className="viewport">
        <IkarosScene
          latest={latest}
          follow={stage.k !== "cruise" && stage.k !== "venus-boost" && stage.k !== "venus-levers"}
          aphelion_au={param(def, "aphelion_au")}
          perihelion_rsun={state.perihelion_rsun ?? param(def, "perihelion_start_rsun")}
        />
      </div>
      <TopBar
        state={state}
        timeScale={playing ? baseScale : 0}
        onTimeScale={(v) => setPaused(v === 0)}
        onTogglePanels={() => setHideUi((v) => !v)}
        onGlossary={() => setOverlay("glossary")}
        onCredits={() => setOverlay("credits")}
        onExit={onExit}
        subtitle={def.title}
        scales={scales}
      />
      <StageTrack stage={stage} flybys={flybys} done={log.venus.length} />

      {stage.k === "cruise" && state.phase === "cruise" && (
        <div className="cruise-banner">
          <span className="game-kicker">{tr("Crucero", "Cruise")}</span>
          <p>
            {tr(
              `Rumbo a la órbita de Venus · perihelio ${(state.perihelion_rsun ?? 0).toFixed(1)} R☉`,
              `Heading for Venus's orbit · perihelion ${(state.perihelion_rsun ?? 0).toFixed(1)} R☉`,
            )}
          </p>
        </div>
      )}

      {stage.k === "sun" && <StabilityHud state={state} def={def} act={act} />}

      <div className="game-layer">
        {stage.k === "venus-boost" && (
          <TapBoost
            key={stage.id}
            windowN={stage.n}
            total={flybys}
            onDone={(ok) => setStage({ k: "venus-levers", id: stage.id, n: stage.n, boost: ok })}
          />
        )}
        {stage.k === "venus-levers" && (
          <LeverAlign
            key={stage.id}
            seed={stage.n * 17}
            onDone={(ok) => {
              const success = ok && stage.boost;
              setLog((l) => ({ ...l, venus: [...l.venus, success] }));
              act({ type: "resolve-event", eventId: stage.id, choice: success ? "execute" : "skip" });
              setStage({ k: "cruise" });
            }}
          />
        )}
        {stage.k === "fold" && (
          <FoldArray
            onDone={() => {
              act({ type: "stow-main-array" });
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "cme" && (
          <CmeGame
            state={state}
            onChoice={(choice) => {
              setLog((l) => ({ ...l, cme: choice }));
              act({ type: "resolve-event", eventId: stage.id, choice });
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "reactor" && (
          <ReactorRods
            seed={Math.round(state.resources.mission_elapsed_s) % 97}
            onDone={(ok) => {
              setLog((l) => ({ ...l, reactor: ok }));
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "samples" && (
          <TimingBar
            kicker={tr(
              `Distancia récord · ${(state.distance_to_sun_rsun ?? 0).toFixed(1)} R☉`,
              `Record distance · ${(state.distance_to_sun_rsun ?? 0).toFixed(1)} R☉`,
            )}
            title={tr("Lanza la recogida de muestras", "Launch the sample collectors")}
            hint={tr(
              "Pulsa cuando el marcador cruce la ventana de plasma: 3 copas colectoras.",
              "Press when the marker crosses the plasma window: 3 collector cups.",
            )}
            button={tr("Lanzar copa", "Launch cup")}
            attempts={3}
            window={0.14}
            speed={1.1}
            theoretical
            resultText={(n) => ({
              ok: n >= 2,
              text: tr(`${n} de 3 copas llenas de corona.`, `${n} of 3 cups filled with corona.`),
            })}
            onDone={(n) => {
              setLog((l) => ({ ...l, samples: n }));
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "eject" && (
          <TimingBar
            kicker={tr("Salida del encuentro", "Leaving the encounter")}
            title={tr("Eyecta el módulo en la ventana", "Eject the module in the window")}
            hint={tr(
              "Pulsa cuando el marcador pase por la ventana de retorno a la Tierra.",
              "Press when the marker crosses the Earth-return window.",
            )}
            button={tr("Eyectar", "Eject")}
            attempts={1}
            window={0.16}
            speed={0.8}
            theoretical
            resultText={(n) => ({
              ok: n > 0,
              text:
                n > 0
                  ? tr("Cápsula en trayectoria de retorno.", "Capsule on its way home.")
                  : tr(
                      "Fuera de la ventana: la cápsula se queda a bordo.",
                      "Missed the window: the capsule stays aboard.",
                    ),
            })}
            onDone={(n) => {
              const ok = n > 0;
              setLog((l) => ({ ...l, eject: ok }));
              act({ type: "resolve-event", eventId: stage.id, choice: ok ? "eject" : "hold" });
              setStage(ok ? { k: "reentry" } : { k: "arrival" });
            }}
          />
        )}
        {stage.k === "reentry" && (
          <Reentry
            onDone={(ok) => {
              setLog((l) => ({ ...l, reentry: ok }));
              setStage({ k: "arrival" });
            }}
          />
        )}
      </div>

      {stage.k === "debrief" && report && (
        <Report
          report={report}
          onRestart={onRestart}
          extra={<GameLog log={log} capsule={capsule} reactor={reactor} />}
        />
      )}
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </div>
  );
}

/** La CME se juega según el equipo: nanobots, campo HTS o, sin ninguno, una decisión rápida. */
function CmeGame({ state, onChoice }: { state: SimState; onChoice: (c: string) => void }) {
  if (state.selected?.repair) {
    return (
      <NanoRepair
        seed={Math.round(state.resources.mission_elapsed_s) % 61}
        onDone={(ok) => onChoice(ok ? "nanobots" : "timeout")}
      />
    );
  }
  if (state.selected?.defense) {
    return <ShieldCharge onDone={(ok) => onChoice(ok ? "hts" : "timeout")} />;
  }
  return (
    <section className="game-card">
      <header>
        <span className="game-kicker">{tr("Eyección de masa coronal", "Coronal mass ejection")}</span>
        <h2>{tr("¿Cómo la enfrentas?", "How do you face it?")}</h2>
        <p className="game-hint">
          {tr("Sin nanobots ni campo HTS a bordo: elige rápido.", "No nanobots or HTS field aboard: choose quickly.")}
        </p>
      </header>
      <div className="game-body cme-choices">
        <button className="tap-btn" onClick={() => onChoice("safe-mode")}>
          {tr("Modo seguro: escudo al Sol", "Safe mode: shield to the Sun")}
        </button>
        <button className="tap-btn" onClick={() => onChoice("assistant")}>
          {tr("⚗ Delegar al asistente (80 %)", "⚗ Delegate to the assistant (80%)")}
        </button>
      </div>
    </section>
  );
}

const STEPS = (flybys: number) => [
  { id: "launch", label: tr("Despegue", "Liftoff") },
  ...Array.from({ length: flybys }, (_, i) => ({ id: `venus-${i}`, label: `Venus ${i + 1}` })),
  { id: "sun", label: tr("Sol", "Sun") },
  { id: "record", label: tr("Récord", "Record") },
  { id: "home", label: tr("Regreso", "Return") },
];

function stepIndex(stage: Stage, done: number, flybys: number): number {
  if (stage.k === "departure") return 0;
  if (stage.k === "cruise" || stage.k === "venus-boost" || stage.k === "venus-levers")
    return 1 + Math.min(done, flybys - 1);
  if (stage.k === "fold" || stage.k === "sun" || stage.k === "cme" || stage.k === "reactor") return flybys + 1;
  if (stage.k === "samples") return flybys + 2;
  return flybys + 3;
}

/** Barra de progreso de la misión con las etapas del nivel. */
function StageTrack({ stage, flybys, done }: { stage: Stage; flybys: number; done: number }) {
  const idx = stepIndex(stage, done, flybys);
  return (
    <ol className="stage-track" aria-label={tr("Etapas de la misión", "Mission stages")}>
      {STEPS(flybys).map((s, i) => (
        <li key={s.id} className={i < idx ? "done" : i === idx ? "now" : ""}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** Bitácora de los minijuegos para el informe. */
function GameLog({ log, capsule, reactor }: { log: Log; capsule: boolean; reactor: boolean }) {
  const stable = log.encounter_s > 0 ? Math.round((log.stable_s / log.encounter_s) * 100) : 0;
  const yes = (v: boolean | undefined) => (v === undefined ? "—" : v ? tr("logrado", "done") : tr("fallido", "failed"));
  const rows: [string, string][] = [
    [tr("Ventanas de Venus", "Venus windows"), `${log.venus.filter(Boolean).length} / ${log.venus.length}`],
    [tr("Tiempo estable cerca del Sol", "Stable time near the Sun"), `${stable} %`],
    [tr("CME", "CME"), log.cme ?? "—"],
  ];
  if (reactor) rows.push([tr("⚗ Núcleo del reactor", "⚗ Reactor core"), yes(log.reactor)]);
  rows.push([tr("⚗ Copas de muestras", "⚗ Sample cups"), log.samples === undefined ? "—" : `${log.samples} / 3`]);
  if (capsule) {
    rows.push([tr("⚗ Eyección de la cápsula", "⚗ Capsule ejection"), yes(log.eject)]);
    rows.push([tr("⚗ Reentrada", "⚗ Reentry"), yes(log.reentry)]);
  }
  return (
    <table className="mini game-log">
      <caption>{tr("Bitácora de vuelo", "Flight log")}</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td className="num">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
    attemptFrom === null ? [] : state.events.slice(attemptFrom).filter((e) => e.trigger === "level3:launch-blocked");
  const aphelion = param(def, "aphelion_au");
  const start = useMemo(() => probeOrbit(param(def, "perihelion_start_rsun"), aphelion), [def, aphelion]);
  const final = useMemo(
    () => probeOrbit(param(def, `perihelion_after_flyby_${flybysOf(def)}_rsun`), aphelion),
    [def, aphelion],
  );
  const mass = state.resources.mass_kg;
  const cap = state.mass_capacity_kg ?? 0;
  const budget = state.budget_remaining_usd_m ?? 0;
  const installed = def.slots.filter((s) => state.selected?.[s.id]).length;
  const { preview, highlight, onPreview } = usePreview(state.selected);

  return (
    <HangarLayout
      levelTitle={def.title}
      heading={tr("Arma la sonda", "Build the probe")}
      stage={tr(
        "Arrastra cada pieza hasta la sonda. Al lanzar, el diseño queda fijo.",
        "Drag each part onto the probe. At launch the design is frozen.",
      )}
      briefing={def.briefing}
      objectives={def.objectives}
      model={MODELS.parker}
      focus={focusName(def, preview, highlight)}
      slots={<DragParts def={def} state={state} act={act} onPreview={onPreview} />}
      overlay={<DropZone installed={installed} total={def.slots.length} />}
      stats={[
        { label: tr("Masa al lanzamiento", "Launch mass"), value: mass, max: cap, unit: "kg", warn: mass > cap },
        {
          label: tr("Presupuesto restante", "Budget left"),
          value: budget,
          max: param(def, "budget_usd_m"),
          unit: "M USD",
          warn: budget < 0,
        },
        { label: tr("Consumo eléctrico", "Power draw"), value: state.power_load_w ?? 0, unit: "W" },
      ]}
      extra={
        <>
          <h3 className="hstat-title">{tr("Trayectoria", "Trajectory")}</h3>
          <div className="orbit-preview" aria-label={tr("Órbita inicial y final", "Initial and final orbit")}>
            <OrbitPreview start={start} final={final} />
            <span className="preview-note">
              {tr("Gris: primera órbita · Blanca: tras Venus", "Grey: first orbit · White: after Venus")}
            </span>
          </div>
        </>
      }
      problems={blocked.map((e) => e.text.replace(/^Lanzamiento bloqueado: /, ""))}
      launchLabel={tr("Despegar", "Lift off")}
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
