import type { PlayerAction } from "@ikaros/contracts";
import { PARAMS, TOOLS, apoAlt, periAlt, type Level1View, type Orbit, type Phase } from "../level1/game";
import { orbitalPeriodS } from "../sim/orbit";
import { formatElapsed, formatNumber } from "./format";
import { Assistant } from "./Assistant";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "briefing", label: "Briefing" },
  { phase: "burn1", label: "Quema 1" },
  { phase: "coast", label: "Tránsito" },
  { phase: "burn2", label: "Quema 2" },
  { phase: "toolkit", label: "Carga" },
  { phase: "repair", label: "Reparación" },
  { phase: "result", label: "Informe" },
];

interface Props {
  view: Level1View;
  report: {
    score: number;
    causes: { text: string; source?: string }[];
    metrics: Record<string, number | string | boolean>;
  };
  dv1: number;
  dv2: number;
  setDv1: (v: number) => void;
  setDv2: (v: number) => void;
  preview: Orbit | null;
  act: (a: PlayerAction) => void;
}

function Stepper({ phase }: { phase: Phase }) {
  const idx = STEPS.findIndex((s) => s.phase === phase);
  return (
    <ol className="stepper" aria-label="Fases del nivel">
      {STEPS.map((s, i) => (
        <li key={s.label} className={i < idx ? "done" : i === idx ? "now" : ""}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function BurnControls({
  value,
  max,
  onChange,
  preview,
  onExecute,
  label,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  preview: Orbit | null;
  onExecute: () => void;
  label: string;
}) {
  const target = PARAMS.targetAlt_km;
  const ra = preview ? apoAlt(preview) : null;
  const rp = preview ? periAlt(preview) : null;
  return (
    <div className="burn">
      <label htmlFor="dv">
        Δv prograde <span className="num">{formatNumber(value, 1)} m/s</span>
      </label>
      <input
        id="dv"
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <table className="mini">
        <tbody>
          <tr>
            <th>Apogeo previsto</th>
            <td className="num">{ra === null ? "—" : `${formatNumber(ra, 0)} km`}</td>
          </tr>
          <tr>
            <th>Perigeo previsto</th>
            <td className="num">{rp === null ? "—" : `${formatNumber(rp, 0)} km`}</td>
          </tr>
          <tr>
            <th>Altura del objetivo</th>
            <td className="num">{target} km</td>
          </tr>
        </tbody>
      </table>
      <button className="primary" onClick={onExecute} disabled={value < 1}>
        {label}
      </button>
    </div>
  );
}

function Segments({ view, report }: Pick<Props, "view" | "report">) {
  const m = report.metrics;
  const dv = Number(m.burn1_dv_ms ?? 0) + Number(m.burn2_dv_ms ?? 0);
  const ok = view.outcome === "success";
  return (
    <ul className="segments" aria-label="Informe por segmentos de misión">
      <li>
        <b>Lanzamiento</b>
        No aplica en este nivel: el vehículo de servicio ya estaba en órbita de {PARAMS.startAlt_km} km.
      </li>
      <li>
        <b>Espacio</b>
        Δv usado {formatNumber(dv, 1)} m/s; combustible restante{" "}
        {formatNumber(Number(m.propellant_left_kg ?? view.propellant_kg), 1)} kg; carga de reparación {view.toolMass_kg}{" "}
        kg de {PARAMS.payloadCap_kg} kg.
      </li>
      <li>
        <b>Tierra</b>
        Ventana de comunicación de {PARAMS.commWindow_s} s; trabajo de {view.repairDuration_s} s.
      </li>
      <li>
        <b>Usuario</b>
        {ok
          ? "El telescopio recupera su energía y la antena; los científicos reciben datos de nuevo."
          : "Los científicos siguen sin los datos del telescopio."}
      </li>
    </ul>
  );
}

export function LevelPanel({ view, report, dv1, dv2, setDv1, setDv2, preview, act }: Props) {
  const overMass = view.toolMass_kg > PARAMS.payloadCap_kg;
  const maxBurn = Math.min(view.dvLeft_ms, PARAMS.maxBurn_ms);
  const period_min = Math.round(orbitalPeriodS(PARAMS.targetAlt_km) / 60);

  return (
    <section className="panel guide" aria-labelledby="guide-h">
      <h2 id="guide-h">Guía de misión</h2>
      <Stepper phase={view.phase} />

      {view.phase === "briefing" && (
        <>
          <p>
            El satélite objetivo perdió el panel solar B y su antena de alta ganancia no responde. Tu vehículo de
            servicio está en una órbita circular de {PARAMS.startAlt_km} km; el objetivo orbita a {PARAMS.targetAlt_km}{" "}
            km.
          </p>
          <p>
            Subir {PARAMS.targetAlt_km - PARAMS.startAlt_km} km no se logra «acelerando hacia arriba»: se hace con dos
            quemas, una que estira la órbita (transferencia de Hohmann) y otra que la circulariza. Cada m/s de Δv gasta
            combustible, y solo llevas {PARAMS.propellant_kg} kg.
          </p>
          <p className="note">
            Simplificación del tutorial: la fase angular del encuentro ya está planificada para la transferencia ideal.
          </p>
          <Assistant trigger="l1:briefing" />
          <button className="primary" onClick={() => act({ type: "resolve-event", eventId: "briefing", choice: "ok" })}>
            Iniciar maniobra
          </button>
        </>
      )}

      {view.phase === "burn1" && (
        <>
          <p>
            Quema 1, en el perigeo. Ajusta el Δv hasta que el <b>apogeo previsto</b> toque la altura del objetivo (±
            {PARAMS.tolAlt_km} km). La línea punteada es la órbita resultante.
          </p>
          <BurnControls
            value={dv1}
            max={maxBurn}
            onChange={setDv1}
            preview={preview}
            label="Ejecutar quema 1"
            onExecute={() => act({ type: "burn", delta_v_m_s: dv1 })}
          />
          <p className="note">
            Δv disponible: {formatNumber(view.dvLeft_ms, 1)} m/s (combustible {formatNumber(view.propellant_kg, 1)} kg).
          </p>
        </>
      )}

      {view.phase === "coast" && (
        <>
          <p>
            En tránsito hacia el apogeo. Llegada en T+ {view.tArrival === null ? "—" : formatElapsed(view.tArrival)}.
            Puedes acelerar el tiempo.
          </p>
          <p className="note">
            A {PARAMS.targetAlt_km} km un satélite da una vuelta en unos {period_min} minutos; por eso las ventanas de
            comunicación con una estación terrena duran pocos minutos.
          </p>
        </>
      )}

      {view.phase === "burn2" && (
        <>
          <p>
            Quema 2, en el apogeo. Circulariza: haz que perigeo y apogeo queden en {PARAMS.targetAlt_km} km (±
            {PARAMS.tolAlt_km} km). Órbita actual: {formatNumber(periAlt(view.servicer), 0)} ×{" "}
            {formatNumber(apoAlt(view.servicer), 0)} km.
          </p>
          <BurnControls
            value={dv2}
            max={maxBurn}
            onChange={setDv2}
            preview={preview}
            label="Ejecutar quema 2"
            onExecute={() => act({ type: "burn", delta_v_m_s: dv2 })}
          />
          <p className="note">
            Δv disponible: {formatNumber(view.dvLeft_ms, 1)} m/s (combustible {formatNumber(view.propellant_kg, 1)} kg).
          </p>
        </>
      )}

      {view.phase === "toolkit" && (
        <>
          <p>
            Encuentro logrado. Elige qué cargar para la reparación. La ventana de comunicación dura{" "}
            {PARAMS.commWindow_s} s y la carga útil máxima es {PARAMS.payloadCap_kg} kg.
          </p>
          <ul className="tools">
            {TOOLS.map((t) => {
              const on = view.tools.includes(t.id);
              return (
                <li key={t.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => act({ type: "select-component", slot: "repair-kit", componentId: t.id })}
                    />
                    <span className="tn">{t.name}</span>
                    <span className="num">{t.mass_kg} kg</span>
                  </label>
                  <span className="td">{t.note}</span>
                </li>
              );
            })}
          </ul>
          <p className={overMass ? "neg-text" : ""}>
            Carga:{" "}
            <span className="num">
              {view.toolMass_kg} / {PARAMS.payloadCap_kg} kg
            </span>
            {overMass && " — excede el límite"}
          </p>
          <p>
            Duración estimada: <span className="num">{view.repairDuration_s} s</span> de{" "}
            <span className="num">{PARAMS.commWindow_s} s</span> de ventana.
          </p>
          <button
            className="primary"
            disabled={overMass}
            onClick={() => act({ type: "resolve-event", eventId: "start-repair", choice: "go" })}
          >
            Iniciar reparación
          </button>
        </>
      )}

      {view.phase === "repair" && (
        <>
          <p>Reparación en curso. El trabajo debe terminar antes de que se cierre la ventana de comunicación.</p>
          <div
            className="bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              ((view.t - view.repairStart_s) / Math.max(1, view.repairEnd_s - view.repairStart_s)) * 100,
            )}
          >
            <div
              style={{
                width: `${Math.min(100, ((view.t - view.repairStart_s) / Math.max(1, view.repairEnd_s - view.repairStart_s)) * 100)}%`,
              }}
            />
          </div>
          <p className="note">Quedan {formatNumber(Math.max(0, view.repairEnd_s - view.t))} s de trabajo.</p>
        </>
      )}

      {view.phase === "result" && (
        <>
          <p className={view.outcome === "success" ? "ok-text" : "neg-text"}>
            {view.outcome === "success" ? "MISIÓN CUMPLIDA" : "MISIÓN FALLIDA"} · Puntuación{" "}
            <span className="num">{formatNumber(report.score)}</span>
          </p>
          <Segments view={view} report={report} />
          <ul className="causes">
            {report.causes.map((c, i) => (
              <li key={i}>
                {c.text}
                {c.source && <span className="fact-src"> ({c.source})</span>}
              </li>
            ))}
          </ul>
          <Assistant trigger="l1:result" />
          <button className="primary" onClick={() => act({ type: "resolve-event", eventId: "restart", choice: "ok" })}>
            Reiniciar nivel
          </button>
        </>
      )}
    </section>
  );
}
