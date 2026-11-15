import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PlayerAction, ScenarioDefinition, SimEvent, SimState } from "@ikaros/contracts";
import { useSimulation } from "../../sim/useSimulation";
import { useAtlas } from "../../atlas/Atlas";
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
import { TimingBar } from "../../game/TimingBar";
import { formatNumber } from "../../ui/format";
import { tr } from "../../i18n";
import { encounterTimeScale } from "./stability";
import { journey, RETURN_DAYS } from "./journey";
import { MISSION_EPOCH_DAY } from "./planets";
import { DragParts, DropZone } from "./games/DragParts";
import { Cinematic } from "./games/Cinematic";
import { TapBoost } from "./games/TapBoost";
import { LeverAlign } from "./games/LeverAlign";
import { FoldArray } from "./games/FoldArray";
import { PillarConsole, freshUptime, type PillarUptime } from "./games/PillarConsole";
import { NanoRepair } from "./games/NanoRepair";
import { ShieldCharge } from "./games/ShieldCharge";
import { ReactorRods } from "./games/ReactorRods";
import { CoolantLoops } from "./games/CoolantLoops";
import { Reentry } from "./games/Reentry";
import { RecordBanner } from "./games/RecordBanner";

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;
const openDecision = (events: SimEvent[], trigger: string) =>
  events.find((e) => e.trigger === trigger && e.choices && !e.resolved);

/** Crucero Tierra → Venus: los 52 días pasan en ~8 s. */
const CRUISE_SCALE = 560_000;
/** Velocidad base del encuentro; el límite real lo pone encounterTimeScale. */
const ENCOUNTER_SCALE = 43_200;
/** Fracción del crucero a la que llega el reto de potencia hacia Venus. */
const BOOST_AT = 0.35;
/** Duración real de las animaciones de tramo (caída al Sol y regreso a la Tierra), s. */
const LEG_SECONDS = { descent: 4, return: 6 };

/** ⚗ Los pilares de Ikaros: sin ellos no se llega. La cápsula trae las muestras de vuelta. */
const PILLARS: Record<string, string> = {
  energy: "fission-reactor",
  defense: "hts-field",
  repair: "nanobots",
  science: "sensors-capsule",
};

/** Etapas del viaje único. Las de juego pausan el tiempo; su resultado va al motor. */
type Stage =
  | { k: "departure" }
  | { k: "to-venus" }
  | { k: "boost" }
  | { k: "assist"; id: string; boost: Rating }
  | { k: "pillar-reactor"; id: string }
  | { k: "pillar-cooling"; id: string }
  | { k: "pillar-hts"; id: string }
  | { k: "descent" }
  | { k: "fold" }
  | { k: "sun" }
  | { k: "cme"; id: string }
  | { k: "nano"; n: number }
  | { k: "record" }
  | { k: "samples" }
  | { k: "eject"; id: string }
  | { k: "return" }
  | { k: "reentry" }
  | { k: "arrival" }
  | { k: "debrief" };

