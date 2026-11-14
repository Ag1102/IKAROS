import type { SimEvent } from "@ikaros/contracts";
import { AU_KM, helioAt, orbitFromApsides, timeFromPerihelion, type HelioOrbit } from "../sim/kepler";
import { CELL_LIMIT_C, D_START_AU, MIN_POWER_W, RSUN_KM } from "./constants";
import { scienceBonus } from "./trajectory";
import { formatNumber } from "../ui/format";

// Simulación de PRUEBA del encuentro solar, solo para mover la interfaz; la física definitiva
// la aporta el motor de simulación (packages/sim). La sonda sigue una órbita kepleriana real
// alrededor del Sol; el encuentro va desde que entra en 0,25 AU (la matriz principal se pliega)
// hasta que vuelve a salir. La relación térmica de las celdas es simplificada y provisional, y
// los efectos de los sistemas ⚗ son supuestos del juego.

export { CELL_LIMIT_C, D_START_AU, MIN_POWER_W, RSUN_KM };
export const DAY_S = 86400;
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
  perihelion_au: number;
  aphelion_au: number;
}

export type EncounterOutcome = "success" | "partial" | "failure";

export class Encounter {
  /** Segundos de misión desde que la sonda entra en 0,25 AU. */
  t = 0;
  exposed = 1;
  damage = 0;
  belowMin_s = 0;
  maxTemp_c = 0;
  events: SimEvent[] = [];
  outcome: EncounterOutcome | null = null;
  score = 0;
  readonly orbit: HelioOrbit;
  /** Días entre la entrada en 0,25 AU y el perihelio. */
  readonly halfDays: number;
  private flags = new Set<string>();

  constructor(readonly cfg: EncounterConfig) {
    this.orbit = orbitFromApsides(cfg.perihelion_au, cfg.aphelion_au);
    this.halfDays = timeFromPerihelion(this.orbit, D_START_AU);
    this.log("info", "Matriz principal plegada tras el escudo a 0,25 AU. Entra en servicio la matriz secundaria.");
  }

  get durationS() {
    return 2 * this.halfDays * DAY_S;
  }
  /** Días respecto al perihelio (negativo antes, positivo después). */
  get dayFromPerihelion() {
    return this.t / DAY_S - this.halfDays;
  }
  get position() {
    return helioAt(this.orbit, this.dayFromPerihelion);
  }
  get distanceAU() {
    return this.position.r;
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
    if (this.distanceAU < this.cfg.perihelion_au * 1.15) return "Perihelio";
    return this.dayFromPerihelion < 0 ? "Aproximación" : "Salida";
  }

  setExposed(v: number) {
    this.exposed = Math.max(0, Math.min(1, v));
  }

  step(dt: number) {
    if (this.outcome) return;
    const before = this.dayFromPerihelion;
    this.t = Math.min(this.t + dt, this.durationS);
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
      this.once("low", "warning", `Potencia por debajo de lo requerido (${formatNumber(this.requiredW)} W).`);
    }
    if (this.damage >= 100) this.once("dead", "failure", "La matriz secundaria quedó inutilizada.");
    if (before < 0 && this.dayFromPerihelion >= 0) {
      const rs = (this.cfg.perihelion_au * AU_KM) / RSUN_KM;
      this.once("peri", "info", `Perihelio: ${formatNumber(rs, 1)} radios solares.`);
    }
    if (this.t >= this.durationS) this.finish();
  }

  private finish() {
    const frac = this.belowMin_s / this.durationS;
    this.outcome =
      this.damage >= 100 || frac > 0.5 ? "failure" : this.damage < 30 && frac < 0.1 ? "success" : "partial";
    const extra =
      this.outcome === "failure" ? 0 : scienceBonus(this.cfg.perihelion_au) + (this.cfg.hasCapsule ? 100 : 0);
    this.score = Math.max(0, Math.round(1000 - this.damage * 6 - frac * 600)) + extra;
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
