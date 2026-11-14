import { useEffect, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { useSimulation } from "../../sim/useSimulation";
import { ObservacionTierraScene, OrbitPreview2 } from "./ObservacionTierraScene";
import { orbitGeometry } from "./geometry";
import { EventLog, ResourcesPanel, TopBar, type TimeScale } from "../../ui/Panels";
import { HangarSlots } from "../../ui/HangarSlots";
import { Report } from "../../ui/Report";
import { Assistant } from "../../ui/Assistant";
import { Overlay, type OverlayKind } from "../../ui/Overlay";
import { formatElapsed, formatNumber } from "../../ui/format";
import { useHotkey } from "../../hooks/useHotkey";
import { ShipPreview } from "../../ships/ShipPreview";
import { usePreview } from "../../ships/usePreview";

const SCALES: TimeScale[] = [
  { value: 0, label: "Pausa" },
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
        scales={SCALES}
      />
      <aside className="side">
        <ResourcesPanel state={state} />
        <EventLog events={state.events} />
      </aside>
      <footer className="orbit-note">
        Tierra y órbita a escala real; satélite con tamaño mínimo para verlo · Línea azul: enlace con la estación
        terrena · H: paneles
      </footer>
      <aside className="guide-wrap">
        <section className="panel guide" aria-labelledby="ops-h">
          <h2 id="ops-h">Operación</h2>
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
          <button onClick={() => onOverlay("glossary")}>Glosario</button>
          <button onClick={() => onOverlay("credits")}>Créditos</button>
          <button onClick={onExit}>Menú</button>
        </div>
      </header>

      <main className="hangar-body">
        <section className="panel">
          <h2>Diseño de la misión</h2>
          <p className="stage">Etapa de diseño: del objetivo científico a los requisitos y el diseño (CML 1 a 4).</p>
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
          <h2>Tu satélite</h2>
          <div className="ship-preview large" aria-label="Tu satélite">
            <ShipPreview kind="smallsat" selected={preview} highlight={highlight} />
            <span className="preview-note">Pasa el ratón por una pieza para verla montada</span>
          </div>
          <h2>Órbita</h2>
          <div className="orbit-preview" aria-label="Órbita elegida">
            <OrbitPreview2 altitude_km={state.altitude_km ?? null} inclination_deg={state.inclination_deg ?? 0} />
            <span className="preview-note">
              {state.altitude_km === undefined
                ? "Elige una órbita."
                : `${formatNumber(state.altitude_km)} km · inclinación ${formatNumber(state.inclination_deg ?? 0, 1)}°. Escala real.`}
            </span>
          </div>

          <h2>Lanzamiento</h2>
          <div className="meter">
            <span>Masa</span>
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
            La capacidad depende del lanzador y de la órbita: a la heliosíncrona se lleva el{" "}
            {formatNumber(param(def, "sso_capacity_factor") * 100)} % de la carga.
          </p>
          <div className="meter">
            <span>Presupuesto restante</span>
            <span className={budget < 0 ? "num neg-text" : "num"}>{formatNumber(budget)} M USD</span>
          </div>
          <div className="meter">
            <span>Potencia (sol) / consumo</span>
            <span className={gen < load ? "num neg-text" : "num"}>
              {formatNumber(gen)} / {formatNumber(load)} W
            </span>
          </div>
          <div className="meter">
            <span>Batería</span>
            <span className="num">{formatNumber(state.battery_capacity_wh ?? 0)} Wh</span>
          </div>
          {blocked.length > 0 && (
            <ul className="problems">
              {blocked.map((e) => (
                <li key={e.id}>{e.text.replace(/^Lanzamiento bloqueado: /, "")}</li>
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
            Lanzar misión
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
            <th>Órbita</th>
            <td className="num">
              {formatNumber(state.altitude_km ?? 0)} km · {formatNumber(state.inclination_deg ?? 0, 1)}°
            </td>
          </tr>
          <tr>
            <th>Luz</th>
            <td className="num">{inEclipse ? "Eclipse (sin sol)" : "Al sol"}</td>
          </tr>
          <tr>
            <th>Estación terrena</th>
            <td className="num">{state.comm_window_open ? "Pase abierto" : "Sin enlace"}</td>
          </tr>
          <tr className={bat <= 0 ? "neg" : ""}>
            <th>Batería</th>
            <td className="num">
              {formatNumber(bat)} / {formatNumber(batCap)} Wh
            </td>
          </tr>
          <tr className={state.resources.data_stored_mb >= storage ? "neg" : ""}>
            <th>Memoria</th>
            <td className="num">
              {formatNumber(state.resources.data_stored_mb)} / {formatNumber(storage)} MB
            </td>
          </tr>
          <tr>
            <th>Tiempo restante</th>
            <td className="num">{formatElapsed(left)}</td>
          </tr>
        </tbody>
      </table>
      <p>
        Datos en tierra:{" "}
        <span className="num">
          {formatNumber(sent)} / {formatNumber(goal)} MB
        </span>
      </p>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.round(sent)}>
        <div style={{ width: `${Math.min(100, (sent / goal) * 100)}%` }} />
      </div>
      <p className="note">
        En la operación no hay mandos: el resultado depende del diseño. Observa los eclipses, los pases y la memoria.
      </p>
    </>
  );
}
