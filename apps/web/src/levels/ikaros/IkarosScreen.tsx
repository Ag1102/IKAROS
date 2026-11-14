import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { useSimulation } from "../../sim/useSimulation";
import { recordResult } from "../../progress";
import { IkarosScene, OrbitPreview, probeOrbit } from "./IkarosScene";
import { TopBar, type TimeScale } from "../../ui/Panels";
import { HangarSlots } from "../../ui/HangarSlots";
import { Decisions, openDecisions } from "../../ui/Decisions";
import { Report } from "../../ui/Report";
import { useLaunchSequence } from "../../ui/LaunchSequence";
import { Assistant } from "../../ui/Assistant";
import { Overlay, type OverlayKind } from "../../ui/Overlay";
import { formatNumber } from "../../ui/format";
import { useHotkey } from "../../hooks/useHotkey";
import { usePreview } from "../../ships/usePreview";
import { SurvivalHud } from "../../game/SurvivalHud";
import { GameOver } from "../../game/GameOver";
import { WARP_MAX, encounterSpeed } from "../../game/encounter";
import { unlock } from "../../game/achievements";
import { MODELS } from "../../ships/models";
import { HangarLayout, focusName } from "../../ui/hangar/HangarLayout";
import { tr } from "../../i18n";

const CRUISE_SCALES: TimeScale[] = [
  { value: 0, label: tr("Pausa", "Pause") },
  { value: 86_400, label: "1 d/s" },
  { value: 604_800, label: tr("1 sem/s", "1 wk/s") },
];
const ENCOUNTER_SCALES: TimeScale[] = [
  { value: 0, label: tr("Pausa", "Pause") },
  { value: WARP_MAX, label: tr("Jugar", "Play") },
];

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;
const flybysOf = (def: ScenarioDefinition) =>
  Object.keys(def.params).filter((k) => /^perihelion_after_flyby_\d+_rsun$/.test(k)).length;

