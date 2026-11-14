import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimEvent, SimState } from "@ikaros/contracts";
import { useSimulation } from "../../sim/useSimulation";
import { recordResult, recordStars } from "../../progress";
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
import { ScoreHud, ScoreProvider, pilotRatio, starsFor, useScore, type Rating } from "../../game/score";
import { Stars } from "../../game/Stars";
import { KeyHint, KeyHints } from "../../game/KeyHint";
import { lesson } from "../../game/learn";
import { formatNumber } from "../../ui/format";
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
import { CoolantLoops } from "./games/CoolantLoops";
import { TimingBar } from "../../game/TimingBar";
import { Reentry } from "./games/Reentry";
import { RecordBanner } from "./games/RecordBanner";

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;
const flybysOf = (def: ScenarioDefinition) =>
  Object.keys(def.params).filter((k) => /^perihelion_after_flyby_\d+_rsun$/.test(k)).length;
const openDecision = (events: SimEvent[], trigger: string) =>
  events.find((e) => e.trigger === trigger && e.choices && !e.resolved);

/** Velocidad del crucero entre ventanas de Venus: 4 semanas por segundo. */
const CRUISE_SCALE = 2_419_200;
/** Velocidad base del encuentro; el límite real lo pone encounterTimeScale. */
const ENCOUNTER_SCALE = 43_200;
/** Sin zambullida, el reactor (si lo hay) se arranca al bajar de esta distancia. */
const REACTOR_TRIGGER_AU = 0.12;
/** ⚗ El kit Ikaros: lo que hace posible la zambullida a 850.000 km. */
const IKAROS_KIT: Record<string, string> = {
  energy: "fission-reactor",
  shield: "shield-cc",
  defense: "hts-field",
  repair: "nanobots",
  science: "sensors-capsule",
};

/**
 * Etapas del nivel. Las de juego pausan el tiempo; su resultado se traduce en acciones del
 * motor (ventanas de Venus, zambullida, matriz, actitud, CME, eyección), que manda en la física.
 */
type Stage =
  | { k: "departure" }
  | { k: "cruise" }
  | { k: "venus-boost"; id: string; n: number }
  | { k: "venus-levers"; id: string; n: number; boost: Rating }
  | { k: "dive-reactor"; id: string }
  | { k: "dive-cooling"; id: string }
  | { k: "dive-hts"; id: string }
  | { k: "fold" }
  | { k: "sun" }
  | { k: "cme"; id: string }
  | { k: "reactor" }
  | { k: "nano" }
  | { k: "record" }
  | { k: "samples" }
  | { k: "eject"; id: string }
  | { k: "reentry" }
  | { k: "arrival" }
  | { k: "debrief" };

const GAME_STAGES = new Set<Stage["k"]>([
  "departure",
  "venus-boost",
  "venus-levers",
  "dive-reactor",
  "dive-cooling",
  "dive-hts",
  "fold",
  "cme",
  "reactor",
  "nano",
  "record",
  "samples",
  "eject",
  "reentry",
  "arrival",
]);

interface LogRow {
  label: string;
  rating: Rating;
  theoretical?: boolean;
}

export function IkarosScreen(props: { onExit: () => void }) {
  return (
    <ScoreProvider>
      <IkarosGame {...props} />
    </ScoreProvider>
  );
}

