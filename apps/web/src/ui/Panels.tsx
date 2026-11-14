import type { Health, SimEvent, SimState } from "@ikaros/contracts";
import { formatElapsed, formatNumber } from "./format";
import { tr } from "../i18n";

const healthLabel = (h: Health) =>
  ({
    nominal: "NOMINAL",
    warning: tr("ADVERTENCIA", "WARNING"),
    critical: tr("CRÍTICO", "CRITICAL"),
  })[h];

export interface TimeScale {
  value: number;
  label: string;
}

/** Etiqueta de una velocidad de tiempo: "Pausa" o "60×". */
export const scaleLabel = (v: number) => (v === 0 ? tr("Pausa", "Pause") : `${v}×`);

const TIME_SCALES = [0, 1, 10, 60, 600];

/** Nombre de cada fase del motor, en el idioma actual. */
export const phaseLabel = (phase: string): string =>
  ({
    hangar: "Hangar",
    transfer: tr("Transferencia", "Transfer"),
    repair: tr("Reparación", "Repair"),
    operations: tr("Operación", "Operations"),
    cruise: tr("Crucero", "Cruise"),
    encounter: tr("Encuentro", "Encounter"),
    exit: tr("Salida", "Exit"),
    complete: tr("Informe", "Report"),
  })[phase] ?? phase;

export function TopBar({
  state,
  timeScale,
  onTimeScale,
  onTogglePanels,
  follow,
  onFollow,
  onCredits,
  onGlossary,
  onExit,
  subtitle,
  scales = TIME_SCALES.map((v) => ({ value: v, label: scaleLabel(v) })),
  maxScale = Infinity,
}: {
  state: SimState;
  timeScale: number;
  onTimeScale: (v: number) => void;
  onTogglePanels: () => void;
  follow?: boolean;
  onFollow?: () => void;
  onCredits: () => void;
  onGlossary?: () => void;
  onExit?: () => void;
  subtitle: string;
  scales?: TimeScale[];
  /** Las velocidades por encima de este valor se desactivan. */
  maxScale?: number;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">IKAROS</span>
        <span className="brand-sub">{subtitle}</span>
      </div>
      <div className="clock" aria-label={tr("Tiempo de misión", "Mission time")}>
        <span className="clock-label">T+</span>
        <span className="clock-value">{formatElapsed(state.resources.mission_elapsed_s)}</span>
      </div>
      <div className="status">
        <span className={`badge badge-${state.health}`}>{healthLabel(state.health)}</span>
        <span className="phase">{phaseLabel(state.phase)}</span>
      </div>
      <div className="scale" role="group" aria-label={tr("Velocidad del tiempo", "Time speed")}>
        {scales.map((sc) => (
          <button
            key={sc.value}
            className={sc.value === timeScale ? "on" : ""}
            onClick={() => onTimeScale(sc.value)}
            disabled={state.phase === "hangar" || state.phase === "complete" || sc.value > maxScale}
          >
            {sc.label}
          </button>
        ))}
      </div>
      <div className="scale" role="group" aria-label={tr("Vista", "View")}>
        <button onClick={onTogglePanels} title={tr("Mostrar u ocultar paneles (H)", "Show or hide panels (H)")}>
          {tr("Paneles", "Panels")}
        </button>
        {onFollow && (
          <button
            className={follow ? "on" : ""}
            onClick={onFollow}
            title={tr("Cámara que sigue al objetivo", "Camera that follows the target")}
          >
            {tr("Seguir", "Follow")}
          </button>
        )}
        {onGlossary && <button onClick={onGlossary}>{tr("Glosario", "Glossary")}</button>}
        <button onClick={onCredits}>{tr("Créditos", "Credits")}</button>
        {onExit && <button onClick={onExit}>{tr("Menú", "Menu")}</button>}
      </div>
    </header>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="num">{value}</td>
      <td className="unit">{unit}</td>
    </tr>
  );
}

