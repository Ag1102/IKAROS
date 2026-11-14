import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { useSimulation } from "../../sim/useSimulation";
import { IkarosScene, OrbitPreview, probeOrbit } from "./IkarosScene";
import { EventLog, ResourcesPanel, TopBar, type TimeScale } from "../../ui/Panels";
import { HangarSlots } from "../../ui/HangarSlots";
import { Decisions, openDecisions } from "../../ui/Decisions";
import { Report } from "../../ui/Report";
import { Assistant } from "../../ui/Assistant";
import { Overlay, type OverlayKind } from "../../ui/Overlay";
import { formatNumber } from "../../ui/format";
import { PAPER } from "../../data/sources";
import { useHotkey } from "../../hooks/useHotkey";
import { usePreview } from "../../ships/usePreview";
import { MODELS } from "../../ships/models";
import { HangarLayout, focusName } from "../../ui/hangar/HangarLayout";

const SCALES: TimeScale[] = [
  { value: 0, label: "Pausa" },
  { value: 600, label: "10 min/s" },
  { value: 3600, label: "1 h/s" },
  { value: 86_400, label: "1 d/s" },
  { value: 604_800, label: "1 sem/s" },
];
/** Velocidad máxima durante el encuentro: lo interesante pasa en unas horas cerca del perihelio. */
const ENCOUNTER_MAX_SCALE = 3600;

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;
const flybysOf = (def: ScenarioDefinition) =>
  Object.keys(def.params).filter((k) => /^perihelion_after_flyby_\d+_rsun$/.test(k)).length;

export function IkarosScreen({ onExit }: { onExit: () => void }) {
  const [timeScale, setTimeScale] = useState(86_400);
  const [hideUi, setHideUi] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [follow, setFollow] = useState(false);
  const { state, latest, act, restart, report, def } = useSimulation("level3-ikaros", timeScale, (s) =>
    s.phase === "encounter" ? ENCOUNTER_MAX_SCALE : Infinity,
  );

  useHotkey("h", () => setHideUi((v) => !v));

  // Una decisión nueva pausa el tiempo: sus plazos son de días y a 1 semana/s pasarían sin verse.
  const openCount = openDecisions(state.events).length;
  const prevOpen = useRef(openCount);
  useEffect(() => {
    if (openCount > prevOpen.current) setTimeScale(0);
    prevOpen.current = openCount;
  }, [openCount]);

  // Al entrar al encuentro se limita la velocidad para poder gestionar la matriz.
  useEffect(() => {
    if (state.phase === "encounter") setTimeScale((v) => Math.min(v, ENCOUNTER_MAX_SCALE));
  }, [state.phase]);

  const onRestart = () => {
    setTimeScale(86_400);
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
        scales={SCALES}
        maxScale={state.phase === "encounter" ? ENCOUNTER_MAX_SCALE : Infinity}
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
          <h2 id="enc-h">Misión</h2>
          <Decisions events={state.events} now_s={state.resources.mission_elapsed_s} act={act} />
          {report ? (
            <Report report={report} onRestart={onRestart} />
          ) : (
            <>
              <Status state={state} />
              {(state.phase === "encounter" || state.phase === "exit" || state.phase === "cruise") && (
                <Controls def={def} state={state} act={act} />
              )}
            </>
          )}
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
  const flybys = flybysOf(def);
  const mass = state.resources.mass_kg;
  const cap = state.mass_capacity_kg ?? 0;
  const budget = state.budget_remaining_usd_m ?? 0;
  const { preview, highlight, onPreview } = usePreview(state.selected);

  return (
    <HangarLayout
      levelTitle={def.title}
      heading="Diseño de la nave"
      stage="Etapa de diseño: estudio de compromisos (CML 3). Al lanzar, el diseño queda fijo (CML 4)."
      briefing={def.briefing}
      objectives={def.objectives}
      model={MODELS.parker}
      focus={focusName(def, preview, highlight)}
      slots={<HangarSlots def={def} state={state} act={act} onPreview={onPreview} />}
      stats={[
        { label: "Masa al lanzamiento", value: mass, max: cap, unit: "kg", warn: mass > cap },
        {
          label: "Presupuesto restante",
          value: budget,
          max: param(def, "budget_usd_m"),
          unit: "M USD",
          warn: budget < 0,
        },
        { label: "Consumo eléctrico", value: state.power_load_w ?? 0, unit: "W" },
      ]}
      extra={
        <>
          <h3 className="hstat-title">Trayectoria</h3>
          <div className="orbit-preview" aria-label="Órbita inicial y final prevista">
            <OrbitPreview start={start} final={final} />
            <span className="preview-note">
              Gris: primera órbita · Blanca: final tras {flybys} sobrevuelos de Venus (
              {formatNumber(param(def, "perihelion_start_rsun"), 1)} →{" "}
              {formatNumber(param(def, `perihelion_after_flyby_${flybys}_rsun`), 1)} R☉).
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
  );
}

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <tr className={warn ? "neg" : ""}>
      <th>{label}</th>
      <td className="num">{value}</td>
    </tr>
  );
}

