import { useEffect, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { useSimulation } from "../sim/useSimulation";
import { Level2Scene, OrbitPreview2 } from "../level2/Level2Scene";
import { orbitGeometry } from "../level2/geometry";
import { EventLog, ResourcesPanel, TopBar, type TimeScale } from "../ui/Panels";
import { HangarSlots } from "../ui/HangarSlots";
import { Report } from "../ui/Report";
import { Assistant } from "../ui/Assistant";
import { Overlay, type OverlayKind } from "../ui/Overlay";
import { formatElapsed, formatNumber } from "../ui/format";
import { useHotkey } from "../hooks/useHotkey";
import { ShipPreview } from "../ships/ShipPreview";
import { usePreview } from "../ships/usePreview";
import { tr } from "../i18n";

const scales = (): TimeScale[] => [
  { value: 0, label: tr("Pausa", "Pause") },
  { value: 60, label: "60×" },
  { value: 600, label: "10 min/s" },
  { value: 3600, label: "1 h/s" },
  { value: 21_600, label: "6 h/s" },
];

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;

export function Level2Screen({ onExit }: { onExit: () => void }) {
  const [timeScale, setTimeScale] = useState(3600);
  const [hideUi, setHideUi] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [follow, setFollow] = useState(false);
  const { state, latest, act, restart, report, def } = useSimulation("level2-leo", timeScale);

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
        <Level2Scene latest={latest} follow={follow} inclination_deg={state.inclination_deg ?? 0} />
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
      <footer className="orbit-note">
        {tr(
          "Tierra y órbita a escala real; satélite con tamaño mínimo para verlo · Línea azul: enlace con la estación terrena · H: paneles",
          "Earth and orbit to real scale; satellite drawn at a minimum size so you can see it · Blue line: link with the ground station · H: panels",
        )}
      </footer>
      <aside className="guide-wrap">
        <section className="panel guide" aria-labelledby="ops-h">
          <h2 id="ops-h">{tr("Operación", "Operations")}</h2>
          {report ? <Report report={report} onRestart={onRestart} /> : <Operations def={def} state={state} />}
          <Assistant events={state.events} />
        </section>
      </aside>
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
  const { preview, highlight, onPreview } = usePreview(state.selected);
  const load = state.resources.power_consumed_w;

  return (
    <div className="hangar">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">IKAROS</span>
          <span className="brand-sub">{def.title} · Hangar</span>
        </div>
        <div />
        <div />
        <div />
        <div className="scale">
          <button onClick={() => onOverlay("glossary")}>{tr("Glosario", "Glossary")}</button>
          <button onClick={() => onOverlay("credits")}>{tr("Créditos", "Credits")}</button>
          <button onClick={onExit}>{tr("Menú", "Menu")}</button>
        </div>
      </header>

      <main className="hangar-body">
        <section className="panel">
          <h2>{tr("Diseño de la misión", "Mission design")}</h2>
          <p className="stage">
            {tr(
              "Etapa de diseño: del objetivo científico a los requisitos y el diseño (CML 1 a 4).",
              "Design stage: from the science objective to requirements and design (CML 1 to 4).",
            )}
          </p>
          {def.briefing.map((b) => (
            <p key={b}>{b}</p>
          ))}
          <ul className="causes">
            {def.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <HangarSlots def={def} state={state} act={act} onPreview={onPreview} />
        </section>

        <section className="panel summary">
          <h2>{tr("Tu satélite", "Your satellite")}</h2>
          <div className="ship-preview large" aria-label={tr("Tu satélite", "Your satellite")}>
            <ShipPreview kind="smallsat" selected={preview} highlight={highlight} />
            <span className="preview-note">
              {tr("Pasa el ratón por una pieza para verla montada", "Hover over a part to see it mounted")}
            </span>
          </div>
          <h2>{tr("Órbita", "Orbit")}</h2>
          <div className="orbit-preview" aria-label={tr("Órbita elegida", "Chosen orbit")}>
            <OrbitPreview2 altitude_km={state.altitude_km ?? null} inclination_deg={state.inclination_deg ?? 0} />
            <span className="preview-note">
              {state.altitude_km === undefined
                ? tr("Elige una órbita.", "Choose an orbit.")
                : `${formatNumber(state.altitude_km)} km · ${tr("inclinación", "inclination")} ${formatNumber(state.inclination_deg ?? 0, 1)}°. ${tr("Escala real.", "Real scale.")}`}
            </span>
          </div>

          <h2>{tr("Lanzamiento", "Launch")}</h2>
          <div className="meter">
            <span>{tr("Masa", "Mass")}</span>
            <span className="num">
              {formatNumber(mass)} {cap !== undefined ? `/ ${formatNumber(cap)}` : ""} kg
            </span>
            {cap !== undefined && (
              <div className="bar">
                <div className={mass > cap ? "over" : ""} style={{ width: `${Math.min(100, (mass / cap) * 100)}%` }} />
              </div>
            )}
          </div>
          <p className="note">
            {tr(
              "La capacidad depende del lanzador y de la órbita: a la heliosíncrona se lleva el",
              "Capacity depends on the launcher and the orbit: to the sun-synchronous orbit it carries",
            )}{" "}
            {formatNumber(param(def, "sso_capacity_factor") * 100)} % {tr("de la carga.", "of the payload.")}
          </p>
          <div className="meter">
            <span>{tr("Presupuesto restante", "Budget left")}</span>
            <span className={budget < 0 ? "num neg-text" : "num"}>{formatNumber(budget)} M USD</span>
          </div>
          <div className="meter">
            <span>{tr("Potencia (sol) / consumo", "Power (sunlight) / load")}</span>
            <span className={gen < load ? "num neg-text" : "num"}>
              {formatNumber(gen)} / {formatNumber(load)} W
            </span>
          </div>
          <div className="meter">
            <span>{tr("Batería", "Battery")}</span>
            <span className="num">{formatNumber(state.battery_capacity_wh ?? 0)} Wh</span>
          </div>
          {blocked.length > 0 && (
            <ul className="problems">
              {blocked.map((e) => (
                <li key={e.id}>{e.text.replace(/^(Lanzamiento bloqueado|Launch blocked): /, "")}</li>
              ))}
            </ul>
          )}
          <button
            className="primary"
            onClick={() => {
              setAttemptFrom(state.events.length);
              act({ type: "launch" });
            }}
          >
            {tr("Lanzar misión", "Launch mission")}
          </button>
          <Assistant events={state.events} max={1} />
        </section>
      </main>
    </div>
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
      <p className="note">
        {tr(
          "En la operación no hay mandos: el resultado depende del diseño. Observa los eclipses, los pases y la memoria.",
          "There are no controls during operations: the result depends on the design. Watch the eclipses, the passes and the memory.",
        )}
      </p>
    </>
  );
}