/** Medidor de HUD: etiqueta, valor y barra; cambia de color al cruzar el umbral. */
function Gauge({
  label,
  value,
  max,
  text,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  tone: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`gauge gauge-${tone}`}>
      <div className="gauge-head">
        <span>{label}</span>
        <span className="num">{text}</span>
      </div>
      <div className="gauge-bar" aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ResourcesPanel({ state }: { state: SimState }) {
  const r = state.resources;
  const margin = r.power_generated_w - r.power_consumed_w;
  const battery = state.battery_wh;
  const batteryCap = state.battery_capacity_wh ?? 0;
  const hull = state.hull_durability_pct;
  return (
    <section className="panel resources" aria-labelledby="res-h">
      <h2 id="res-h">{tr("Recursos", "Resources")}</h2>
      <div className="gauges">
        <Gauge
          label={tr("Potencia", "Power")}
          value={r.power_generated_w}
          max={Math.max(r.power_consumed_w * 1.5, r.power_generated_w, 1)}
          text={`${formatNumber(r.power_generated_w)} / ${formatNumber(r.power_consumed_w)} W`}
          tone={margin < 0 ? "bad" : "ok"}
        />
        {battery !== undefined && batteryCap > 0 && (
          <Gauge
            label={tr("Batería", "Battery")}
            value={battery}
            max={batteryCap}
            text={`${formatNumber((battery / batteryCap) * 100)} %`}
            tone={battery / batteryCap < 0.25 ? "bad" : battery / batteryCap < 0.5 ? "mid" : "ok"}
          />
        )}
        {hull !== undefined && (
          <Gauge
            label={tr("Casco", "Hull")}
            value={hull}
            max={100}
            text={`${formatNumber(hull, 1)} %`}
            tone={hull < 30 ? "bad" : hull < 60 ? "mid" : "ok"}
          />
        )}
      </div>
      <table>
        <tbody>
          <Row label={tr("Masa", "Mass")} value={formatNumber(r.mass_kg)} unit="kg" />
          <Row label={tr("Potencia generada", "Power generated")} value={formatNumber(r.power_generated_w)} unit="W" />
          <Row label={tr("Potencia consumida", "Power consumed")} value={formatNumber(r.power_consumed_w)} unit="W" />
          <tr className={margin < 0 ? "neg" : ""}>
            <th scope="row">{tr("Margen", "Margin")}</th>
            <td className="num">{(margin > 0 ? "+" : "") + formatNumber(margin)}</td>
            <td className="unit">W</td>
          </tr>
          {state.delta_v_remaining_m_s !== undefined && (
            <Row
              label={tr("Δv disponible", "Available Δv")}
              value={formatNumber(state.delta_v_remaining_m_s, 1)}
              unit="m/s"
            />
          )}
          {state.battery_wh !== undefined && (
            <Row
              label={tr("Batería", "Battery")}
              value={`${formatNumber(state.battery_wh)} / ${formatNumber(state.battery_capacity_wh ?? 0)}`}
              unit="Wh"
            />
          )}
          <Row
            label={tr("Presupuesto restante", "Budget left")}
            value={formatNumber(state.budget_remaining_usd_m ?? r.budget_usd_m)}
            unit="M USD"
          />
          <Row label={tr("Datos almacenados", "Data stored")} value={formatNumber(r.data_stored_mb, 1)} unit="MB" />
          <Row label={tr("Enlace de bajada", "Downlink")} value={formatNumber(r.downlink_rate_kbps)} unit="kbps" />
        </tbody>
      </table>
    </section>
  );
}

const kindLabel = (k: SimEvent["kind"]) =>
  ({
    info: "INFO",
    warning: tr("AVISO", "WARNING"),
    failure: tr("FALLO", "FAILURE"),
    crisis: "CRISIS",
  })[k];

export function EventLog({ events }: { events: SimEvent[] }) {
  const recent = [...events].reverse().slice(0, 4);
  return (
    <section className="panel log" aria-labelledby="log-h">
      <h2 id="log-h">{tr("Registro de misión", "Mission log")}</h2>
      {recent.length === 0 ? (
        <p className="empty">{tr("Sin eventos.", "No events.")}</p>
      ) : (
        <ol>
          {recent.map((e) => (
            <li key={e.id} className={`kind-${e.kind}`}>
              <span className="t">T+ {formatElapsed(e.at_s)}</span>
              <span className="k">{kindLabel(e.kind)}</span>
              <span className="x">{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