function Status({ state }: { state: SimState }) {
  const s = state;
  const enc = s.phase === "encounter" || s.phase === "exit";
  return (
    <table className="mini">
      <tbody>
        <Row
          label="Distancia al Sol"
          value={`${formatNumber(s.distance_to_sun_rsun ?? 0, 1)} R☉ · ${formatNumber(s.distance_to_sun_au ?? 0, 3)} AU`}
        />
        <Row label="Intensidad solar" value={`${formatNumber(s.solar_intensity_suns ?? 0, 1)} × AM0`} />
        <Row label="Velocidad" value={`${formatNumber(s.speed_km_s ?? 0, 1)} km/s`} />
        <Row
          label="Perihelio"
          value={`${formatNumber(s.perihelion_rsun ?? 0, 1)} R☉ · ${s.venus_flybys_done ?? 0} sobrevuelos de Venus`}
        />
        {enc && (
          <>
            <Row
              label="Celdas"
              value={`${formatNumber(s.cell_temperature_c ?? 0)} °C / ${PAPER.cellDesignLimit_c}`}
              warn={(s.cell_temperature_c ?? 0) > PAPER.cellDesignLimit_c}
            />
            <Row label="Radiadores" value={`${formatNumber(s.radiator_temperature_c ?? 0)} °C`} />
            {s.main_array_temperature_c !== undefined && (
              <Row label="Matriz principal" value={`${formatNumber(s.main_array_temperature_c)} °C`} />
            )}
            <Row
              label="Potencia"
              value={`${formatNumber(s.resources.power_generated_w)} / ${formatNumber(s.power_load_w ?? 0)} W`}
              warn={s.resources.power_generated_w < (s.power_load_w ?? 0)}
            />
            <Row
              label="Casco"
              value={`${formatNumber(s.hull_durability_pct ?? 0, 1)} %`}
              warn={(s.hull_durability_pct ?? 100) < 60}
            />
            {(s.nanobot_reserve_pct ?? 0) > 0 && (
              <Row label="Reserva de nanobots ⚗" value={`${formatNumber(s.nanobot_reserve_pct ?? 0)} %`} />
            )}
            <Row label="Datos enviados" value={`${formatNumber(s.data_downlinked_mb ?? 0, 1)} MB`} />
          </>
        )}
      </tbody>
    </table>
  );
}

/** Retracción en escala logarítmica sobre el área iluminada: de toda la matriz a ~1 cm² (y 0). */
const SLIDER_MAX = 1000;
const DECADES = 3;
function areaFromSlider(v: number, full: number) {
  return v <= 0 ? 0 : full * 10 ** (DECADES * (v / SLIDER_MAX - 1));
}
function sliderFromArea(area: number, full: number) {
  return area <= 0 ? 0 : Math.round(SLIDER_MAX * (1 + Math.log10(Math.max(area, 1e-9) / full) / DECADES));
}

function Controls({ def, state, act }: { def: ScenarioDefinition; state: SimState; act: (a: PlayerAction) => void }) {
  const full = param(def, "secondary_array_area_cm2");
  const area = state.array_illuminated_cm2 ?? full;
  const reactor = state.selected?.energy === "fission-reactor";
  return (
    <div className="burn">
      {!reactor && (
        <>
          <label htmlFor="ret">
            Matriz secundaria iluminada <span className="num">{formatNumber(area, area < 10 ? 1 : 0)} cm²</span>
          </label>
          <input
            id="ret"
            type="range"
            min={0}
            max={SLIDER_MAX}
            step={1}
            value={Math.max(0, Math.min(SLIDER_MAX, sliderFromArea(area, full)))}
            onChange={(e) => {
              const a = areaFromSlider(Number(e.target.value), full);
              act({ type: "retract-array", fraction: 1 - a / full });
            }}
          />
          <p className="note">
            Escala logarítmica. En el perihelio el paper deja unos {formatNumber(PAPER.perihelionIlluminated_cm2)} cm²
            iluminados de {formatNumber(full)}.
          </p>
        </>
      )}
      {!state.main_array_stowed && (
        <>
          <label htmlFor="tilt">
            Inclinación de la matriz principal <span className="num">{formatNumber(state.array_tilt_deg ?? 0)}°</span>
          </label>
          <input
            id="tilt"
            type="range"
            min={0}
            max={PAPER.mainArrayMaxTilt_deg}
            step={1}
            value={state.array_tilt_deg ?? 0}
            onChange={(e) => act({ type: "tilt-array", deg: Number(e.target.value) })}
          />
          <button className="scale-btn wide" onClick={() => act({ type: "stow-main-array" })}>
            Plegar la matriz principal tras el escudo
          </button>
        </>
      )}
      <div className="scale attitude" role="group" aria-label="Actitud">
        <button
          className={state.attitude === "shield-to-sun" ? "on" : ""}
          onClick={() => act({ type: "set-attitude", attitude: "shield-to-sun" })}
        >
          Escudo al Sol
        </button>
        <button
          className={state.attitude === "antenna-to-earth" ? "on" : ""}
          onClick={() => act({ type: "set-attitude", attitude: "antenna-to-earth" })}
        >
          Antena a la Tierra
        </button>
      </div>
      <p className="note">
        Con la antena a la Tierra se envían datos, pero los radiadores salen de la sombra del escudo.
      </p>
    </div>
  );
}
