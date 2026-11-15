import { useEffect, useRef, useState } from "react";
import type { PlayerAction, SimState } from "@ikaros/contracts";
import { formatNumber } from "../../../ui/format";
import { tr } from "../../../i18n";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import { useFrameLoop, useHoldSpace, useKeys } from "../../../game/minigame";

const SCRAM_RESTART = 0.35;
const HTS_DROP = 0.12;
const HTS_BACK = 0.3;

/** Tiempo en marcha de los pilares y medidores de la consola; sobreviven a los retos que la ocultan. */
export interface PillarUptime {
  reactor_s: number;
  hts_s: number;
  total_s: number;
  temp: number;
  field: number;
}

export const freshUptime = (): PillarUptime => ({ reactor_s: 0, hts_s: 0, total_s: 0, temp: 0.3, field: 0.8 });

/**
 * ⚗ Consola de los pilares durante el paso por el Sol. El reactor se calienta más cuanto más
 * cerca está el Sol: C bombea refrigerante. El plasma debilita el campo HTS: Espacio mantenido lo
 * recarga. Si el reactor llega al tope hace SCRAM (sin energía) y si el campo cae el casco se
 * desgasta: las dos cosas pasan de verdad en el motor (set-system).
 */
export function PillarConsole({
  state,
  act,
  parker_rsun,
  running,
  uptime,
}: {
  state: SimState;
  act: (a: PlayerAction) => void;
  parker_rsun: number;
  running: boolean;
  uptime: React.MutableRefObject<PillarUptime>;
}) {
  const [temp, setTemp] = useState(uptime.current.temp);
  const [field, setField] = useState(uptime.current.field);
  const [pumpReady, setPumpReady] = useState(true);
  const t = useRef(uptime.current.temp);
  const f = useRef(uptime.current.field);
  const charging = useRef(false);
  const cooldown = useRef(0);
  const live = useRef(state);
  live.current = state;
  const actRef = useRef(act);
  actRef.current = act;

  const reactorOn = state.systems?.reactor !== false;
  const htsOn = state.systems?.hts !== false;

  useKeys(
    (k) => {
      if ((k === "c" || k === "C") && cooldown.current <= 0 && running) {
        t.current = Math.max(0, t.current - 0.32);
        uptime.current.temp = t.current;
        cooldown.current = 0.6;
        setTemp(t.current);
      }
      if ((k === "t" || k === "T") && running && live.current.attitude !== "antenna-to-earth")
        actRef.current({ type: "set-attitude", attitude: "antenna-to-earth" });
    },
    (k) => {
      if ((k === "t" || k === "T") && live.current.attitude === "antenna-to-earth")
        actRef.current({ type: "set-attitude", attitude: "shield-to-sun" });
    },
  );
  useHoldSpace((down) => (charging.current = down));

  useFrameLoop((dt) => {
    const s = live.current;
    const r = Math.max(0.004, s.distance_to_sun_au ?? 0.25);
    // Calor y plasma crecen al acercarse: a 0,25 AU es suave; en la zambullida, frenético.
    const heat = 0.035 + 0.05 * Math.min(6, 0.25 / r);
    const plasma = 0.03 + 0.045 * Math.min(6, 0.25 / r);
    const on = s.systems?.reactor !== false;
    t.current = Math.max(0, Math.min(1, t.current + (on ? heat : -0.25) * dt));
    f.current = Math.max(0, Math.min(1, f.current + (charging.current ? 0.55 : -plasma) * dt));
    cooldown.current = Math.max(0, cooldown.current - dt);
    setTemp(t.current);
    setField(f.current);
    setPumpReady(cooldown.current <= 0);

    if (on && t.current >= 1) actRef.current({ type: "set-system", system: "reactor", on: false });
    if (!on && t.current <= SCRAM_RESTART) actRef.current({ type: "set-system", system: "reactor", on: true });
    const hts = s.systems?.hts !== false;
    if (hts && f.current < HTS_DROP) actRef.current({ type: "set-system", system: "hts", on: false });
    if (!hts && f.current >= HTS_BACK) actRef.current({ type: "set-system", system: "hts", on: true });

    const u = uptime.current;
    u.temp = t.current;
    u.field = f.current;
    u.total_s += dt;
    if (on) u.reactor_s += dt;
    if (hts) u.hts_s += dt;
  }, running);

  // Al ocultarse la consola (por un reto) la sonda vuelve a poner el escudo hacia el Sol.
  useEffect(
    () => () => {
      if (live.current.attitude === "antenna-to-earth")
        actRef.current({ type: "set-attitude", attitude: "shield-to-sun" });
    },
    [],
  );

  const rsun = state.distance_to_sun_rsun ?? 0;
  const toRecord = Math.max(0, Math.min(1, (60 - rsun) / (60 - parker_rsun)));
  const record = rsun > 0 && rsun < parker_rsun;
  const hull = state.hull_durability_pct ?? 100;
  const battery = ((state.battery_wh ?? 0) / Math.max(1, state.battery_capacity_wh ?? 1)) * 100;
  const transmitting = state.attitude === "antenna-to-earth";

  return (
    <section className="pillars" aria-label={tr("Pilares de Ikaros", "Ikaros pillars")}>
      <header className="pillars-head">
        <span className="game-kicker">{tr("⚗ Los pilares de Ikaros", "⚗ The pillars of Ikaros")}</span>
        <div className={`record-meter${record ? " beaten" : ""}`}>
          <span>
            {record
              ? tr("¡Récord batido!", "Record beaten!")
              : tr("Hacia el récord de Parker", "Toward Parker's record")}
          </span>
          <div className="record-track">
            <div style={{ width: `${toRecord * 100}%` }} />
            <i style={{ left: "100%" }} />
          </div>
          <b className="num">
            {formatNumber(rsun, rsun < 10 ? 2 : 1)} R☉ · {formatNumber(state.speed_km_s ?? 0, 0)} km/s
          </b>
        </div>
      </header>

      <div className="pillar-grid">
        <div className={`pillar${!reactorOn ? " down" : temp > 0.8 ? " warn" : ""}`}>
          <h3>{tr("Mini reactor", "Mini reactor")}</h3>
          <div className="pillar-meter hot">
            <div style={{ height: `${temp * 100}%` }} />
            <i style={{ bottom: "100%" }} />
          </div>
          <p className="pillar-state">
            {reactorOn
              ? `${formatNumber(state.resources.power_generated_w)} W`
              : tr("SCRAM · enfriando", "SCRAM · cooling")}
          </p>
          <KeyHint keys={["C"]}>
            {pumpReady ? tr("bombear refrigerante", "pump coolant") : tr("recargando…", "recharging…")}
          </KeyHint>
        </div>

        <div className={`pillar${!htsOn ? " down" : field < 0.3 ? " warn" : ""}`}>
          <h3>{tr("Campo magnético HTS", "HTS magnetic field")}</h3>
          <div className="pillar-meter field">
            <div style={{ height: `${field * 100}%` }} />
            <i style={{ bottom: `${HTS_DROP * 100}%` }} />
          </div>
          <p className="pillar-state">{htsOn ? tr("Desviando plasma", "Deflecting plasma") : tr("¡Caído!", "Down!")}</p>
          <KeyHint keys={[tr("Espacio", "Space")]}>{tr("recargar (mantén)", "recharge (hold)")}</KeyHint>
        </div>

        <div className={`pillar${hull < 60 ? " warn" : ""}`}>
          <h3>{tr("Nanobots", "Nanobots")}</h3>
          <div className="pillar-meter hull">
            <div style={{ height: `${hull}%` }} />
          </div>
          <p className="pillar-state">
            {tr("Casco", "Hull")} {formatNumber(hull, 1)} % · {tr("reserva", "reserve")}{" "}
            {formatNumber(state.nanobot_reserve_pct ?? 0)} %
          </p>
          <span className="key-hint">
            {tr("Reparan solos; si hay grietas, te avisan", "Self-repairing; you'll be called on cracks")}
          </span>
        </div>
      </div>

      <footer className="pillars-foot">
        <span>
          {tr("Batería", "Battery")} <b className="num">{formatNumber(battery)} %</b>
        </span>
        <span>
          {tr("Memoria", "Memory")} <b className="num">{formatNumber(state.resources.data_stored_mb)} MB</b>
        </span>
        <KeyHints>
          <KeyHint keys={["T"]}>
            {transmitting
              ? tr("transmitiendo…", "transmitting…")
              : tr("transmitir datos (mantén)", "transmit data (hold)")}
          </KeyHint>
          <KeyHint keys={["P"]}>{tr("pausa", "pause")}</KeyHint>
        </KeyHints>
      </footer>
    </section>
  );
}