/** Etapas en las que el motor sigue corriendo; en las demás, el tiempo de misión se detiene. */
const RUNNING = new Set<Stage["k"]>(["to-venus", "sun"]);

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
  const [stage, setStage] = useState<Stage>({ k: "to-venus" });
  const [paused, setPaused] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [hideUi, setHideUi] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [capsuleHome, setCapsuleHome] = useState(false);
  const score = useScore();
  const defRef = useRef<ScenarioDefinition | null>(null);

  const playing = !paused && RUNNING.has(stage.k);
  const baseScale = stage.k === "sun" ? ENCOUNTER_SCALE : CRUISE_SCALE;
  const { state, latest, act, restart, report, def } = useSimulation("level3-ikaros", playing ? baseScale : 0, (s) => {
    // Con una decisión abierta el tiempo se detiene hasta que el minijuego la responda.
    if (s.events.some((e) => e.choices && !e.resolved)) return 0;
    return s.phase === "encounter" && defRef.current ? encounterTimeScale(s, defRef.current) : Infinity;
  });
  defRef.current = def;
  const atlas = useAtlas("level3-ikaros", state.events);
  useHotkey("h", () => setHideUi((v) => !v));
  useHotkey("p", () => RUNNING.has(stage.k) && setPaused((v) => !v));

  const parker = param(def, "parker_record_rsun");
  const dived = state.events.some((e) => e.trigger === "level3:dive");
  const trip = useMemo(() => journey(def, state.perihelion_rsun ?? 9.5), [def, state.perihelion_rsun]);
  const flybyTime = param(def, "flyby_interval_s");

  /** Registra un reto: puntos, combo y fila en la bitácora. */
  const rate = (rating: Rating, label: string, theoretical = false) => {
    score.add(rating, label);
    setLog((l) => [...l, { label, rating, theoretical }]);
  };

  // Posición de la sonda en los tramos que el motor no dibuja (crucero, caída, regreso)
  const override = useRef<{ x: number; y: number } | null>(null);
  const dayOverride = useRef<number | null>(null);
  const legStart = useRef(0);
  const exitDay = useRef(MISSION_EPOCH_DAY);
  const [routeDay, setRouteDay] = useState(MISSION_EPOCH_DAY);
  const route = useMemo(() => trip.route(routeDay), [trip, routeDay]);
  useEffect(() => {
    legStart.current = performance.now();
  }, [stage.k]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = latest.current;
      const legF = (secs: number) => Math.min(1, (performance.now() - legStart.current) / 1000 / secs);
      if (s.phase === "cruise") {
        override.current = trip.toVenus(s.resources.mission_elapsed_s / flybyTime);
        dayOverride.current = null;
      } else if (stage.k === "descent") {
        override.current = trip.toSun(legF(LEG_SECONDS.descent));
      } else if (stage.k === "return" || stage.k === "reentry") {
        const f = stage.k === "return" ? legF(LEG_SECONDS.return) : 1;
        override.current = trip.toEarth(f, exitDay.current);
        dayOverride.current = exitDay.current + RETURN_DAYS * f;
      } else {
        override.current = null;
        dayOverride.current = null;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage.k, trip, flybyTime, latest]);

  // Tramos animados: al terminar, sigue la etapa siguiente.
  useEffect(() => {
    if (stage.k !== "descent" && stage.k !== "return") return;
    const id = window.setTimeout(
      () => setStage(stage.k === "descent" ? { k: "fold" } : { k: "reentry" }),
      LEG_SECONDS[stage.k] * 1000,
    );
    return () => window.clearTimeout(id);
  }, [stage.k]);

  // Transiciones que dicta el motor
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    const from = prevPhase.current;
    prevPhase.current = state.phase;
    if (from === "hangar" && state.phase !== "hangar") setStage({ k: "departure" });
  }, [state.phase]);

  const flags = useRef({ boost: false, record: false, samples: false, nano: 0, minR: Infinity });
  useEffect(() => {
    const s = state;
    if (stage.k === "to-venus" && s.phase === "cruise") {
      if (!flags.current.boost && s.resources.mission_elapsed_s >= flybyTime * BOOST_AT) {
        flags.current.boost = true;
        return setStage({ k: "boost" });
      }
      const ev = openDecision(s.events, "level3:venus-window");
      if (ev) return setStage({ k: "assist", id: ev.id, boost: boostRating.current });
      const dive = openDecision(s.events, "level3:ikaros-dive");
      if (dive) return setStage({ k: "pillar-reactor", id: dive.id });
      return;
    }
    if (stage.k === "to-venus" && s.phase === "encounter") return setStage({ k: "descent" });
    if (stage.k === "sun") {
      const cme = openDecision(s.events, "level3:cme");
      if (cme) return setStage({ k: "cme", id: cme.id });
      const hull = s.hull_durability_pct ?? 100;
      if ((flags.current.nano === 0 && hull < 92) || (flags.current.nano === 1 && hull < 70)) {
        flags.current.nano++;
        return setStage({ k: "nano", n: flags.current.nano });
      }
      // Récord y muestras justo después del perihelio: cuando la distancia empieza a crecer.
      const r = s.distance_to_sun_rsun ?? Infinity;
      if (r < flags.current.minR) flags.current.minR = r;
      const passed = r > flags.current.minR * 1.01 && flags.current.minR < 60;
      if (passed && !flags.current.record && flags.current.minR < parker) {
        flags.current.record = true;
        return setStage({ k: "record" });
      }
      if (passed && !flags.current.samples) {
        flags.current.samples = true;
        return setStage({ k: "samples" });
      }
      const ej = openDecision(s.events, "level3:ejection");
      if (ej) {
        if (!flags.current.samples) {
          flags.current.samples = true;
          return setStage({ k: "samples" });
        }
        return setStage({ k: "eject", id: ej.id });
      }
    }
    if (s.phase === "complete" && (stage.k === "sun" || stage.k === "to-venus")) {
      setStage(report?.outcome === "failure" ? { k: "debrief" } : { k: "arrival" });
    }
  }, [state, stage.k, report, parker, flybyTime]);

  const boostRating = useRef<Rating>("fail");
  const uptime = useRef<PillarUptime>(freshUptime());
  // Al salir del Sol se califica cuánto tiempo estuvieron en marcha los pilares.
  const graded = useRef(false);
  useEffect(() => {
    if (graded.current || state.phase === "encounter" || uptime.current.total_s === 0) return;
    graded.current = true;
    // Fuera del Sol los sistemas quedan encendidos.
    act({ type: "set-system", system: "reactor", on: true });
    act({ type: "set-system", system: "hts", on: true });
    const u = uptime.current;
    const ratio = (u.reactor_s + u.hts_s) / (2 * u.total_s);
    rate(
      ratio >= 0.95 ? "perfect" : ratio >= 0.75 ? "good" : "fail",
      tr("Pilares en marcha cerca del Sol", "Pillars running near the Sun"),
      true,
    );
    // rate cambia en cada render; basta con la fase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const stars = report ? starsFor(report.outcome, pilotRatio(score.ratings)) : 0;
  useEffect(() => {
    if (!report || stage.k !== "debrief") return;
    recordResult(2, report.outcome);
    recordStars(2, stars);
    if (report.outcome === "success") unlock("sun-survivor");
  }, [report, stage.k, stars]);

  const onRestart = () => {
    flags.current = { boost: false, record: false, samples: false, nano: 0, minR: Infinity };
    boostRating.current = "fail";
    uptime.current = freshUptime();
    exitDay.current = MISSION_EPOCH_DAY;
    setRouteDay(MISSION_EPOCH_DAY);
    graded.current = false;
    setLog([]);
    setCapsuleHome(false);
    score.reset();
    setStage({ k: "to-venus" });
    setPaused(false);
    restart();
  };

  if (state.phase === "hangar") {
    return (
      <>
        <HangarPage def={def} state={state} act={act} onExit={onExit} onOverlay={setOverlay} />
        <Overlay kind={overlay} onClose={() => setOverlay(null)} />
        {atlas}
      </>
    );
  }

  if (stage.k === "departure" || stage.k === "arrival") {
    return (
      <>
        <Cinematic
          kind={stage.k}
          capsule={capsuleHome}
          onDone={() => setStage(stage.k === "departure" ? { k: "to-venus" } : { k: "debrief" })}
        />
        {atlas}
      </>
    );
  }

  const scales: TimeScale[] = [
    { value: 0, label: tr("Pausa", "Pause") },
    { value: baseScale, label: tr("Jugar", "Play") },
  ];

  /** Un pilar de la zambullida: si falla, Ikaros se queda en 9,5 R☉ (sin segunda oportunidad). */
  const pillar = (id: string, r: Rating, label: string) => {
    rate(r, label, true);
    if (r !== "fail") return true;
    act({ type: "resolve-event", eventId: id, choice: "stay" });
    setStage({ k: "to-venus" });
    return false;
  };

  const exitNow = () => {
    exitDay.current = MISSION_EPOCH_DAY + latest.current.resources.mission_elapsed_s / 86400;
    setRouteDay(exitDay.current);
  };

  return (
    <div className={hideUi ? "shell hide-ui" : "shell"}>
      <div className="viewport">
        <IkarosScene
          latest={latest}
          follow={["sun", "cme", "nano", "record", "samples", "eject", "fold"].includes(stage.k)}
          aphelion_au={param(def, "aphelion_au")}
          perihelion_rsun={state.perihelion_rsun ?? param(def, "perihelion_start_rsun")}
          varpi={trip.varpi}
          override={override}
          getDayOverride={dayOverride}
          route={route}
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
      <JourneyTrack stage={stage} dive={dived} />

      {(stage.k === "to-venus" || stage.k === "descent" || stage.k === "return") && (
        <div className="cruise-banner">
          <span className="game-kicker">
            {stage.k === "to-venus"
              ? tr("Tierra → Venus", "Earth → Venus")
              : stage.k === "descent"
                ? tr("Venus → Sol", "Venus → Sun")
                : tr("Regreso a la Tierra", "Back to Earth")}
          </span>
          <p>
            {stage.k === "to-venus"
              ? tr(
                  `Día ${Math.floor(state.resources.mission_elapsed_s / 86400)} de ${Math.round(flybyTime / 86400)} hasta Venus`,
                  `Day ${Math.floor(state.resources.mission_elapsed_s / 86400)} of ${Math.round(flybyTime / 86400)} to Venus`,
                )
              : stage.k === "descent"
                ? tr(
                    `Cayendo hacia el Sol · perihelio ${formatNumber(state.perihelion_rsun ?? 0, 2)} R☉ · récord de Parker ${parker} R☉`,
                    `Falling toward the Sun · perihelion ${formatNumber(state.perihelion_rsun ?? 0, 2)} R☉ · Parker's record ${parker} R☉`,
                  )
                : tr(
                    "⚗ La cápsula vuelve con las muestras de la corona",
                    "⚗ The capsule returns with the corona samples",
                  )}
          </p>
        </div>
      )}

      {stage.k === "sun" && (
        <PillarConsole state={state} act={act} parker_rsun={parker} running={playing} uptime={uptime} />
      )}

      <div className="game-layer">
        {stage.k === "boost" && (
          <TapBoost
            windowN={1}
            total={1}
            onDone={(r) => {
              boostRating.current = r;
              rate(r, tr("Impulso hacia Venus", "Push toward Venus"));
              setStage({ k: "to-venus" });
            }}
          />
        )}
        {stage.k === "assist" && (
          <LeverAlign
            seed={17}
            onDone={(r) => {
              rate(r, tr("Asistencia gravitatoria de Venus", "Venus gravity assist"));
              // La asistencia depende de entrar bien al corredor; el impulso solo cuenta para la nota.
              const ok = r !== "fail";
              act({ type: "resolve-event", eventId: stage.id, choice: ok ? "execute" : "skip" });
              setStage({ k: "to-venus" });
            }}
          />
        )}
        {stage.k === "pillar-reactor" && (
          <PillarIntro step={1}>
            <ReactorRods
              seed={7}
              onDone={(r) => {
                if (pillar(stage.id, r, tr("Pilar 1 · Arranque del mini reactor", "Pillar 1 · Mini reactor start-up")))
                  setStage({ k: "pillar-cooling", id: stage.id });
              }}
            />
          </PillarIntro>
        )}
        {stage.k === "pillar-cooling" && (
          <PillarIntro step={2}>
            <CoolantLoops
              onDone={(r) => {
                if (pillar(stage.id, r, tr("Pilar 2 · Enfriamiento del reactor", "Pillar 2 · Reactor cooling")))
                  setStage({ k: "pillar-hts", id: stage.id });
              }}
            />
          </PillarIntro>
        )}
        {stage.k === "pillar-hts" && (
          <PillarIntro step={3}>
            <ShieldCharge
              kicker={tr("Zambullida hacia el Sol", "Dive toward the Sun")}
              okText={tr("Campo estable: el plasma se desvía.", "Field stable: the plasma is deflected.")}
              onDone={(r) => {
                if (pillar(stage.id, r, tr("Pilar 3 · Campo magnético HTS", "Pillar 3 · HTS magnetic field"))) {
                  act({ type: "resolve-event", eventId: stage.id, choice: "dive" });
                  setStage({ k: "to-venus" });
                }
              }}
            />
          </PillarIntro>
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
          <ShieldCharge
            onDone={(r) => {
              rate(r, tr("Pilar 3 · El campo HTS frena la CME", "Pillar 3 · HTS field stops the CME"), true);
              act({ type: "resolve-event", eventId: stage.id, choice: r === "fail" ? "timeout" : "hts" });
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "nano" && (
          <NanoRepair
            seed={stage.n * 23}
            onDone={(r) => {
              rate(
                r,
                tr(
                  `Pilar 4 · Nanobots reparan el casco (${stage.n})`,
                  `Pillar 4 · Nanobots repair the hull (${stage.n})`,
                ),
                true,
              );
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "record" && (
          <RecordBanner
            distance_rsun={flags.current.minR}
            speed_km_s={state.speed_km_s ?? 0}
            parker_rsun={parker}
            dive={dived}
            onDone={() => {
              // Del récord se pasa directo a las muestras: se marcan ya, para no pedirlas dos veces.
              flags.current.samples = true;
              setStage({ k: "samples" });
            }}
          />
        )}
        {stage.k === "samples" && (
          <TimingBar
            kicker={tr(
              `Perihelio · ${formatNumber(flags.current.minR, 2)} R☉`,
              `Perihelion · ${formatNumber(flags.current.minR, 2)} R☉`,
            )}
            title={tr("Recoge las muestras de la corona", "Collect the corona samples")}
            hint={tr(
              "Pulsa cuando el marcador cruce la ventana de plasma: 3 copas colectoras.",
              "Press when the marker crosses the plasma window: 3 collector cups.",
            )}
            button={tr("Lanzar copa", "Launch cup")}
            attempts={3}
            window={0.18}
            speed={0.9}
            theoretical
            lesson={lesson("samples")}
            resultText={(n) => ({
              ok: n >= 1,
              text: tr(`${n} de 3 copas llenas de corona.`, `${n} of 3 cups filled with corona.`),
            })}
            onDone={(n) => {
              rate(n === 3 ? "perfect" : n >= 1 ? "good" : "fail", tr("Muestras de la corona", "Corona samples"), true);
              setStage({ k: "sun" });
            }}
          />
        )}
        {stage.k === "eject" && (
          <TimingBar
            kicker={tr("Salida del encuentro", "Leaving the encounter")}
            title={tr("Eyecta la cápsula hacia la Tierra", "Eject the capsule toward Earth")}
            hint={tr(
              "Pulsa cuando el marcador pase por la ventana de retorno. Tienes 3 intentos dentro de esta misma ventana.",
              "Press when the marker crosses the return window. You get 3 tries within this same window.",
            )}
            button={tr("Eyectar", "Eject")}
            attempts={3}
            stopOnHit
            window={0.2}
            speed={0.7}
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
              exitNow();
              setStage(ok ? { k: "return" } : { k: "arrival" });
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
          extra={<Debrief stars={stars} points={score.points} log={log} />}
        />
      )}
      {atlas}
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </div>
  );
}

/** Cabecera de los pilares en la zambullida: qué tecnología entra en acción. */
function PillarIntro({ step, children }: { step: 1 | 2 | 3; children: ReactNode }) {
  const names = [
    tr("Mini reactor", "Mini reactor"),
    tr("Enfriamiento", "Cooling"),
    tr("Campo magnético", "Magnetic field"),
  ];
  return (
    <div className="dive-seq">
      <p className="dive-title">
        {tr("⚗ Zambullida a 850.000 km", "⚗ Dive to 850,000 km")}
        <small>
          {tr(
            "Ningún panel solar sobrevive tan cerca. Ikaros llega gracias a sus pilares:",
            "No solar panel survives that close. Ikaros gets there thanks to its pillars:",
          )}
        </small>
      </p>
      <ol className="pillar-steps">
        {names.map((n, i) => (
          <li key={n} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""}>
            {i + 1} · {n}
          </li>
        ))}
        <li>4 · {tr("Nanobots", "Nanobots")}</li>
      </ol>
      {children}
    </div>
  );
}

const STEPS = (dive: boolean) => [
  { id: "earth", label: tr("Tierra", "Earth") },
  { id: "venus", label: "Venus" },
  { id: "assist", label: tr("Asistencia", "Assist") },
  ...(dive ? [{ id: "dive", label: tr("⚗ Pilares", "⚗ Pillars") }] : []),
  { id: "sun", label: tr("Sol", "Sun") },
  { id: "samples", label: tr("Muestras", "Samples") },
  { id: "home", label: tr("Tierra", "Earth") },
];

function stepIndex(stage: Stage, dive: boolean): number {
  const d = dive ? 1 : 0;
  switch (stage.k) {
    case "departure":
      return 0;
    case "to-venus":
    case "boost":
      return 1;
    case "assist":
      return 2;
    case "pillar-reactor":
    case "pillar-cooling":
    case "pillar-hts":
      return 3;
    case "descent":
    case "fold":
    case "sun":
    case "cme":
    case "nano":
      return 3 + d;
    case "record":
    case "samples":
      return 4 + d;
    default:
      return 5 + d;
  }
}

/** Barra del viaje: Tierra → Venus → asistencia → (pilares) → Sol → muestras → Tierra. */
function JourneyTrack({ stage, dive }: { stage: Stage; dive: boolean }) {
  const pillarsNow = stage.k.startsWith("pillar");
  const idx = stepIndex(stage, dive || pillarsNow);
  return (
    <ol className="stage-track" aria-label={tr("Etapas del viaje", "Trip stages")}>
      {STEPS(dive || pillarsNow).map((s, i) => (
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
function Debrief({ stars, points, log }: { stars: number; points: number; log: LogRow[] }) {
  return (
    <div className="debrief-extra">
      <div className="debrief-stars">
        <Stars n={stars} />
        <span>
          {tr("Puntos de piloto", "Pilot points")} <b className="num">{formatNumber(points)}</b>
        </span>
      </div>
      <table className="mini game-log">
        <caption>{tr("Bitácora del viaje", "Trip log")}</caption>
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
  const [tried, setTried] = useState(false);
  const blocked =
    attemptFrom === null ? [] : state.events.slice(attemptFrom).filter((e) => e.trigger === "level3:launch-blocked");
  const aphelion = param(def, "aphelion_au");
  const start = useMemo(() => probeOrbit(param(def, "perihelion_start_rsun"), aphelion), [def, aphelion]);
  const final = useMemo(() => probeOrbit(param(def, "perihelion_after_flyby_1_rsun"), aphelion), [def, aphelion]);
  const mass = state.resources.mass_kg;
  const cap = state.mass_capacity_kg ?? 0;
  const budget = state.budget_remaining_usd_m ?? 0;
  const { preview, highlight, onPreview } = usePreview(state.selected);
  // En el viaje de Ikaros solo hay pilares: una pieza por ranura, y en el escudo se elige material.
  const pillarDef = useMemo<ScenarioDefinition>(
    () => ({
      ...def,
      slots: def.slots.map((s) => ({ ...s, required: true })),
      components: def.components.filter((c) => c.slot === "shield" || PILLARS[c.slot] === c.id),
    }),
    [def],
  );
  const missing = Object.entries(PILLARS).filter(([slot, id]) => state.selected?.[slot] !== id);
  const installed = pillarDef.slots.filter((s) => state.selected?.[s.id]).length;
  const equipAll = () => {
    for (const [slot, id] of Object.entries(PILLARS)) act({ type: "select-component", slot, componentId: id });
    if (!state.selected?.shield) act({ type: "select-component", slot: "shield", componentId: "shield-cc" });
  };
  useHotkey("k", equipAll);
  const launch = () => {
    setTried(true);
    if (missing.length > 0 || !state.selected?.shield) return;
    setAttemptFrom(state.events.length);
    act({ type: "launch" });
  };
  useHotkey("l", launch);
  const pillarProblems = tried
    ? [
        ...missing.map(([slot]) =>
          tr(
            `Falta el pilar: ${def.slots.find((s) => s.id === slot)?.label}.`,
            `Missing pillar: ${def.slots.find((s) => s.id === slot)?.label}.`,
          ),
        ),
        ...(state.selected?.shield ? [] : [tr("Falta el escudo térmico.", "Missing the heat shield.")]),
      ]
    : [];

  return (
    <HangarLayout
      levelTitle={def.title}
      heading={tr("Arma la sonda con sus pilares", "Build the probe with its pillars")}
      stage={tr(
        "Arrastra cada pilar hasta la sonda (o Tab y Enter). K los instala todos; L despega.",
        "Drag each pillar onto the probe (or Tab and Enter). K installs them all; L lifts off.",
      )}
      briefing={def.briefing}
      objectives={def.objectives}
      model={MODELS.parker}
      focus={focusName(def, preview, highlight)}
      slots={<DragParts def={pillarDef} state={state} act={act} onPreview={onPreview} />}
      overlay={<DropZone installed={installed} total={pillarDef.slots.length} />}
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
          <section className={`kit-card${missing.length === 0 ? " on" : ""}`} aria-label={tr("Pilares", "Pillars")}>
            <h3 className="hstat-title">{tr("⚗ Los pilares de Ikaros", "⚗ The pillars of Ikaros")}</h3>
            <p className="note">
              {tr(
                "Para acercarse al Sol más que nadie: energía sin paneles, frío para el reactor, un campo magnético contra el plasma y nanobots que reparan. La cápsula trae las muestras.",
                "To get closer to the Sun than anyone: power without panels, cold for the reactor, a magnetic field against the plasma and repairing nanobots. The capsule brings the samples home.",
              )}
            </p>
            <ul className="kit-list">
              {Object.entries(PILLARS).map(([slot, id]) => {
                const c = def.components.find((x) => x.id === id);
                const on = state.selected?.[slot] === id;
                return (
                  <li key={slot} className={on ? "on" : ""}>
                    {on ? "✓" : "○"} {c?.name}
                  </li>
                );
              })}
            </ul>
            {missing.length > 0 && (
              <button className="scale-btn" onClick={equipAll}>
                <kbd>K</kbd> {tr("Instalar los pilares", "Install the pillars")}
              </button>
            )}
          </section>
          <h3 className="hstat-title">{tr("El viaje", "The trip")}</h3>
          <div className="orbit-preview" aria-label={tr("Órbita inicial y final", "Initial and final orbit")}>
            <OrbitPreview start={start} final={final} />
            <span className="preview-note">
              {tr(
                "Tierra → Venus → asistencia gravitatoria → Sol → Tierra",
                "Earth → Venus → gravity assist → Sun → Earth",
              )}
            </span>
          </div>
          <KeyHints>
            <KeyHint keys={["K"]}>{tr("pilares", "pillars")}</KeyHint>
            <KeyHint keys={["L"]}>{tr("despegar", "lift off")}</KeyHint>
          </KeyHints>
        </>
      }
      problems={[
        ...pillarProblems,
        ...blocked.map((e) => e.text.replace(/^(Lanzamiento bloqueado|Launch blocked): /, "")),
      ]}
      launchLabel={tr("Despegar · L", "Lift off · L")}
      onLaunch={launch}
      assistant={<Assistant events={state.events} max={1} />}
      onExit={onExit}
      onGlossary={() => onOverlay("glossary")}
      onCredits={() => onOverlay("credits")}
    />
  );
}
