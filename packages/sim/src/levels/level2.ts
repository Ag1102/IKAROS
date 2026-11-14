import type { MissionReport, PlayerAction, SimState } from "@ikaros/contracts";
import { C } from "../data";
import { eclipseFraction, orbitalPeriod } from "../physics";
import { clamp, Level, round } from "./base";

/** Nivel 2 (mínimo): diseño con chequeo de lanzador y 3 días de operación en LEO. */
export class Level2 extends Level {
  private dataCollected = 0;
  private dataLost = 0;
  private failedComponent: string | null = null;
  private failureAt: number | null = null;
  private brownout_s = 0;
  private failureReason: string | null = null;

  constructor(seed: number) {
    super("level2-leo", seed);
  }

  protected initialState(): SimState {
    const s: SimState = {
      scenario: "level2-leo",
      resources: {
        mass_kg: this.param("bus_mass_kg"),
        power_generated_w: 0,
        power_consumed_w: -this.param("bus_power_w"),
        budget_usd_m: this.param("budget_usd_m"),
        data_stored_mb: 0,
        downlink_rate_kbps: 0,
        mission_elapsed_s: 0,
      },
      health: "nominal",
      phase: "hangar",
      events: [],
      selected: {},
      budget_remaining_usd_m: this.param("budget_usd_m"),
      data_downlinked_mb: 0,
    };
    this.state = s;
    this.info(this.def.subtitle, "info", "level2:start");
    return s;
  }

  private id(slot: string): string {
    return this.state.selected?.[slot] ?? "";
  }

  private capacity(): number | undefined {
    const lv = this.id("launcher");
    if (!lv) return undefined;
    const base = this.param(`lv_capacity_${lv}_kg`);
    return this.id("orbit") === "orb-sso" ? base * this.param("sso_capacity_factor") : base;
  }

  protected onSelectionChanged(): void {
    const s = this.state;
    const parts = this.chosenAll();
    s.resources.mass_kg = this.param("bus_mass_kg") + parts.reduce((m, c) => m + c.mass_kg, 0);
    const cost = parts.reduce((m, c) => m + c.cost_usd_m, 0);
    s.budget_remaining_usd_m = round(this.param("budget_usd_m") - cost, 2);
    s.resources.power_generated_w = parts.filter((c) => c.power_w > 0).reduce((m, c) => m + c.power_w, 0);
    s.resources.power_consumed_w = -this.param("bus_power_w") - parts.filter((c) => c.power_w < 0).reduce((m, c) => m + c.power_w, 0);
    const cap = this.capacity();
    if (cap !== undefined) s.mass_capacity_kg = round(cap, 1);
    const orbit = this.id("orbit");
    if (orbit) {
      s.altitude_km = this.param(`altitude_${orbit}_km`);
      s.inclination_deg = this.param(`inclination_${orbit}_deg`);
    }
    const bat = this.id("battery");
    if (bat) {
      s.battery_capacity_wh = this.param(`battery_capacity_${bat}_wh`);
      s.battery_wh = s.battery_capacity_wh;
    }
  }

  protected onAction(action: PlayerAction): void {
    if (action.type !== "launch" || this.state.phase !== "hangar") return;
    const problems = this.missingRequired();
    const cap = this.capacity();
    if (cap !== undefined && this.state.resources.mass_kg > cap) {
      problems.push(`El satélite pesa ${this.state.resources.mass_kg} kg y el lanzador lleva ${round(cap)} kg a esa órbita.`);
    }
    if ((this.state.budget_remaining_usd_m ?? 0) < 0) problems.push("El diseño supera el presupuesto.");
    if (problems.length) {
      for (const p of problems) this.info(`Lanzamiento bloqueado: ${p}`, "warning", "level2:launch-blocked");
      return;
    }
    this.state.phase = "operations";
    this.info("Lanzamiento y separación. Comienza la operación.", "info", "level2:launch");
    if (this.id("objective") === "obj-fires" && this.id("orbit") !== "orb-sso") {
      this.info("Una órbita ecuatorial no ve los bosques boreales: la cobertura será parcial.", "warning", "level2:coverage");
    }
    if (this.rng() < this.param("failure_probability")) {
      this.failureAt = this.rng() * this.param("mission_duration_s");
      this.failedComponent = this.rng() < 0.5 ? "comms" : "power";
    }
  }