export function IkarosScreen({ onExit }: { onExit: () => void }) {
  const [timeScale, setTimeScale] = useState(604_800);
  const [hideUi, setHideUi] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [follow, setFollow] = useState(false);
  // En el encuentro la velocidad la decide la distancia al Sol (rápido lejos, lento cerca).
  const { state, latest, act, restart, report, def } = useSimulation("level3-ikaros", timeScale, (s) =>
    s.phase === "encounter" ? encounterSpeed(s) : Infinity,
  );
  const launchSeq = useLaunchSequence(state.phase, def.title);
  const encounter = state.phase === "encounter" || state.phase === "exit";

  // Una misión cumplida desbloquea el nivel siguiente.
  useEffect(() => {
    if (report) recordResult(3, report.outcome);
  }, [report]);

  useHotkey("h", () => setHideUi((v) => !v));

  // Una decisión nueva pausa el tiempo para poder leerla; al responderla, sigue a la velocidad que tenía.
  const openCount = openDecisions(state.events).length;
  const prevOpen = useRef(openCount);
  const resumeTo = useRef<number | null>(null);
  const scaleRef = useRef(timeScale);
  scaleRef.current = timeScale;
  useEffect(() => {
    if (openCount > prevOpen.current) {
      if (scaleRef.current > 0) resumeTo.current = scaleRef.current;
      setTimeScale(0);
    } else if (openCount === 0 && prevOpen.current > 0 && resumeTo.current !== null) {
      setTimeScale(resumeTo.current);
      resumeTo.current = null;
    }
    prevOpen.current = openCount;
  }, [openCount]);

  // Al entrar al encuentro: la matriz principal se pliega (como en el paper), la cámara sigue a la sonda
  // y el tiempo pasa a velocidad de juego.
  const enterRef = useRef(() => {});
  enterRef.current = () => {
    if (!state.main_array_stowed) act({ type: "stow-main-array" });
    setFollow(true);
    setTimeScale((v) => (v === 0 ? 0 : WARP_MAX));
  };
  useEffect(() => {
    if (state.phase === "encounter") enterRef.current();
  }, [state.phase]);

  // Cuenta atrás del apagón: sin batería y con menos energía de la que se gasta, el motor
  // pierde la nave tras power_loss_limit_s de misión.
  const blackoutStart = useRef<number | null>(null);
  const dark = (state.battery_wh ?? 1) <= 0 && state.resources.power_generated_w < (state.power_load_w ?? 0);
  if (!dark) blackoutStart.current = null;
  else if (blackoutStart.current === null) blackoutStart.current = state.resources.mission_elapsed_s;
  const blackoutLeft =
    dark && blackoutStart.current !== null
      ? Math.max(0, param(def, "power_loss_limit_s") - (state.resources.mission_elapsed_s - blackoutStart.current))
      : null;

  useEffect(() => {
    if (report?.outcome === "success") unlock("sun-survivor");
  }, [report]);

  const onRestart = () => {
    setTimeScale(604_800);
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

  const flybys = flybysOf(def);
  return (
    <div className={hideUi ? "shell hide-ui" : "shell"}>
      <div className="viewport">
        <IkarosScene
          latest={latest}
          follow={follow}
          aphelion_au={param(def, "aphelion_au")}
          perihelion_rsun={state.perihelion_rsun ?? param(def, "perihelion_start_rsun")}
        />
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
        scales={encounter ? ENCOUNTER_SCALES : CRUISE_SCALES}
      />
      <footer className="orbit-note">{tr("H · ocultar paneles", "H · hide panels")}</footer>
      <aside className="guide-wrap">
        <section className="panel guide" aria-label={tr("Misión", "Mission")}>
          <Decisions events={state.events} now_s={state.resources.mission_elapsed_s} act={act} />
          {report ? (
            <>
              <GameOver report={report} />
              <Report report={report} onRestart={onRestart} />
            </>
          ) : encounter ? (
            <SurvivalHud
              state={state}
              fullArea_cm2={param(def, "secondary_array_area_cm2")}
              act={act}
              blackoutLeft_s={blackoutLeft}
            />
          ) : (
            <div className="cruise">
              <p className="cruise-title">{tr("Rumbo al Sol", "Heading to the Sun")}</p>
              <div className="flybys" aria-label={tr("Sobrevuelos de Venus", "Venus flybys")}>
                {Array.from({ length: flybys }, (_, i) => (
                  <span key={i} className={i < (state.venus_flybys_done ?? 0) ? "fly on" : "fly"}>
                    ♀
                  </span>
                ))}
              </div>
              <p className="note">
                {tr("Perihelio:", "Perihelion:")}{" "}
                <span className="num">{formatNumber(state.perihelion_rsun ?? 0, 1)} R☉</span>.{" "}
                {tr("Usa Venus para acercarte.", "Use Venus to get closer.")}
              </p>
            </div>
          )}
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
  // Los motivos de bloqueo los da el motor como eventos; se muestran los del último intento.
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
  const { preview, highlight, onPreview } = usePreview(state.selected);

  return (
    <>
      <HangarLayout
        levelTitle={def.title}
        heading={tr("Diseño de la nave", "Spacecraft design")}
        stage={tr(
          "Etapa de diseño: estudio de compromisos (CML 3). Al lanzar, el diseño queda fijo (CML 4).",
          "Design stage: trade study (CML 3). At launch the design is frozen (CML 4).",
        )}
        briefing={def.briefing}
        objectives={def.objectives}
        model={MODELS.parker}
        focus={focusName(def, preview, highlight)}
        slots={<HangarSlots def={def} state={state} act={act} onPreview={onPreview} />}
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
            <div className="orbit-preview" aria-label="Órbita inicial y final prevista">
              <OrbitPreview start={start} final={final} />
              <span className="preview-note">
                {tr("Gris: primera órbita · Blanca: la final", "Grey: first orbit · White: final orbit")}
              </span>
            </div>
          </>
        }
        problems={blocked.map((e) => e.text.replace(/^Lanzamiento bloqueado: /, ""))}
        onLaunch={() => {
          setAttemptFrom(state.events.length);
          act({ type: "launch" });
        }}
        assistant={<Assistant events={state.events} max={1} />}
        onExit={onExit}
        onGlossary={() => onOverlay("glossary")}
        onCredits={() => onOverlay("credits")}
      />
    </>
  );
}
