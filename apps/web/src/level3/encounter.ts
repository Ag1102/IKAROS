import type { SimEvent } from "@ikaros/contracts";

// Simulación de PRUEBA del encuentro solar, solo para mover la interfaz. La física real la
// define Camilo en packages/sim. Usa constantes del paper (9,5 R☉, 0,25 AU, 482 W, 120 °C,
// intensidad ∝ 1/d²) y una relación térmica simplificada y provisional. Los efectos de los
// sistemas ⚗ son supuestos del juego.

export const AU_KM = 149597870.7;
export const RSUN_KM = 696000;
export const D_START_AU = 0.25;
export const D_MIN_RSUN = 9.5;
export const D_MIN_AU = (D_MIN_RSUN * RSUN_KM) / AU_KM;
export const CELL_LIMIT_C = 120;
export const MIN_POWER_W = 482;
/** Duración (s de misión) de cada tramo, aproximación y salida. Comprimida respecto al real. */
export const LEG_S = 21600;
/** Intensidad (× AM0) a la que la matriz completa produce su carga de diseño. */
const DESIGN_SUNS = 16;

export interface EncounterConfig {
  hasSecondary: boolean;
  hasReactor: boolean;
  hasStirling: boolean;
  liquidShield: boolean;
  /** Sistemas teóricos (⚗). Solo actúan si hay potencia suficiente. */
  hasHts: boolean;
  hasNano: boolean;
  hasCapsule: boolean;
  /** Consumo de los sistemas adicionales, W. */
  extraUse_w: number;
}

export type EncounterOutcome = "success" | "partial" | "failure";

export class Encounter {
  t = 0;
  exposed = 1;
  damage = 0;
  belowMin_s = 0;
  maxTemp_c = 0;
  events: SimEvent[] = [];
  outcome: EncounterOutcome | null = null;
  score = 0;
  private flags = new Set<string>();

  constructor(readonly cfg: EncounterConfig) {
    this.log("info", "Matriz principal plegada tras el escudo. Entra en servicio la matriz secundaria.");
  }

  get s() {
    return Math.min(2, this.t / LEG_S);
  }
  get distanceAU() {
    return D_MIN_AU + (D_START_AU - D_MIN_AU) * (1 - this.s) ** 2;
  }
  get distanceKm() {
    return this.distanceAU * AU_KM;
  }
  get distanceRsun() {
    return this.distanceKm / RSUN_KM;
  }
  /** Intensidad solar en múltiplos de AM0 (1367 W/m²). */
  get suns() {
    return 1 / this.distanceAU ** 2;
  }
  get requiredW() {
    return MIN_POWER_W + this.cfg.extraUse_w;
  }
  /** Los sistemas adicionales solo funcionan si la potencia cubre su consumo. */
  get extrasOn() {
    return this.powerW >= this.requiredW;
  }
  /** Carga sobre la matriz expuesta, relativa a la de diseño (1 = 16 × AM0 con la matriz completa). */
  get heatLoad() {
    return (this.suns * this.exposed) / DESIGN_SUNS;
  }
  /** El campo HTS (⚗), si tiene potencia, reduce un 10 % la carga térmica que llega a las celdas. */
  get thermalLoad() {
    return this.cfg.hasHts && this.extrasOn ? this.heatLoad * 0.9 : this.heatLoad;
  }
  get cellTemp_c() {
    return 40 + 80 * this.thermalLoad - (this.cfg.liquidShield ? 10 : 0);
  }
  get powerW() {
    // Margen de diseño provisional: 550 W con la carga térmica de diseño (el paper exige ≥ 482 W).
    const sec = this.cfg.hasSecondary && this.damage < 100 ? 550 * Math.min(this.heatLoad, 1.1) : 0;
    const alt = this.cfg.hasReactor ? 450000 : this.cfg.hasStirling ? 482 : 0;
    return sec + alt;
  }
  get phase(): string {
    if (this.outcome) return "Informe";
    if (Math.abs(this.s - 1) < 0.06) return "Perihelio";
    return this.s < 1 ? "Aproximación" : "Salida";
  }

  setExposed(v: number) {
    this.exposed = Math.max(0, Math.min(1, v));
  }

  step(dt: number) {
    if (this.outcome) return;
    this.t = Math.min(this.t + dt, 2 * LEG_S);
    const T = this.cellTemp_c;
    if (this.cfg.hasSecondary) this.maxTemp_c = Math.max(this.maxTemp_c, T);
    if (this.cfg.hasSecondary && T > CELL_LIMIT_C) {
      this.damage = Math.min(100, this.damage + ((T - CELL_LIMIT_C) * 0.5 * dt) / 3600);
      this.once("hot", "warning", "Celdas por encima de 120 °C: degradación irreversible. Retrae la matriz.");
    }
    if (this.cfg.hasNano && this.extrasOn && this.damage > 0 && this.damage < 100) {
      this.damage = Math.max(0, this.damage - (3 * dt) / 3600);
    }
    if (this.powerW < this.requiredW) {
      this.belowMin_s += dt;
      this.once("low", "warning", `Potencia por debajo de lo requerido (${Math.round(this.requiredW)} W).`);
    }
    if (this.damage >= 100) this.once("dead", "failure", "La matriz secundaria quedó inutilizada.");
    if (this.s >= 0.97 && this.s <= 1.03) this.once("peri", "info", "Perihelio: 9,5 radios solares.");
    if (this.t >= 2 * LEG_S) this.finish();
  }

  private finish() {
    const frac = this.belowMin_s / (2 * LEG_S);
    this.outcome =
      this.damage >= 100 || frac > 0.5 ? "failure" : this.damage < 30 && frac < 0.1 ? "success" : "partial";
    const samples = this.cfg.hasCapsule && this.outcome !== "failure" ? 100 : 0;
    this.score = Math.max(0, Math.round(1000 - this.damage * 6 - frac * 600)) + samples;
    this.log(this.outcome === "failure" ? "failure" : "info", "Fin del encuentro solar.");
  }

  private once(key: string, kind: SimEvent["kind"], text: string) {
    if (this.flags.has(key)) return;
    this.flags.add(key);
    this.log(kind, text);
  }

  private log(kind: SimEvent["kind"], text: string) {
    this.events = [...this.events, { id: `e3-${this.events.length}`, at_s: this.t, kind, text }];
  }
}
