import type { MissionReport, PlayerAction, ScenarioId, SimEvent, SimState, Simulation } from "@ikaros/contracts";
import { EARTH_RADIUS_KM, MU_EARTH_KM3_S2 as MU } from "../sim/orbit";
import { formatNumber } from "../ui/format";

// Nivel 1: servicio en órbita. Lógica del nivel mientras el motor real (packages/sim)
// no exista. Implementa el contrato Simulation y añade `view()` para la interfaz.
// Los parámetros de la nave (masa, combustible, Isp, herramientas) son supuestos del juego.

const G0 = 9.80665; // m/s²
const TWO_PI = Math.PI * 2;

// Órbita del objetivo: 28,5° es la inclinación del Hubble; 540 km es una altura de referencia
// del juego (la del Hubble real cambia con el tiempo). Ambos valores deben pasar a data/.
export const PARAMS = {
  startAlt_km: 400,
  targetAlt_km: 540,
  inclination_deg: 28.5,
  dryMass_kg: 2400,
  propellant_kg: 100,
  isp_s: 300,
  payloadCap_kg: 200,
  commWindow_s: 600,
  repairFast_s: 480,
  repairSlow_s: 720,
  tolAlt_km: 6,
  tolGap_km: 30,
  maxBurn_ms: 120,
};

export interface Tool {
  id: string;
  name: string;
  mass_kg: number;
  note: string;
}

export const TOOLS: Tool[] = [
  { id: "solar-panel", name: "Panel solar de reemplazo", mass_kg: 110, note: "Restituye la generación del panel B." },
  { id: "antenna", name: "Módulo de antena", mass_kg: 55, note: "Sustituye la antena de alta ganancia." },
  { id: "toolkit", name: "Kit de herramientas EVA", mass_kg: 25, note: "Reduce el trabajo de 720 s a 480 s." },
  { id: "battery", name: "Batería de repuesto", mass_kg: 70, note: "Opcional. Más autonomía, pero pesa." },
];

export type Phase = "briefing" | "burn1" | "coast" | "burn2" | "toolkit" | "repair" | "result";

/** Órbita en el plano: periapsis en el ángulo w; tp es el instante de paso por el periapsis. */
export interface Orbit {
  a: number;
  e: number;
  w: number;
  tp: number;
}

const R1 = EARTH_RADIUS_KM + PARAMS.startAlt_km;
const R2 = EARTH_RADIUS_KM + PARAMS.targetAlt_km;
const N2 = Math.sqrt(MU / R2 ** 3);
const T_HALF = Math.PI * Math.sqrt(((R1 + R2) / 2) ** 3 / MU);
// El objetivo parte en la posición que permite el encuentro con la transferencia ideal.
const THETA0 = Math.PI - N2 * T_HALF;

