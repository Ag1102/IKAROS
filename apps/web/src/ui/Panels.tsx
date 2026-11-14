import type { Health, SimEvent, SimState } from "@ikaros/contracts";
import { formatElapsed, formatNumber } from "./format";

const HEALTH_LABEL: Record<Health, string> = {
  nominal: "NOMINAL",
  warning: "ADVERTENCIA",
  critical: "CRÍTICO",
};

const TIME_SCALES = [0, 1, 10, 60, 600];

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
  subtitle = "Nivel 1 · Servicio en órbita",
  scales = TIME_SCALES,
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
  subtitle?: string;
  scales?: number[];
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">IKAROS</span>
        <span className="brand-sub">{subtitle}</span>
      </div>
      <div className="clock" aria-label="Tiempo de misión">
        <span className="clock-label">T+</span>
        <span className="clock-value">{formatElapsed(state.resources.mission_elapsed_s)}</span>
      </div>
      <div className="status">
        <span className={`badge badge-${state.health}`}>{HEALTH_LABEL[state.health]}</span>
        <span className="phase">{state.phase}</span>
      </div>
      <div className="scale" role="group" aria-label="Velocidad del tiempo">
        {scales.map((v) => (
          <button key={v} className={v === timeScale ? "on" : ""} onClick={() => onTimeScale(v)}>
            {v === 0 ? "Pausa" : `${v}×`}
          </button>
        ))}
      </div>
      <div className="scale" role="group" aria-label="Vista">
        <button onClick={onTogglePanels} title="Mostrar u ocultar paneles (H)">
          Paneles
        </button>
        {onFollow && (
          <button className={follow ? "on" : ""} onClick={onFollow} title="Cámara que sigue al objetivo">
            Seguir
          </button>
        )}
        {onGlossary && <button onClick={onGlossary}>Glosario</button>}
        <button onClick={onCredits}>Créditos</button>
        {onExit && <button onClick={onExit}>Menú</button>}
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

export function ResourcesPanel({ state, fuel_kg, dv_ms }: { state: SimState; fuel_kg?: number; dv_ms?: number }) {
  const r = state.resources;
  const margin = r.power_generated_w - r.power_consumed_w;
  return (
    <section className="panel resources" aria-labelledby="res-h">
      <h2 id="res-h">Recursos</h2>
      <table>
        <tbody>
          <Row label="Masa" value={formatNumber(r.mass_kg)} unit="kg" />
          <Row label="Potencia generada" value={formatNumber(r.power_generated_w)} unit="W" />
          <Row label="Potencia consumida" value={formatNumber(r.power_consumed_w)} unit="W" />
          <tr className={margin < 0 ? "neg" : ""}>
            <th scope="row">Margen</th>
            <td className="num">{(margin > 0 ? "+" : "") + formatNumber(margin)}</td>
            <td className="unit">W</td>
          </tr>
          {fuel_kg !== undefined && <Row label="Combustible" value={formatNumber(fuel_kg, 1)} unit="kg" />}
          {dv_ms !== undefined && <Row label="Δv disponible" value={formatNumber(dv_ms, 1)} unit="m/s" />}
          <Row label="Presupuesto" value={formatNumber(r.budget_usd_m)} unit="M USD" />
          <Row label="Datos almacenados" value={formatNumber(r.data_stored_mb, 1)} unit="MB" />
          <Row label="Enlace de bajada" value={formatNumber(r.downlink_rate_kbps)} unit="kbps" />
        </tbody>
      </table>
    </section>
  );
}

const KIND_LABEL: Record<SimEvent["kind"], string> = {
  info: "INFO",
  warning: "AVISO",
  failure: "FALLO",
  crisis: "CRISIS",
};

export function EventLog({ events }: { events: SimEvent[] }) {
  const recent = [...events].reverse().slice(0, 8);
  return (
    <section className="panel log" aria-labelledby="log-h">
      <h2 id="log-h">Registro de misión</h2>
      {recent.length === 0 ? (
        <p className="empty">Sin eventos.</p>
      ) : (
        <ol>
          {recent.map((e) => (
            <li key={e.id} className={`kind-${e.kind}`}>
              <span className="t">T+ {formatElapsed(e.at_s)}</span>
              <span className="k">{KIND_LABEL[e.kind]}</span>
              <span className="x">{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
