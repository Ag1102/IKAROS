import type { MissionReport, PlayerAction, SimState } from "@ikaros/contracts";
import { C, missions, sourceOf, value } from "../data";
import { hohmannDeltaV, hohmannTarget, hohmannTime, propellantFor, rocketDeltaV } from "../physics";
import { Level, round } from "./base";

interface Transfer {
  from_km: number;
  to_km: number;
  start_s: number;
  end_s: number;
}

const TASKS = [
  { id: "panel", label: "panel solar", needs: ["panel", "toolkit"] },
  { id: "antenna", label: "antena", needs: ["antenna", "toolkit"] },
] as const;

/** Nivel 1: subir con Hohmann, acoplarse y reparar con la estación terrena a la vista. */
export class Level1 extends Level {
  private fuel_kg = 0;
  private transfer: Transfer | null = null;
  private docked = false;
  private taskProgress: Record<string, number> = { panel: 0, antenna: 0 };
  private dataDownlinked = 0;
  private burns = 0;
  private failureReason: string | null = null;

  constructor(seed: number) {
    super("level1-repair", seed);
    // Los campos de la subclase se inicializan después de super(): se ajustan aquí.
    this.fuel_kg = this.param("fuel_mass_kg");
    this.refreshHangar();
  }

  protected initialState(): SimState {
    const s: SimState = {
      scenario: "level1-repair",
      resources: {
        mass_kg: this.param("servicer_dry_mass_kg") + this.param("fuel_mass_kg"),
        power_generated_w: this.param("power_generated_w"),
        power_consumed_w: this.param("power_consumed_w"),
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
      mass_capacity_kg: this.param("cargo_capacity_kg"),
      altitude_km: this.param("start_altitude_km"),
      target_altitude_km: this.param("target_altitude_km"),
      comm_window_open: false,
      repair_progress_pct: 0,
      data_downlinked_mb: 0,
    };
    this.state = s;
    this.info(this.def.subtitle, "info", "level1:start");
    return s;
  }

  private cargoMass(): number {
    return this.chosenAll().reduce((m, c) => m + c.mass_kg, 0);
  }

  private totalMass(): number {
    return this.param("servicer_dry_mass_kg") + this.fuel_kg + this.cargoMass();
  }

  private deltaVLeft(): number {
    const m0 = this.totalMass();
    return rocketDeltaV(this.param("isp_s"), m0, m0 - this.fuel_kg);
  }

  private refreshHangar(): void {
    const cost = this.chosenAll().reduce((m, c) => m + c.cost_usd_m, 0);
    const power = this.chosenAll().reduce((m, c) => m + c.power_w, 0);
    this.state.resources.mass_kg = round(this.totalMass(), 1);
    this.state.budget_remaining_usd_m = round(this.param("budget_usd_m") - cost, 2);
    this.state.resources.power_consumed_w = this.param("power_consumed_w") - power;
    this.state.delta_v_remaining_m_s = round(this.deltaVLeft(), 2);
  }

  protected onSelectionChanged(): void {
    this.refreshHangar();
  }

  protected onAction(action: PlayerAction): void {
    if (action.type === "launch") return this.launch();
    if (action.type === "burn") return this.burn(action.delta_v_m_s);
  }

  private launch(): void {
    if (this.state.phase !== "hangar") return;
    const cargo = this.cargoMass();
    const cap = this.param("cargo_capacity_kg");
    if (cargo > cap) {
      this.info(
        `Despegue bloqueado: la carga pesa ${round(cargo)} kg y el máximo es ${cap} kg.`,
        "warning",
        "level1:overweight",
      );
      return;
    }
    if ((this.state.budget_remaining_usd_m ?? 0) < 0) {
      this.info("Despegue bloqueado: el equipo supera el presupuesto.", "warning");
      return;
    }
    this.state.phase = "transfer";
    this.info(
      `Separación del vehículo de servicio. Delta-V disponible: ${round(this.deltaVLeft())} m/s.`,
      "info",
      "level1:launch",
    );
    if (!this.chosen("toolkit")) {
      this.info("Sin kit de herramientas no se puede reparar nada.", "warning", "level1:no-toolkit");
    }
  }

  /** Delta-V que necesita una transferencia de Hohmann hasta el objetivo, m/s. */
  requiredDeltaV(): number {
    const r1 = C.earthRadius + (this.state.altitude_km ?? 0);
    const r2 = C.earthRadius + (this.state.target_altitude_km ?? 0);
    return hohmannDeltaV(C.muEarth, r1, r2) * 1000;
  }

  private burn(dv_m_s: number): void {
    if (this.state.phase !== "transfer" || this.transfer || this.docked) return;
    if (!Number.isFinite(dv_m_s) || dv_m_s === 0) return;
    const available = this.deltaVLeft();
    const dv = Math.sign(dv_m_s) * Math.min(Math.abs(dv_m_s), available);
    if (Math.abs(dv) < 1e-6) {
      this.info("Sin combustible para la maniobra.", "warning", "level1:no-fuel");
      return;
    }
    const isp = this.param("isp_s");
    this.fuel_kg = Math.max(0, this.fuel_kg - propellantFor(isp, this.totalMass(), dv));
    const r1 = C.earthRadius + (this.state.altitude_km ?? 0);
    const r2 = hohmannTarget(C.muEarth, r1, dv / 1000);
    this.transfer = {
      from_km: r1 - C.earthRadius,
      to_km: r2 - C.earthRadius,
      start_s: this.t,
      end_s: this.t + hohmannTime(C.muEarth, r1, r2),
    };
    this.burns++;
    this.refreshHangar();
    this.info(
      `Encendido de ${round(dv, 2)} m/s. Transferencia hacia ${round(r2 - C.earthRadius)} km.`,
      "info",
      "level1:burn",
    );
  }

  protected tick(dt: number): void {
    const s = this.state;
    if (s.phase === "hangar") return;
    const window = this.t % this.param("comm_period_s") < this.param("comm_window_s");
    if (window !== s.comm_window_open) {
      s.comm_window_open = window;
      this.info(
        window ? "Estación terrena a la vista: enlace abierto." : "Fin del pase: sin enlace con tierra.",
        "info",
        window ? "level1:aos" : "level1:los",
      );
    }
    s.resources.downlink_rate_kbps = window ? this.param("downlink_kbps") : 0;

    if (this.transfer) {
      const tr = this.transfer;
      const f = Math.min(1, (this.t - tr.start_s) / (tr.end_s - tr.start_s));
      s.altitude_km = round(tr.from_km + (tr.to_km - tr.from_km) * (0.5 - Math.cos(Math.PI * f) / 2), 3);
      if (f >= 1) {
        this.transfer = null;
        s.altitude_km = round(tr.to_km, 3);
        this.checkDocking();
      }
    }

    if (this.docked) this.repair(dt, window);

    if (this.chosen("camera") && s.phase !== "transfer") {
      s.resources.data_stored_mb += this.param("camera_data_mb_s") * dt;
    }
    if (window && s.resources.data_stored_mb > 0) {
      const sent = Math.min(s.resources.data_stored_mb, (this.param("downlink_kbps") / 8000) * dt);
      s.resources.data_stored_mb -= sent;
      this.dataDownlinked += sent;
      s.data_downlinked_mb = round(this.dataDownlinked, 2);
    }

    if (s.phase === "transfer" && !this.transfer && this.deltaVLeft() < 0.05) {
      this.fail("Combustible agotado sin alcanzar el satélite.", "level1:fuel-out");
    }
    if (this.t >= this.param("time_limit_s") && !this.finished) {
      this.fail("Se acabó el tiempo de misión.", "level1:timeout");
    }
    this.updateHealth();
  }

  private checkDocking(): void {
    const s = this.state;
    const miss = Math.abs((s.altitude_km ?? 0) - (s.target_altitude_km ?? 0));
    if (miss <= this.param("dock_tolerance_km")) {
      this.docked = true;
      s.phase = "repair";
      this.info("Acople confirmado. Comienzan las reparaciones.", "info", "level1:docked");
      if (!s.comm_window_open) {
        this.info("Esperando la próxima ventana de comunicaciones.", "info", "level1:wait-window");
      }
    } else {
      this.info(
        `Fuera de alcance: faltan ${round(miss, 2)} km. Delta-V restante ${round(this.deltaVLeft())} m/s.`,
        "warning",
        "level1:miss",
      );
    }
  }

  private repair(dt: number, window: boolean): void {
    if (!window) return;
    const tasks = TASKS.filter((task) => task.needs.every((slot) => this.chosen(slot)));
    const pending = tasks.find((task) => (this.taskProgress[task.id] ?? 0) < 100);
    if (!pending) return;
    const perTask = this.param("repair_work_s") / TASKS.length;
    const before = this.taskProgress[pending.id] ?? 0;
    const now = Math.min(100, before + (100 * dt) / perTask);
    this.taskProgress[pending.id] = now;
    if (before < 100 && now >= 100) {
      this.info(`Reparación del ${pending.label} completa.`, "info", `level1:fixed-${pending.id}`);
    }
    const total = TASKS.reduce((m, task) => m + (this.taskProgress[task.id] ?? 0), 0) / TASKS.length;
    this.state.repair_progress_pct = round(total, 1);
    const allPossibleDone = tasks.every((task) => (this.taskProgress[task.id] ?? 0) >= 100);
    if (allPossibleDone) {
      this.info(
        tasks.length === TASKS.length
          ? "Satélite reparado. Desacople y regreso."
          : "No hay más reparaciones posibles con el equipo a bordo.",
        tasks.length === TASKS.length ? "info" : "warning",
        "level1:complete",
      );
      this.finish();
    }
  }

  private fail(reason: string, trigger: string): void {
    this.failureReason = reason;
    this.info(reason, "failure", trigger);
    this.state.health = "critical";
    this.finish();
  }

  private updateHealth(): void {
    if (this.failureReason) return;
    const dvShort = this.state.phase === "transfer" && !this.transfer && this.deltaVLeft() < this.requiredDeltaV();
    const late = this.t > this.param("time_limit_s") * 0.8;
    this.state.health = dvShort || late ? "warning" : "nominal";
  }

  report(): MissionReport {
    const done = TASKS.filter((task) => (this.taskProgress[task.id] ?? 0) >= 100);
    const missingTools = TASKS.filter((task) => !task.needs.every((slot) => this.chosen(slot)));
    const outcome: MissionReport["outcome"] =
      done.length === TASKS.length ? "success" : done.length > 0 ? "partial" : "failure";
    const causes: MissionReport["causes"] = [];
    if (this.failureReason) causes.push({ text: this.failureReason, segment: "space", origin: "theoretical" });
    if (!this.docked) {
      causes.push({
        text: "No se alcanzó la altitud del satélite. Una transferencia de Hohmann bien calculada usa el mínimo delta-V.",
        source: "Transferencia de Hohmann (vis-viva)",
        segment: "space",
        origin: "real",
      });
    }
    for (const task of missingTools) {
      causes.push({
        text: `Faltó equipo para reparar el ${task.label}.`,
        segment: "launch",
        origin: "theoretical",
      });
    }
    if (done.length === TASKS.length) {
      causes.push({
        text: "Las dos reparaciones se hicieron dentro de las ventanas de comunicación.",
        segment: "ground",
        origin: "theoretical",
      });
    }
    const dvUsed = rocketDeltaV(
      this.param("isp_s"),
      this.param("servicer_dry_mass_kg") + this.param("fuel_mass_kg") + this.cargoMass(),
      this.totalMass(),
    );
    const ideal =
      hohmannDeltaV(
        C.muEarth,
        C.earthRadius + this.param("start_altitude_km"),
        C.earthRadius + this.param("target_altitude_km"),
      ) * 1000;
    const efficiency = this.docked ? Math.min(1, ideal / Math.max(dvUsed, 1e-9)) : 0;
    const score = Math.round(
      done.length * 3000 + efficiency * 2000 + (this.chosen("camera") ? Math.min(1000, this.dataDownlinked) : 0),
    );
    const advice: string[] = [];
    if (efficiency < 0.9 && this.docked) advice.push("Calcula el delta-V de Hohmann antes de encender: menos encendidos, menos combustible.");
    if (missingTools.length) advice.push("Revisa qué herramienta pide cada tarea antes de llenar la bodega.");
    if (!this.docked) advice.push("Sube en una sola transferencia y corrige con encendidos pequeños.");
    return {
      scenario: "level1-repair",
      outcome,
      score,
      causes,
      advice,
      metrics: {
        docked: this.docked,
        tasks_done: done.length,
        burns: this.burns,
        delta_v_used_m_s: round(dvUsed, 2),
        delta_v_ideal_m_s: round(ideal, 2),
        fuel_left_kg: round(this.fuel_kg, 2),
        data_downlinked_mb: round(this.dataDownlinked, 1),
        mission_elapsed_s: Math.round(this.t),
      },
      comparisons: [
        {
          mission: "Hubble SM4 (STS-125, 2009)",
          metric: "Caminatas espaciales",
          ours: `${done.length} tareas`,
          theirs: `${value(missions, "hubble_sm4_spacewalks")} caminatas`,
          source: sourceOf(missions, "hubble_sm4_spacewalks"),
        },
        {
          mission: "Hubble",
          metric: "Altitud de servicio",
          ours: `${round(this.state.altitude_km ?? 0)} km`,
          theirs: `${value(missions, "hubble_altitude_km")} km`,
          source: sourceOf(missions, "hubble_altitude_km"),
        },
      ],
    };
  }
}
