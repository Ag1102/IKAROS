import { useEffect, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { useSimulation } from "../../sim/useSimulation";
import { recordResult } from "../../progress";
import { menuLevels } from "../../menu/levels";
import { ObservacionTierraScene, OrbitPreview2 } from "./ObservacionTierraScene";
import { orbitGeometry } from "./geometry";
import { EventLog, ResourcesPanel, TopBar, type TimeScale } from "../../ui/Panels";
import { HangarSlots } from "../../ui/HangarSlots";
import { Report } from "../../ui/Report";
import { useLaunchSequence } from "../../ui/LaunchSequence";
import { Assistant } from "../../ui/Assistant";
import { Overlay, type OverlayKind } from "../../ui/Overlay";
import { formatElapsed, formatNumber } from "../../ui/format";
import { useHotkey } from "../../hooks/useHotkey";
import { MODELS } from "../../ships/models";
import { HangarLayout, focusName } from "../../ui/hangar/HangarLayout";
import { usePreview } from "../../ships/usePreview";
import { OrbitLaunch } from "../../game/OrbitLaunch";
import { PrepCard } from "../../game/PrepCard";
import { tr } from "../../i18n";

const scales = (): TimeScale[] => [
  { value: 0, label: tr("Pausa", "Pause") },
  { value: 60, label: "60×" },
  { value: 600, label: "10 min/s" },
  { value: 3600, label: "1 h/s" },
  { value: 21_600, label: "6 h/s" },
];

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;

export function ObservacionTierraScreen({ onExit }: { onExit: () => void }) {
  const [timeScale, setTimeScale] = useState(3600);
  const [hideUi, setHideUi] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [follow, setFollow] = useState(false);
  const { state, latest, act, restart, report, def } = useSimulation("level2-leo", timeScale);
  const launchSeq = useLaunchSequence(state.phase, def.title);

  // Una misión cumplida desbloquea el nivel siguiente.
  useEffect(() => {
    if (report) recordResult(2, report.outcome);
  }, [report]);

  useHotkey("h", () => setHideUi((v) => !v));

  // Al arrancar la operación, la cámara se acerca al satélite.
  useEffect(() => {
    if (state.phase === "operations") setFollow(true);
  }, [state.phase]);

  const onRestart = () => {
    setTimeScale(3600);
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
        <ObservacionTierraScene latest={latest} follow={follow} inclination_deg={state.inclination_deg ?? 0} />
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
        scales={scales()}
      />
      <aside className="side">
        <ResourcesPanel state={state} />
        <EventLog events={state.events} />
      </aside>
      <footer className="orbit-note">{tr("H · ocultar paneles", "H · hide panels")}</footer>
      <aside className="guide-wrap">
        <section className="panel guide" aria-labelledby="ops-h">
          <h2 id="ops-h">{tr("Operación", "Operations")}</h2>
          {report ? (
            <Report report={report} onRestart={onRestart} unlocks={menuLevels()[2]?.name} />
          ) : (
            <Operations def={def} state={state} />
          )}
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
    attemptFrom === null ? [] : state.events.slice(attemptFrom).filter((e) => e.trigger === "level2:launch-blocked");
  const mass = state.resources.mass_kg;
  const cap = state.mass_capacity_kg;
  const budget = state.budget_remaining_usd_m ?? 0;
  const gen = state.resources.power_generated_w;
  const load = state.resources.power_consumed_w;
  const { preview, highlight, onPreview } = usePreview(state.selected);
  // Taller de órbitas: se valida para la órbita y el objetivo elegidos; si cambian, hay que repetirlo.
  const [taller, setTaller] = useState(false);
  const [validatedFor, setValidatedFor] = useState<string | null>(null);
  const orbitKey =
    state.selected?.orbit && state.selected?.objective ? `${state.selected.orbit}|${state.selected.objective}` : null;
  const validated = orbitKey !== null && validatedFor === orbitKey;
  const tallerProblems = validated
    ? []
    : [tr("Pon tu satélite en órbita (botón Jugar).", "Put your satellite in orbit (Play button).")];

  return (
    <>
      <HangarLayout
        levelTitle={def.title}
        heading={tr("Diseño de la misión", "Mission design")}
        stage={tr(
          "Etapa de diseño: del objetivo científico a los requisitos y el diseño (CML 1 a 4).",
          "Design stage: from the science goal to requirements and design (CML 1 to 4).",
        )}
        briefing={def.briefing}
        objectives={def.objectives}
        model={MODELS.landsat}
        focus={focusName(def, preview, highlight)}
        slots={<HangarSlots def={def} state={state} act={act} onPreview={onPreview} />}
        stats={[
          cap !== undefined
            ? {
                label: tr("Masa / capacidad del lanzador", "Mass / launcher capacity"),
                value: mass,
                max: cap,
                unit: "kg",
                warn: mass > cap,
              }
            : { label: tr("Masa", "Mass"), value: mass, unit: "kg" },
          {
            label: tr("Presupuesto restante", "Budget left"),
            value: budget,
            max: param(def, "budget_usd_m"),
            unit: "M USD",
            warn: budget < 0,
          },
          {
            label: tr("Potencia al sol / consumo", "Power in sunlight / load"),
            value: gen,
            max: Math.max(load, 1),
            unit: "W",
            warn: gen < load,
          },
          { label: tr("Batería", "Battery"), value: state.battery_capacity_wh ?? 0, unit: "Wh" },
        ]}
        extra={
          <>
            <PrepCard
              title={tr("Ponlo en órbita", "Put it in orbit")}
              ready={Boolean(state.selected?.objective)}
              done={validated}
              onOpen={() => setTaller(true)}
            />
            <h3 className="hstat-title">{tr("Órbita", "Orbit")}</h3>
            <div className="orbit-preview" aria-label="Órbita elegida">
              <OrbitPreview2 altitude_km={state.altitude_km ?? null} inclination_deg={state.inclination_deg ?? 0} />
              <span className="preview-note">
                {state.altitude_km === undefined
                  ? tr("Elige una órbita.", "Choose an orbit.")
                  : `${formatNumber(state.altitude_km)} km · ${formatNumber(state.inclination_deg ?? 0, 1)}°`}
              </span>
            </div>
          </>
        }
        problems={[...tallerProblems, ...blocked.map((e) => e.text.replace(/^Lanzamiento bloqueado: /, ""))]}
        onLaunch={() => {
          if (!validated) {
            setTaller(true);
            return;
          }
          setAttemptFrom(state.events.length);
          act({ type: "launch" });
        }}
        assistant={<Assistant events={state.events} max={1} />}
        onExit={onExit}
        onGlossary={() => onOverlay("glossary")}
        onCredits={() => onOverlay("credits")}
      />
      {taller && (
        <OrbitLaunch
          def={def}
          state={state}
          act={act}
          onDone={() => setValidatedFor(`${state.selected?.orbit}|${state.selected?.objective}`)}
          onClose={() => setTaller(false)}
        />
      )}
    </>
  );
}

function Operations({ def, state }: { def: ScenarioDefinition; state: SimState }) {
  const goal = param(def, "data_goal_mb");
  const storage = param(def, "storage_mb");
  const left = Math.max(0, param(def, "mission_duration_s") - state.resources.mission_elapsed_s);
  const sent = state.data_downlinked_mb ?? 0;
  const { inEclipse } = orbitGeometry(state);
  const bat = state.battery_wh ?? 0;
  const batCap = state.battery_capacity_wh ?? 0;
  return (
    <>
      <table className="mini">
        <tbody>
          <tr>
            <th>{tr("Órbita", "Orbit")}</th>
            <td className="num">
              {formatNumber(state.altitude_km ?? 0)} km · {formatNumber(state.inclination_deg ?? 0, 1)}°
            </td>
          </tr>
          <tr>
            <th>{tr("Luz", "Light")}</th>
            <td className="num">
              {inEclipse ? tr("Eclipse (sin sol)", "Eclipse (no sun)") : tr("Al sol", "In sunlight")}
            </td>
          </tr>
          <tr>
            <th>{tr("Estación terrena", "Ground station")}</th>
            <td className="num">
              {state.comm_window_open ? tr("Pase abierto", "Pass open") : tr("Sin enlace", "No link")}
            </td>
          </tr>
          <tr className={bat <= 0 ? "neg" : ""}>
            <th>{tr("Batería", "Battery")}</th>
            <td className="num">
              {formatNumber(bat)} / {formatNumber(batCap)} Wh
            </td>
          </tr>
          <tr className={state.resources.data_stored_mb >= storage ? "neg" : ""}>
            <th>{tr("Memoria", "Memory")}</th>
            <td className="num">
              {formatNumber(state.resources.data_stored_mb)} / {formatNumber(storage)} MB
            </td>
          </tr>
          <tr>
            <th>{tr("Tiempo restante", "Time left")}</th>
            <td className="num">{formatElapsed(left)}</td>
          </tr>
        </tbody>
      </table>
      <p>
        {tr("Datos en tierra:", "Data on the ground:")}{" "}
        <span className="num">
          {formatNumber(sent)} / {formatNumber(goal)} MB
        </span>
      </p>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.round(sent)}>
        <div style={{ width: `${Math.min(100, (sent / goal) * 100)}%` }} />
      </div>
    </>
  );
}