function IkarosGame({ onExit }: { onExit: () => void }) {
  const [stage, setStage] = useState<Stage>({ k: "cruise" });
  const [paused, setPaused] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [hideUi, setHideUi] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [stable, setStable] = useState({ in_s: 0, total_s: 0 });
  const [capsuleHome, setCapsuleHome] = useState(false);
  const score = useScore();
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
  useHotkey("p", () => setPaused((v) => !v));

  const capsule = state.selected?.science === "sensors-capsule";
  const reactor = state.selected?.energy === "fission-reactor";
  const parker = param(def, "parker_record_rsun");
  const dived = state.events.some((e) => e.trigger === "level3:dive");

  /** Registra un reto: puntos, combo y fila en la bitácora. */
  const rate = (rating: Rating, label: string, theoretical = false) => {
    score.add(rating, label);
    setLog((l) => [...l, { label, rating, theoretical }]);
  };

  // ---- Transiciones que dicta el motor ----
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    const from = prevPhase.current;
    prevPhase.current = state.phase;
    if (from === "hangar" && state.phase !== "hangar") setStage({ k: "departure" });
  }, [state.phase]);

  const flags = useRef({ reactor: false, samples: false, record: false, nano: false, stability: false });
  const venusCount = useRef(0);
  useEffect(() => {
    const s = state;
    if (stage.k === "cruise" && s.phase === "cruise") {
      const ev = openDecision(s.events, "level3:venus-window");
      if (ev) return setStage({ k: "venus-boost", id: ev.id, n: venusCount.current + 1 });
      const dive = openDecision(s.events, "level3:ikaros-dive");
      if (dive) return setStage({ k: "dive-reactor", id: dive.id });
      return;
    }
    if (stage.k === "cruise" && s.phase === "encounter") return setStage({ k: "fold" });
    if (stage.k === "sun") {
      const cme = openDecision(s.events, "level3:cme");
      if (cme) return setStage({ k: "cme", id: cme.id });
      const r = s.distance_to_sun_au ?? 1;
      if (reactor && !dived && !flags.current.reactor && r < REACTOR_TRIGGER_AU) {
        flags.current.reactor = true;
        return setStage({ k: "reactor" });
      }
      if (dived && !flags.current.nano && (s.hull_durability_pct ?? 100) < 92) {
        flags.current.nano = true;
        return setStage({ k: "nano" });
      }
      const atPeri = (s.distance_to_sun_rsun ?? Infinity) <= (s.perihelion_rsun ?? 0) * 1.04;
      if (atPeri && !flags.current.record && (s.perihelion_rsun ?? Infinity) < parker) {
        flags.current.record = true;
        return setStage({ k: "record" });
      }
      if (atPeri && !flags.current.samples) {
        flags.current.samples = true;
        return setStage({ k: "samples" });
      }
      const ej = openDecision(s.events, "level3:ejection");
      if (ej) return setStage({ k: "eject", id: ej.id });
    }
    if (s.phase === "complete" && (stage.k === "sun" || stage.k === "cruise")) {
      const failed = report?.outcome === "failure";
      setStage(failed ? { k: "debrief" } : { k: "arrival" });
    }
  }, [state, stage.k, reactor, report, dived, parker]);

  // Estabilidad: tiempo de encuentro dentro de la zona segura; se califica al salir.
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
      setStable((v) => ({ in_s: v.in_s + (ok ? dt : 0), total_s: v.total_s + dt }));
    }
    lastT.current = t;
  }, [state, stage.k, def, reactor]);
  useEffect(() => {
    if (flags.current.stability || stable.total_s === 0 || state.phase === "encounter") return;
    flags.current.stability = true;
    const ratio = stable.in_s / stable.total_s;
    rate(
      ratio >= 0.85 ? "perfect" : ratio >= 0.6 ? "good" : "fail",
      tr("Estabilidad cerca del Sol", "Stability near the Sun"),
    );
    // rate cambia en cada render; basta con la fase y el tiempo acumulado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, stable.total_s]);

  const stars = report ? starsFor(report.outcome, pilotRatio(score.ratings)) : 0;
  useEffect(() => {
    if (!report || stage.k !== "debrief") return;
    recordResult(3, report.outcome);
    recordStars(3, stars);
    if (report.outcome === "success") unlock("sun-survivor");
  }, [report, stage.k, stars]);

  const onRestart = () => {
    flags.current = { reactor: false, samples: false, record: false, nano: false, stability: false };
    venusCount.current = 0;
    setLog([]);
    setStable({ in_s: 0, total_s: 0 });
    setCapsuleHome(false);
    score.reset();
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
        capsule={capsule && capsuleHome}
        onDone={() => setStage(stage.k === "departure" ? { k: "cruise" } : { k: "debrief" })}
      />
    );
  }

  const flybys = flybysOf(def);
  const scales: TimeScale[] = [
    { value: 0, label: tr("Pausa", "Pause") },
    { value: baseScale, label: tr("Jugar", "Play") },
  ];
  const sunGame = stage.k === "sun";

  /** Cierra la secuencia de la zambullida: si algún sistema falló, Ikaros se queda en 9,5 R☉. */
  const endDive = (id: string, rating: Rating, label: string, theoretical = true) => {
    rate(rating, label, theoretical);
    if (rating === "fail") {
      act({ type: "resolve-event", eventId: id, choice: "stay" });
      setStage({ k: "cruise" });
      return false;
    }
    return true;
  };

  return (
    <div className={hideUi ? "shell hide-ui" : "shell"}>
      <div className="viewport">
        <IkarosScene
          latest={latest}
          follow={
            !["cruise", "venus-boost", "venus-levers", "dive-reactor", "dive-cooling", "dive-hts"].includes(stage.k)
          }
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
      <ScoreHud />
      <StageTrack stage={stage} flybys={flybys} done={venusCount.current} dive={dived} />

      {stage.k === "cruise" && state.phase === "cruise" && (
        <div className="cruise-banner">
          <span className="game-kicker">{tr("Crucero", "Cruise")}</span>
          <p>
            {tr(
              `Rumbo a la órbita de Venus · perihelio ${(state.perihelion_rsun ?? 0).toFixed(1)} R☉ · récord a batir: Parker ${parker} R☉`,
              `Heading for Venus's orbit · perihelion ${(state.perihelion_rsun ?? 0).toFixed(1)} R☉ · record to beat: Parker ${parker} R☉`,
            )}
          </p>
          <KeyHints>
            <KeyHint keys={["P"]}>{tr("pausa", "pause")}</KeyHint>
            <KeyHint keys={["H"]}>{tr("paneles", "panels")}</KeyHint>
          </KeyHints>
        </div>
      )}

      {sunGame && <StabilityHud state={state} def={def} act={act} />}

      <div className="game-layer">
        {stage.k === "venus-boost" && (
          <TapBoost
            key={stage.id}
            windowN={stage.n}
            total={flybys}
            onDone={(r) => {
              rate(r, tr(`Potencia hacia Venus ${stage.n}`, `Power toward Venus ${stage.n}`));
              setStage({ k: "venus-levers", id: stage.id, n: stage.n, boost: r });
            }}
          />
        )}
        {stage.k === "venus-levers" && (
          <LeverAlign
            key={stage.id}
            seed={stage.n * 17}
            onDone={(r) => {
              rate(r, tr(`Inserción en Venus ${stage.n}`, `Venus insertion ${stage.n}`));
              venusCount.current++;
              const ok = r !== "fail" && stage.boost !== "fail";
              act({ type: "resolve-event", eventId: stage.id, choice: ok ? "execute" : "skip" });
              setStage({ k: "cruise" });
            }}
          />
        )}
        {stage.k === "dive-reactor" && (
          <DiveIntro>
            <ReactorRods
              seed={7}
              onDone={(r) => {
                if (endDive(stage.id, r, tr("Arranque del mini reactor", "Mini reactor start-up")))
                  setStage({ k: "dive-cooling", id: stage.id });
              }}
            />
          </DiveIntro>
        )}
        {stage.k === "dive-cooling" && (
          <DiveIntro>
            <CoolantLoops
              onDone={(r) => {
                if (endDive(stage.id, r, tr("Enfriamiento del reactor", "Reactor cooling")))
                  setStage({ k: "dive-hts", id: stage.id });
              }}
            />
          </DiveIntro>
        )}
        {stage.k === "dive-hts" && (
          <DiveIntro>
            <ShieldCharge
              onDone={(r) => {
                if (endDive(stage.id, r, tr("Campo magnético HTS", "HTS magnetic field"))) {
                  act({ type: "resolve-event", eventId: stage.id, choice: "dive" });
                  setStage({ k: "cruise" });
                }
              }}
            />
          </DiveIntro>
        )}
        {stage.k === "fold" && (
          <FoldArray
            onDone={(r) => {
              rate(r, tr("Matriz principal plegada", "Main array folded"));
              act({ type: "stow-main-array" });
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "cme" && (
          <CmeGame
            state={state}
            onChoice={(choice, r) => {
              if (r) rate(r, tr("Defensa ante la CME", "CME defence"), true);
              act({ type: "resolve-event", eventId: stage.id, choice });
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "reactor" && (
          <ReactorRods
            seed={Math.round(state.resources.mission_elapsed_s) % 97}
            onDone={(r) => {
              rate(r, tr("Núcleo del reactor", "Reactor core"), true);
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "nano" && (
          <NanoRepair
            seed={Math.round(state.resources.mission_elapsed_s) % 61}
            onDone={(r) => {
              rate(r, tr("Reparación con nanobots", "Nanobot repair"), true);
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "record" && (
          <RecordBanner
            distance_rsun={state.distance_to_sun_rsun ?? 0}
            speed_km_s={state.speed_km_s ?? 0}
            parker_rsun={parker}
            dive={dived}
            onDone={() => {
              unlock("sun-survivor");
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "samples" && (
          <TimingBar
            kicker={tr(
              `Distancia récord · ${(state.distance_to_sun_rsun ?? 0).toFixed(2)} R☉`,
              `Record distance · ${(state.distance_to_sun_rsun ?? 0).toFixed(2)} R☉`,
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
            lesson={lesson("samples")}
            resultText={(n) => ({
              ok: n >= 2,
              text: tr(`${n} de 3 copas llenas de corona.`, `${n} of 3 cups filled with corona.`),
            })}
            onDone={(n) => {
              rate(
                n === 3 ? "perfect" : n === 2 ? "good" : "fail",
                tr("Muestras de la corona", "Corona samples"),
                true,
              );
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
            lesson={lesson("eject")}
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
              rate(ok ? "perfect" : "fail", tr("Eyección de la cápsula", "Capsule ejection"), true);
              act({ type: "resolve-event", eventId: stage.id, choice: ok ? "eject" : "hold" });
              setStage(ok ? { k: "reentry" } : { k: "arrival" });
            }}
          />
        )}
        {stage.k === "reentry" && (
          <Reentry
            onDone={(r) => {
              rate(r, tr("Reentrada de la cápsula", "Capsule reentry"), true);
              setCapsuleHome(r !== "fail");
              setStage({ k: "arrival" });
            }}
          />
        )}
      </div>

      {stage.k === "debrief" && report && (
        <Report
          report={report}
          onRestart={onRestart}
          extra={<Debrief stars={stars} points={score.points} log={log} stable={stable} />}
        />
      )}
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </div>
  );
}

/** Cabecera de la secuencia de la zambullida: el kit Ikaros entra en acción. */
function DiveIntro({ children }: { children: React.ReactNode }) {
  return (
    <div className="dive-seq">
      <p className="dive-title">
        {tr("⚗ Zambullida Ikaros · 850.000 km", "⚗ Ikaros dive · 850,000 km")}
        <small>
          {tr(
            "Prepara el kit: reactor, enfriamiento y campo magnético",
            "Ready the kit: reactor, cooling and magnetic field",
          )}
        </small>
      </p>
      {children}
    </div>
  );
}

/** La CME se juega según el equipo: campo HTS, nanobots o, sin ninguno, una decisión rápida. */
function CmeGame({ state, onChoice }: { state: SimState; onChoice: (c: string, r?: Rating) => void }) {
  if (state.selected?.defense) {
    return <ShieldCharge onDone={(r) => onChoice(r === "fail" ? "timeout" : "hts", r)} />;
  }
  if (state.selected?.repair) {
    return (
      <NanoRepair
        seed={Math.round(state.resources.mission_elapsed_s) % 61}
        onDone={(r) => onChoice(r === "fail" ? "timeout" : "nanobots", r)}
      />
    );
  }
  return <CmeChoice onChoice={(c) => onChoice(c)} />;
}

function CmeChoice({ onChoice }: { onChoice: (c: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") onChoice("safe-mode");
      else if (e.key === "2") onChoice("assistant");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChoice]);
  return (
    <section className="game-card">
      <header>
        <span className="game-kicker">{tr("Eyección de masa coronal", "Coronal mass ejection")}</span>
        <h2>{tr("¿Cómo la enfrentas?", "How do you face it?")}</h2>
        <p className="game-hint">
          {tr(
            "Sin campo magnético ni nanobots a bordo: elige rápido.",
            "No magnetic field or nanobots aboard: choose quickly.",
          )}
        </p>
      </header>
      <div className="game-body cme-choices">
        <button className="tap-btn" onClick={() => onChoice("safe-mode")}>
          <kbd>1</kbd> {tr("Modo seguro: escudo al Sol", "Safe mode: shield to the Sun")}
        </button>
        <button className="tap-btn" onClick={() => onChoice("assistant")}>
          <kbd>2</kbd> {tr("⚗ Delegar al asistente (80 %)", "⚗ Delegate to the assistant (80%)")}
        </button>
      </div>
    </section>
  );
}

const STEPS = (flybys: number, dive: boolean) => [
  { id: "launch", label: tr("Despegue", "Liftoff") },
  ...Array.from({ length: flybys }, (_, i) => ({ id: `venus-${i}`, label: `Venus ${i + 1}` })),
  ...(dive ? [{ id: "dive", label: tr("⚗ Zambullida", "⚗ Dive") }] : []),
  { id: "sun", label: tr("Sol", "Sun") },
  { id: "record", label: tr("Récord", "Record") },
  { id: "home", label: tr("Regreso", "Return") },
];

function stepIndex(stage: Stage, done: number, flybys: number, dive: boolean): number {
  const d = dive ? 1 : 0;
  if (stage.k === "departure") return 0;
  if (stage.k === "dive-reactor" || stage.k === "dive-cooling" || stage.k === "dive-hts") return flybys + 1;
  if (stage.k === "cruise" || stage.k === "venus-boost" || stage.k === "venus-levers")
    return 1 + Math.min(done, flybys - 1 + d);
  if (["fold", "sun", "cme", "reactor", "nano"].includes(stage.k)) return flybys + 1 + d;
  if (stage.k === "record" || stage.k === "samples") return flybys + 2 + d;
  return flybys + 3 + d;
}

/** Barra de progreso de la misión con las etapas del nivel. */
function StageTrack({ stage, flybys, done, dive }: { stage: Stage; flybys: number; done: number; dive: boolean }) {
  const idx = stepIndex(stage, done, flybys, dive);
  return (
    <ol className="stage-track" aria-label={tr("Etapas de la misión", "Mission stages")}>
      {STEPS(flybys, dive).map((s, i) => (
        <li key={s.id} className={i < idx ? "done" : i === idx ? "now" : ""}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

const RATING_TEXT = (r: Rating) =>
  ({ perfect: tr("perfecto", "perfect"), good: tr("bien", "good"), fail: tr("fallo", "miss") })[r];

/** Cabecera del informe: estrellas, puntos de piloto y bitácora de los retos. */
function Debrief({
  stars,
  points,
  log,
  stable,
}: {
  stars: number;
  points: number;
  log: LogRow[];
  stable: { in_s: number; total_s: number };
}) {
  return (
    <div className="debrief-extra">
      <div className="debrief-stars">
        <Stars n={stars} />
        <span>
          {tr("Puntos de piloto", "Pilot points")} <b className="num">{formatNumber(points)}</b>
        </span>
      </div>
      <table className="mini game-log">
        <caption>{tr("Bitácora de vuelo", "Flight log")}</caption>
        <tbody>
          {log.map((row, i) => (
            <tr key={i} className={`rating-${row.rating}`}>
              <th>
                {row.theoretical ? "⚗ " : ""}
                {row.label}
              </th>
              <td className="num">{RATING_TEXT(row.rating)}</td>
            </tr>
          ))}
          {stable.total_s > 0 && (
            <tr>
              <th>{tr("Tiempo en la zona segura", "Time in the safe zone")}</th>
              <td className="num">{Math.round((stable.in_s / stable.total_s) * 100)} %</td>
            </tr>
          )}
        </tbody>
      </table>
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
  const kit = Object.entries(IKAROS_KIT);
  const hasKit = ["energy", "defense", "repair"].every((slot) => state.selected?.[slot] === IKAROS_KIT[slot]);
  const equipKit = () => {
    for (const [slot, id] of kit) act({ type: "select-component", slot, componentId: id });
  };
  useHotkey("k", equipKit);
  const launch = () => {
    setAttemptFrom(state.events.length);
    act({ type: "launch" });
  };
  useHotkey("l", launch);

  return (
    <HangarLayout
      levelTitle={def.title}
      heading={tr("Arma la sonda", "Build the probe")}
      stage={tr(
        "Arrastra cada pieza hasta la sonda (o Tab y Enter). Al lanzar, el diseño queda fijo.",
        "Drag each part onto the probe (or Tab and Enter). At launch the design is frozen.",
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
          <section className={`kit-card${hasKit ? " on" : ""}`} aria-label={tr("Kit Ikaros", "Ikaros kit")}>
            <h3 className="hstat-title">{tr("⚗ Kit Ikaros: para hacer historia", "⚗ Ikaros kit: to make history")}</h3>
            <p className="note">
              {hasKit
                ? tr(
                    "Listo: tras los 3 sobrevuelos de Venus podrás zambullirte a 850.000 km del Sol.",
                    "Ready: after the 3 Venus flybys you can dive to 850,000 km from the Sun.",
                  )
                : tr(
                    "Sin el kit, Ikaros llega a 9,5 R☉ (ya más cerca que Parker). Con reactor, campo HTS y nanobots se abre la zambullida a 850.000 km.",
                    "Without the kit, Ikaros reaches 9.5 R☉ (already closer than Parker). With reactor, HTS field and nanobots the 850,000 km dive opens up.",
                  )}
            </p>
            <ul className="kit-list">
              {(["energy", "defense", "repair"] as const).map((slot) => {
                const c = def.components.find((x) => x.id === IKAROS_KIT[slot]);
                const on = state.selected?.[slot] === IKAROS_KIT[slot];
                return (
                  <li key={slot} className={on ? "on" : ""}>
                    {on ? "✓" : "○"} {c?.name}
                  </li>
                );
              })}
            </ul>
            {!hasKit && (
              <button className="scale-btn" onClick={equipKit}>
                <kbd>K</kbd> {tr("Equipar el kit Ikaros", "Equip the Ikaros kit")}
              </button>
            )}
          </section>
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
      launchLabel={tr("Despegar · L", "Lift off · L")}
      onLaunch={launch}
      assistant={<Assistant events={state.events} max={1} />}
      onExit={onExit}
      onGlossary={() => onOverlay("glossary")}
      onCredits={() => onOverlay("credits")}
    />
  );
}