const wrap = (x: number) => ((((x + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
const circularSpeed = (r: number) => Math.sqrt(MU / r);

export function orbitAt(o: Orbit, t: number) {
  const n = Math.sqrt(MU / o.a ** 3);
  let M = (n * (t - o.tp)) % TWO_PI;
  if (M < 0) M += TWO_PI;
  let E = o.e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    E -= (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E));
  }
  const nu = 2 * Math.atan2(Math.sqrt(1 + o.e) * Math.sin(E / 2), Math.sqrt(1 - o.e) * Math.cos(E / 2));
  const r = o.a * (1 - o.e * Math.cos(E));
  const angle = o.w + nu;
  return { r, angle, x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

/** Órbita resultante de una quema tangencial en el radio r, ángulo theta, instante tb. */
export function orbitAfterBurn(r: number, theta: number, vBefore_kms: number, dv_ms: number, tb: number): Orbit {
  const v = vBefore_kms + dv_ms / 1000;
  const a = 1 / (2 / r - (v * v) / MU);
  const ratio = r / a - 1;
  const e = Math.abs(ratio);
  const n = Math.sqrt(MU / a ** 3);
  return ratio <= 0 ? { a, e, w: theta, tp: tb } : { a, e, w: theta + Math.PI, tp: tb - Math.PI / n };
}

export const apoAlt = (o: Orbit) => o.a * (1 + o.e) - EARTH_RADIUS_KM;
export const periAlt = (o: Orbit) => o.a * (1 - o.e) - EARTH_RADIUS_KM;

export function previewBurn1(dv_ms: number): Orbit {
  return orbitAfterBurn(R1, 0, circularSpeed(R1), dv_ms, 0);
}

export interface Level1View {
  phase: Phase;
  t: number;
  propellant_kg: number;
  dvLeft_ms: number;
  servicer: Orbit;
  tArrival: number | null;
  tools: string[];
  toolMass_kg: number;
  repairDuration_s: number;
  repairStart_s: number;
  repairEnd_s: number;
  outcome: "success" | "failure" | null;
  /** El vehículo llegó al objetivo (fase de carga en adelante). */
  docked: boolean;
}

const PHASE_LABEL: Record<Phase, string> = {
  briefing: "Briefing",
  burn1: "Quema 1",
  coast: "Tránsito",
  burn2: "Quema 2",
  toolkit: "Herramientas",
  repair: "Reparación",
  result: "Informe",
};

export class Level1 implements Simulation {
  private phase: Phase = "briefing";
  private t = 0;
  private events: SimEvent[] = [];
  private servicer: Orbit = { a: R1, e: 0, w: 0, tp: 0 };
  private propellant = PARAMS.propellant_kg;
  private tools = new Set<string>();
  private repairStart = 0;
  private repairEnd = 0;
  private outcome: "success" | "failure" | null = null;
  private docked = false;
  private causes: { text: string; source?: string }[] = [];
  private score = 0;
  private metrics: Record<string, number | string | boolean> = {};

  load(_scenario?: ScenarioId, _seed?: number): SimState {
    this.phase = "briefing";
    this.t = 0;
    this.events = [];
    this.servicer = { a: R1, e: 0, w: 0, tp: 0 };
    this.propellant = PARAMS.propellant_kg;
    this.tools = new Set();
    this.repairStart = 0;
    this.repairEnd = 0;
    this.outcome = null;
    this.docked = false;
    this.causes = [];
    this.score = 0;
    this.metrics = {};
    this.log("info", "Vehículo de servicio en órbita circular de 400 km. Sistemas nominales.");
    return this.state();
  }

  step(dt_s: number): SimState {
    if (this.phase === "coast") {
      const tArr = this.tArrival();
      this.t += dt_s;
      if (tArr !== null && this.t >= tArr) {
        this.t = tArr;
        this.phase = "burn2";
        this.log("info", "Llegada al apogeo. Preparar la segunda quema para circularizar.");
      }
    } else if (this.phase === "repair") {
      this.t += dt_s;
      if (this.t >= this.repairEnd) {
        this.t = this.repairEnd;
        this.finishRepair();
      }
    }
    return this.state();
  }

  act(action: PlayerAction): SimState {
    if (action.type === "resolve-event") {
      if (action.eventId === "briefing" && this.phase === "briefing") {
        this.phase = "burn1";
      } else if (action.eventId === "start-repair") {
        this.startRepair();
      } else if (action.eventId === "restart") {
        this.load();
      }
    } else if (action.type === "burn") {
      if (this.phase === "burn1") this.burn1(action.delta_v_m_s);
      else if (this.phase === "burn2") this.burn2(action.delta_v_m_s);
    } else if (action.type === "select-component" && this.phase === "toolkit") {
      if (this.tools.has(action.componentId)) this.tools.delete(action.componentId);
      else this.tools.add(action.componentId);
    }
    return this.state();
  }

  report(): MissionReport {
    return {
      scenario: "level1-repair",
      outcome: this.outcome === "success" ? "success" : "failure",
      score: this.score,
      causes: this.causes,
      metrics: this.metrics,
    };
  }

  /** Posiciones en el plano orbital (km) para la escena. */
  positions() {
    const s = orbitAt(this.servicer, this.t);
    const target = THETA0 + N2 * this.t;
    return {
      servicer: { x: s.x, y: s.y },
      target: { x: R2 * Math.cos(target), y: R2 * Math.sin(target) },
    };
  }

  /** Órbita resultante de una segunda quema, calculada en el punto actual. */
  previewBurn2(dv_ms: number): Orbit {
    const p = orbitAt(this.servicer, this.t);
    const v = Math.sqrt(MU * (2 / p.r - 1 / this.servicer.a));
    return orbitAfterBurn(p.r, p.angle, v, dv_ms, this.t);
  }

  view(): Level1View {
    const duration = this.tools.has("toolkit") ? PARAMS.repairFast_s : PARAMS.repairSlow_s;
    return {
      phase: this.phase,
      t: this.t,
      propellant_kg: this.propellant,
      dvLeft_ms: this.dvLeft(),
      servicer: this.servicer,
      tArrival: this.tArrival(),
      tools: [...this.tools],
      toolMass_kg: this.toolMass(),
      repairDuration_s: duration,
      repairStart_s: this.repairStart,
      repairEnd_s: this.repairEnd,
      outcome: this.outcome,
      docked: this.docked,
    };
  }

  private dvLeft(): number {
    const m0 = PARAMS.dryMass_kg + this.propellant;
    return PARAMS.isp_s * G0 * Math.log(m0 / PARAMS.dryMass_kg);
  }

  private toolMass(): number {
    return TOOLS.filter((x) => this.tools.has(x.id)).reduce((s, x) => s + x.mass_kg, 0);
  }

  private tArrival(): number | null {
    if (this.phase !== "coast") return null;
    const n = Math.sqrt(MU / this.servicer.a ** 3);
    return this.servicer.tp + Math.PI / n;
  }

  private spend(dv_ms: number): number {
    const dv = Math.max(0, Math.min(dv_ms, this.dvLeft()));
    const m0 = PARAMS.dryMass_kg + this.propellant;
    this.propellant -= m0 * (1 - Math.exp(-dv / (PARAMS.isp_s * G0)));
    return dv;
  }

  private burn1(dv_ms: number) {
    if (dv_ms < 1) {
      this.log("warning", "Quema 1 cancelada: Δv demasiado bajo para salir de la órbita circular.");
      return;
    }
    const dv = this.spend(dv_ms);
    this.servicer = orbitAfterBurn(R1, 0, circularSpeed(R1), dv, this.t);
    this.metrics.burn1_dv_ms = Number(dv.toFixed(1));
    this.log(
      "info",
      `Quema 1 ejecutada: Δv ${formatNumber(dv, 1)} m/s. Apogeo resultante ${formatNumber(apoAlt(this.servicer), 0)} km.`,
    );
    this.phase = "coast";
  }

  private burn2(dv_ms: number) {
    const dv = this.spend(dv_ms);
    this.servicer = this.previewBurn2(dv);
    this.metrics.burn2_dv_ms = Number(dv.toFixed(1));
    const rp = periAlt(this.servicer);
    const ra = apoAlt(this.servicer);
    this.log(
      "info",
      `Quema 2 ejecutada: Δv ${formatNumber(dv, 1)} m/s. Órbita final ${formatNumber(rp, 0)} × ${formatNumber(ra, 0)} km.`,
    );

    const tol = PARAMS.tolAlt_km;
    const target = PARAMS.targetAlt_km;
    const altOk = Math.abs(rp - target) <= tol && Math.abs(ra - target) <= tol;
    const pos = this.positions();
    const sAngle = Math.atan2(pos.servicer.y, pos.servicer.x);
    const gap = R2 * Math.abs(wrap(THETA0 + N2 * this.t - sAngle));
    const gapOk = gap <= PARAMS.tolGap_km;
    this.metrics.final_periapsis_km = Number(rp.toFixed(1));
    this.metrics.final_apoapsis_km = Number(ra.toFixed(1));
    this.metrics.gap_km = Number(gap.toFixed(1));

    if (altOk && gapOk) {
      this.docked = true;
      this.phase = "toolkit";
      this.log("info", `Encuentro logrado. Distancia al objetivo: ${formatNumber(gap, 0)} km. Cargar herramientas.`);
      return;
    }
    this.causes = [];
    if (!altOk) {
      this.causes.push({
        text: `La órbita final (${formatNumber(rp, 0)} × ${formatNumber(ra, 0)} km) no coincide con la del objetivo (${target} km ±${tol} km).`,
        source: "Transferencia de Hohmann: dos quemas tangenciales; ecuación vis-viva.",
      });
    }
    if (!gapOk) {
      this.causes.push({
        text: `El vehículo llegó ${formatNumber(gap, 0)} km lejos del objetivo; el máximo para acercarse es ${PARAMS.tolGap_km} km.`,
        source: "El tiempo de tránsito depende del semieje mayor de la transferencia.",
      });
    }
    this.finish("failure", 250, "Encuentro fallido");
  }

  private startRepair() {
    if (this.phase !== "toolkit") return;
    if (this.toolMass() > PARAMS.payloadCap_kg) return;
    this.repairStart = this.t;
    const duration = this.tools.has("toolkit") ? PARAMS.repairFast_s : PARAMS.repairSlow_s;
    this.repairEnd = this.t + Math.min(duration, PARAMS.commWindow_s);
    this.phase = "repair";
    this.log("info", "Reparación iniciada dentro de la ventana de comunicación.");
  }

  private finishRepair() {
    const hasPanel = this.tools.has("solar-panel");
    const hasAntenna = this.tools.has("antenna");
    const duration = this.tools.has("toolkit") ? PARAMS.repairFast_s : PARAMS.repairSlow_s;
    this.causes = [];
    if (!hasPanel) this.causes.push({ text: "No se cargó el panel solar de reemplazo; el panel B sigue perdido." });
    if (!hasAntenna) this.causes.push({ text: "No se cargó el módulo de antena; la antena sigue sin responder." });
    if (duration > PARAMS.commWindow_s) {
      this.causes.push({
        text: `Sin el kit de herramientas el trabajo dura ${duration} s y la ventana de comunicación solo ${PARAMS.commWindow_s} s.`,
      });
    }
    if (this.causes.length === 0) {
      const left = this.propellant;
      this.causes.push(
        { text: "Encuentro con el objetivo en una transferencia de dos quemas.", source: "Transferencia de Hohmann." },
        { text: `Carga útil de ${this.toolMass()} kg dentro del límite de ${PARAMS.payloadCap_kg} kg.` },
        { text: `Reparación terminada en ${duration} s, dentro de la ventana de ${PARAMS.commWindow_s} s.` },
        { text: `Combustible restante: ${formatNumber(left, 1)} kg.`, source: "Ecuación del cohete de Tsiolkovsky." },
      );
      this.finish(
        "success",
        600 + Math.round(left * 8) + Math.round((PARAMS.commWindow_s - duration) / 2),
        "Satélite reparado",
      );
    } else {
      this.finish("failure", 300, "Reparación incompleta");
    }
  }

  private finish(outcome: "success" | "failure", score: number, text: string) {
    this.outcome = outcome;
    this.score = score;
    this.phase = "result";
    this.metrics.propellant_left_kg = Number(this.propellant.toFixed(1));
    this.log(outcome === "success" ? "info" : "failure", text + ".");
  }

  private log(kind: SimEvent["kind"], text: string) {
    this.events = [...this.events, { id: `ev-${this.events.length}`, at_s: this.t, kind, text }];
  }

  private state(): SimState {
    const critical = this.outcome === "failure";
    const toolMass =
      this.phase === "toolkit" || this.phase === "repair" || this.phase === "result" ? this.toolMass() : 0;
    return {
      scenario: "level1-repair",
      resources: {
        mass_kg: PARAMS.dryMass_kg + this.propellant + toolMass,
        power_generated_w: 1800,
        power_consumed_w: 900,
        budget_usd_m: 120,
        data_stored_mb: 0,
        downlink_rate_kbps: 512,
        mission_elapsed_s: this.t,
      },
      health: critical ? "critical" : this.propellant < 15 ? "warning" : "nominal",
      phase: PHASE_LABEL[this.phase],
      events: this.events,
    };
  }
}

export const LEVEL1_GEOMETRY = { R1, R2, inclination_deg: PARAMS.inclination_deg };