  protected tick(dt: number): void {
    const s = this.state;
    if (s.phase !== "operations") return;
    const t = this.t;
    const alt = s.altitude_km ?? 500;
    const period = orbitalPeriod(C.muEarth, C.earthRadius + alt);
    const inEclipse = (t % period) / period > 1 - eclipseFraction(alt);

    if (this.failureAt !== null && t >= this.failureAt && this.failedComponent) {
      this.info(
        this.failedComponent === "comms" ? "Falla de la radio: el enlace baja a la mitad." : "Falla de un panel: la potencia baja a la mitad.",
        "failure",
        `level2:failure-${this.failedComponent}`,
      );
      this.failureAt = null;
    }
    const halfPower = this.failedComponent === "power" && this.failureAt === null;
    const halfComms = this.failedComponent === "comms" && this.failureAt === null;

    const gen = inEclipse ? 0 : s.resources.power_generated_w * (halfPower ? 0.5 : 1);
    const load = s.resources.power_consumed_w;
    const cap = s.battery_capacity_wh ?? 0;
    s.battery_wh = round(clamp((s.battery_wh ?? 0) + ((gen - load) * dt) / 3600, 0, cap), 2);
    const powered = (s.battery_wh ?? 0) > 0 || gen >= load;
    if (!powered) {
      this.brownout_s += dt;
      this.warnOnce("brownout", "Batería agotada en eclipse: instrumento apagado.", 3600, "level2:brownout");
    } else {
      this.brownout_s = 0;
    }

    if (powered) {
      const rate = this.param(`data_rate_${this.id("instrument")}_mb_s`);
      const room = this.param("storage_mb") - s.resources.data_stored_mb;
      const got = rate * dt;
      if (got > room) {
        this.dataLost += got - Math.max(room, 0);
        this.warnOnce("storage", "Memoria llena: se pierden datos hasta el próximo pase.", 7200, "level2:storage-full");
      }
      s.resources.data_stored_mb += Math.max(0, Math.min(room, got));
      this.dataCollected += Math.max(0, Math.min(room, got));
    }

    const orbit = this.id("orbit");
    const passes = this.param(`passes_per_day_${orbit}`);
    const passEvery = 86_400 / passes;
    const window = t % passEvery < this.param("pass_duration_s");
    s.comm_window_open = window;
    const kbps = this.param(`downlink_${this.id("comms")}_kbps`) * (halfComms ? 0.5 : 1);
    s.resources.downlink_rate_kbps = window && powered ? kbps : 0;
    if (window && powered) {
      const sent = Math.min(s.resources.data_stored_mb, (kbps / 8000) * dt);
      s.resources.data_stored_mb -= sent;
      s.data_downlinked_mb = round((s.data_downlinked_mb ?? 0) + sent, 2);
    }
    s.resources.data_stored_mb = round(s.resources.data_stored_mb, 3);
    s.health = this.brownout_s > 0 ? "critical" : this.failedComponent && this.failureAt === null ? "warning" : "nominal";

    if (t >= this.param("mission_duration_s")) {
      this.info("Fin de la campaña de 3 días.", "info", "level2:complete");
      this.finish();
    }
  }

  private coverageFactor(): number {
    return this.id("objective") === "obj-fires" && this.id("orbit") !== "orb-sso" ? 0.4 : 1;
  }

  report(): MissionReport {
    const s = this.state;
    const goal = this.param("data_goal_mb");
    const useful = (s.data_downlinked_mb ?? 0) * this.coverageFactor();
    const launched = s.phase !== "hangar";
    const outcome: MissionReport["outcome"] = !launched || this.failureReason ? "failure" : useful >= goal ? "success" : useful > 0 ? "partial" : "failure";
    const causes: MissionReport["causes"] = [];
    if (!launched) causes.push({ text: "El satélite no se lanzó.", segment: "launch", origin: "theoretical" });
    if (this.coverageFactor() < 1) {
      causes.push({ text: "La órbita ecuatorial no cubre las latitudes con incendios boreales.", source: this.paramSource("inclination_orb-sso_deg"), segment: "space", origin: "real" });
    }
    if (this.dataLost > 0) causes.push({ text: `Se perdieron ${Math.round(this.dataLost)} MB por memoria llena.`, segment: "ground", origin: "theoretical" });
    if (this.failedComponent) causes.push({ text: `Falla en ${this.failedComponent === "comms" ? "comunicaciones" : "potencia"} durante la operación.`, segment: "space", origin: "theoretical" });
    causes.push({ text: `Datos útiles en tierra: ${Math.round(useful)} MB de ${goal} MB.`, segment: "user", origin: "theoretical" });
    return {
      scenario: "level2-leo",
      outcome,
      score: Math.round(Math.min(1, useful / goal) * 6000 + (s.budget_remaining_usd_m ?? 0) * 10),
      causes,
      advice: this.dataLost > 0 ? ["Un enlace más rápido o una órbita con más pases evita perder datos."] : [],
      metrics: {
        data_collected_mb: Math.round(this.dataCollected),
        data_downlinked_mb: Math.round(s.data_downlinked_mb ?? 0),
        data_lost_mb: Math.round(this.dataLost),
        coverage_factor: this.coverageFactor(),
        mission_elapsed_s: Math.round(this.t),
      },
      comparisons: [],
    };
  }
}
