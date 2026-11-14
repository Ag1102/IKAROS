import type { EventChoice, MissionReport, PlayerAction, SimEvent, SimState } from "@ikaros/contracts";
import { C, missions, paper, sourceOf, value } from "../data";
import {
  distanceAt,
  equilibriumTemperature,
  orbitalPeriod,
  radiatorTemperature,
  relax,
  solarIntensity,
  solarOrbit,
  timeFromPerihelion,
  toCelsius,
  toKelvin,
  visViva,
} from "../physics";
import { clamp, Level, round } from "./base";

const PAPER = "Landis et al., AIAA 2008-5712";
const FLYBYS = 3;

type Energy = "pv-cooled" | "stirling" | "fission-reactor";

/** Nivel 3: hangar, ventanas de Venus, encuentro solar con la física del paper y salida. */
export class Level3 extends Level {
  private launchedAt = 0;
  private nextFlybyAt = 0;
  private flybyWindows = 0;
  private encounterStart = 0;
  private encounterHalf = 0;
  private dv_m_s = 0;
  private cellEfficiency = 0;
  private mainArrayLost = false;
  private stirlingFailAt: number | null = null;
  private stirlingFailed = false;
  private cmeAt: number | null = null;
  private cmeOutcome: string | null = null;
  private safeModeUntil = 0;
  private brownout_s = 0;
  private failureReason: string | null = null;
  private minPower = Infinity;
  private maxCell = -Infinity;
  private secondsOverCellLimit = 0;
  private secondsDegrading = 0;
  private maxSpeed = 0;
  private minDistanceRsun = Infinity;
  private dataCollected = 0;
  private dataDownlinked = 0;
  private capsuleRecovered = false;

  constructor(seed: number) {
    super("level3-ikaros", seed);
  }

  protected initialState(): SimState {
    const s: SimState = {
      scenario: "level3-ikaros",
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
      mass_capacity_kg: this.param("launcher_capacity_kg"),
      distance_to_sun_au: 1,
      distance_to_sun_km: C.au,
      distance_to_sun_rsun: round(C.au / C.sunRadius, 1),
      solar_intensity_suns: 1,
      perihelion_rsun: this.param("perihelion_start_rsun"),
      venus_flybys_done: 0,
      hull_durability_pct: 100,
      array_retraction: 0,
      array_illuminated_cm2: this.param("secondary_array_area_cm2"),
      array_tilt_deg: 0,
      main_array_stowed: false,
      attitude: "shield-to-sun",
      radiators_shaded: true,
      battery_capacity_wh: this.param("battery_capacity_wh"),
      battery_wh: this.param("battery_capacity_wh"),
      nanobot_reserve_pct: 0,
      delta_v_remaining_m_s: this.param("delta_v_budget_m_s"),
      power_load_w: -this.param("bus_power_w"),
      data_downlinked_mb: 0,
    };
    this.state = s;
    this.info(this.def.subtitle, "info", "level3:start", PAPER);
    return s;
  }

  // ---- Hangar ----

  private energy(): Energy | undefined {
    return this.chosen("energy")?.id as Energy | undefined;
  }

  private totals() {
    const parts = this.chosenAll();
    return {
      mass: this.param("bus_mass_kg") + parts.reduce((m, c) => m + c.mass_kg, 0),
      cost: this.param("bus_cost_usd_m") + parts.reduce((m, c) => m + c.cost_usd_m, 0),
    };
  }

  /** Consumo eléctrico actual, W (positivo). */
  private load(): number {
    let w = -this.param("bus_power_w");
    for (const c of this.chosenAll()) {
      if (c.power_w >= 0) continue;
      if (c.slot === "science" && this.t < this.safeModeUntil) continue;
      if (c.slot === "defense" && this.brownout_s > 0) continue;
      w += -c.power_w;
    }
    return w;
  }

  protected onSelectionChanged(): void {
    const { mass, cost } = this.totals();
    this.state.resources.mass_kg = mass;
    this.state.budget_remaining_usd_m = round(this.param("budget_usd_m") - cost, 2);
    this.state.power_load_w = this.load();
    this.state.resources.power_consumed_w = this.load();
    this.state.nanobot_reserve_pct = this.chosen("repair") ? 100 : 0;
    const energy = this.energy();
    if (energy === "fission-reactor") {
      this.state.array_illuminated_cm2 = 0;
    } else {
      this.state.array_illuminated_cm2 = this.illuminated();
    }
  }

  private launchProblems(): string[] {
    const problems = this.missingRequired();
    const { mass, cost } = this.totals();
    const cap = this.param("launcher_capacity_kg");
    if (mass > cap) {
      problems.push(`La nave pesa ${mass} kg y el lanzador lleva ${cap} kg (misión limitada por masa, ${PAPER}, p. 6).`);
    }
    if (cost > this.param("budget_usd_m")) {
      problems.push(`El diseño cuesta ${cost} M USD y el presupuesto es ${this.param("budget_usd_m")} M USD.`);
    }
    return problems;
  }

  protected onAction(action: PlayerAction): void {
    switch (action.type) {
      case "launch":
        return this.launch();
      case "retract-array":
        this.state.array_retraction = clamp(action.fraction, 0, 1);
        this.state.array_illuminated_cm2 = round(this.illuminated(), 2);
        return;
      case "tilt-array":
        this.state.array_tilt_deg = clamp(action.deg, 0, value(paper, "main_array_max_tilt_deg"));
        return;
      case "stow-main-array":
        if (!this.state.main_array_stowed) {
          this.state.main_array_stowed = true;
          this.info("Matriz principal plegada tras el escudo.", "info", "level3:main-stowed", sourceOf(paper, "main_array_limit_au"));
        }
        return;
      case "set-attitude":
        if (this.state.phase === "hangar") return;
        this.state.attitude = action.attitude;
        this.state.radiators_shaded = action.attitude === "shield-to-sun";
        this.info(
          action.attitude === "shield-to-sun"
            ? "Escudo al Sol: radiadores en la umbra."
            : "Antena a la Tierra: radiadores fuera de la umbra.",
          action.attitude === "shield-to-sun" ? "info" : "warning",
          `level3:attitude-${action.attitude}`,
        );
        return;
      default:
        return;
    }
  }

  private illuminated(): number {
    if (this.energy() === "fission-reactor") return 0;
    return this.param("secondary_array_area_cm2") * (1 - (this.state.array_retraction ?? 0));
  }

  private launch(): void {
    if (this.state.phase !== "hangar") return;
    const problems = this.launchProblems();
    if (problems.length) {
      for (const p of problems) this.info(`Lanzamiento bloqueado: ${p}`, "warning", "level3:launch-blocked");
      return;
    }
    this.launchedAt = this.t;
    this.state.phase = "cruise";
    this.cellEfficiency =
      this.energy() === "stirling" ? value(paper, "stirling_system_efficiency") : value(paper, "cell_efficiency");
    this.nextFlybyAt = this.t + this.param("flyby_interval_s");
    this.info(
      `Lanzamiento. Primer perihelio a ${value(paper, "first_perihelion_au")} AU (${this.param("perihelion_start_rsun")} R☉).`,
      "info",
      "level3:launch",
      sourceOf(paper, "first_perihelion_au"),
    );
  }

  // ---- Simulación ----

  protected tick(dt: number): void {
    switch (this.state.phase) {
      case "cruise":
        return this.cruise();
      case "encounter":
        return this.encounter(dt);
      case "exit":
        return this.updateHealth();
      default:
        return;
    }
  }

  private cruise(): void {
    const s = this.state;
    const q = (s.perihelion_rsun ?? 0) * (C.sunRadius / C.au);
    const Q = this.param("aphelion_au");
    const period = orbitalPeriod(C.muSun, solarOrbit(q, Q).a_km);
    const since = (this.t - this.launchedAt) % period;
    this.setDistance(distanceAt(q, Q, since - period / 2));

    if (this.flybyWindows < FLYBYS && this.t >= this.nextFlybyAt && !this.openDecision("level3:venus-window")) {
      this.flybyWindows++;
      const next = this.param(`perihelion_after_flyby_${this.flybyWindows}_rsun`);
      this.emit("crisis", `Ventana de Venus ${this.flybyWindows} de ${FLYBYS}: el sobrevuelo puede bajar el perihelio a ${next} R☉.`, {
        trigger: "level3:venus-window",
        source: sourceOf(paper, "venus_flybys"),
        deadline_s: this.t + this.param("flyby_window_s"),
        choices: [
          {
            id: "execute",
            label: "Ejecutar sobrevuelo",
            detail: `Maniobra de corrección de ${this.param("flyby_tcm_delta_v_m_s")} m/s.`,
            origin: "real",
          },
          { id: "skip", label: "Dejar pasar", detail: "El perihelio no cambia.", origin: "theoretical" },
        ],
      });
    }
  }

  protected onChoice(ev: SimEvent, choice: string): void {
    if (ev.trigger === "level3:venus-window") return this.resolveFlyby(choice);
    if (ev.trigger === "level3:cme") return this.resolveCme(choice);
    if (ev.trigger === "level3:ejection") return this.resolveEjection(choice);
  }

  private resolveFlyby(choice: string): void {
    const s = this.state;
    const cost = this.param("flyby_tcm_delta_v_m_s");
    if (choice === "execute" && this.dv_m_s_left() >= cost) {
      this.dv_m_s += cost;
      s.delta_v_remaining_m_s = round(this.dv_m_s_left(), 1);
      s.venus_flybys_done = (s.venus_flybys_done ?? 0) + 1;
      s.perihelion_rsun = this.param(`perihelion_after_flyby_${this.flybyWindows}_rsun`);
      this.info(`Sobrevuelo de Venus completo. Nuevo perihelio: ${s.perihelion_rsun} R☉.`, "info", "level3:venus-flyby", sourceOf(paper, "venus_flybys"));
    } else if (choice === "execute") {
      this.info("Sin delta-V para la maniobra de corrección: se pierde la ventana.", "warning", "level3:venus-missed");
    } else {
      this.info("Ventana de Venus perdida: el perihelio no cambia.", "warning", "level3:venus-missed");
    }
    if (this.flybyWindows < FLYBYS) {
      this.nextFlybyAt = this.t + this.param("flyby_interval_s");
    } else {
      this.startEncounter();
    }
  }

  private dv_m_s_left(): number {
    return this.param("delta_v_budget_m_s") - this.dv_m_s;
  }

  private q_au(): number {
    return (this.state.perihelion_rsun ?? 0) * (C.sunRadius / C.au);
  }

  private startEncounter(): void {
    const limit = value(paper, "main_array_limit_au");
    this.encounterHalf = timeFromPerihelion(this.q_au(), this.param("aphelion_au"), limit);
    this.encounterStart = this.t;
    this.state.phase = "encounter";
    this.state.cell_temperature_c = 60;
    this.state.radiator_temperature_c = 40;
    // En el crucero abreviado la inclinación es automática: llega a 0.25 AU ya inclinada.
    const maxTilt = value(paper, "main_array_max_tilt_deg");
    if (!this.state.main_array_stowed && (this.state.array_tilt_deg ?? 0) < maxTilt) {
      this.state.array_tilt_deg = maxTilt;
    }
    this.info(
      `Entrada a ${limit} AU (16 soles): la matriz principal debe plegarse o inclinarse hasta ${value(paper, "main_array_max_tilt_deg")}°.`,
      "warning",
      "level3:encounter-start",
      sourceOf(paper, "main_array_limit_au"),
    );
    if (this.energy() === "stirling" && this.rng() < this.param("stirling_failure_probability")) {
      this.stirlingFailAt = this.t + this.rng() * 2 * this.encounterHalf;
    }
    if (this.rng() < this.param("cme_probability")) {
      this.cmeAt = this.t + this.encounterHalf + (this.rng() - 0.5) * 86_400;
    }
  }

  /** Tiempo relativo al perihelio durante el encuentro, s. */
  private tPeri(): number {
    return this.t - this.encounterStart - this.encounterHalf;
  }

  private setDistance(r_au: number): void {
    const s = this.state;
    s.distance_to_sun_au = round(r_au, 5);
    s.distance_to_sun_km = Math.round(r_au * C.au);
    s.distance_to_sun_rsun = round((r_au * C.au) / C.sunRadius, 2);
    s.solar_intensity_suns = round(1 / (r_au * r_au), 1);
    const q = this.q_au();
    const { a_km } = solarOrbit(q, this.param("aphelion_au"));
    s.speed_km_s = round(visViva(C.muSun, r_au * C.au, a_km), 1);
  }

  private encounter(dt: number): void {
    const s = this.state;
    const r = distanceAt(this.q_au(), this.param("aphelion_au"), this.tPeri());
    this.setDistance(r);
    this.maxSpeed = Math.max(this.maxSpeed, s.speed_km_s ?? 0);
    this.minDistanceRsun = Math.min(this.minDistanceRsun, s.distance_to_sun_rsun ?? Infinity);
    const I = solarIntensity(r);
    const energy = this.energy();

    if (this.stirlingFailAt !== null && !this.stirlingFailed && this.t >= this.stirlingFailAt) {
      this.stirlingFailed = true;
      this.info("Falla del convertidor Stirling: sin herencia de vuelo, se detuvo el pistón.", "failure", "level3:stirling-failed", sourceOf(paper, "stirling_system_efficiency"));
    }

    // Matriz principal (ec. 1 del paper)
    let mainPower = 0;
    if (!s.main_array_stowed && !this.mainArrayLost) {
      const cosTilt = Math.cos(((s.array_tilt_deg ?? 0) * Math.PI) / 180);
      const tK = equilibriumTemperature(
        this.param("main_array_absorptance"),
        I * cosTilt,
        this.param("main_array_emittance_total"),
      );
      s.main_array_temperature_c = round(toCelsius(tK), 1);
      if (s.main_array_temperature_c > value(paper, "cell_degradation_c")) {
        this.mainArrayLost = true;
        this.info("Matriz principal destruida por calor: superó ~350 °C.", "failure", "level3:main-lost", sourceOf(paper, "cell_degradation_c"));
      } else {
        if (s.main_array_temperature_c > value(paper, "main_array_temp_limit_c")) {
          this.warnOnce("main-hot", `Matriz principal a ${Math.round(s.main_array_temperature_c)} °C: inclínala o pliégala.`, 3600, "level3:main-hot", sourceOf(paper, "main_array_temp_limit_c"));
        }
        mainPower = this.param("main_array_efficiency") * I * this.param("main_array_area_m2") * cosTilt;
      }
    } else {
      s.main_array_temperature_c = undefined;
    }

    // Matriz secundaria / Stirling / reactor y lazo de refrigerante (ec. 2)
    const area_m2 = (s.array_illuminated_cm2 ?? 0) / 10_000;
    let power = mainPower;
    let heat = 0;
    if (energy === "fission-reactor") {
      power += this.reactorPower();
      heat += this.param("reactor_waste_heat_w");
    } else if (!(energy === "stirling" && this.stirlingFailed)) {
      const incident = I * area_m2;
      power += this.cellEfficiency * incident;
      heat += (1 - this.cellEfficiency) * incident;
    } else {
      heat += I * area_m2;
    }
    if (!s.radiators_shaded) {
      heat += I * this.param("radiator_area_m2") * this.param("radiator_sun_exposure");
    }
    const tRad = radiatorTemperature(heat, this.param("radiator_area_m2"), this.param("radiator_emissivity"));
    const tau = this.param("thermal_time_constant_s");
    const radTarget = Math.max(toCelsius(tRad), -40);
    s.radiator_temperature_c = round(relax(s.radiator_temperature_c ?? radTarget, radTarget, dt, tau), 1);
    const cellTarget = s.radiator_temperature_c + value(paper, "coolant_delta_t_c");
    s.cell_temperature_c = round(relax(s.cell_temperature_c ?? cellTarget, cellTarget, dt, tau), 1);

    const limit = energy === "stirling" ? value(paper, "stirling_cold_end_limit_c") : value(paper, "cell_design_limit_c");
    const degrade = value(paper, "cell_degradation_c");
    this.maxCell = Math.max(this.maxCell, s.cell_temperature_c);
    if (s.cell_temperature_c > degrade) {
      this.secondsDegrading += dt;
      this.cellEfficiency *= Math.exp(-dt / 1800);
      this.warnOnce("cell-degrade", `Celdas a ${Math.round(s.cell_temperature_c)} °C: degradación irreversible.`, 1800, "level3:cell-degrading", sourceOf(paper, "cell_degradation_c"));
    } else if (s.cell_temperature_c > limit) {
      this.secondsOverCellLimit += dt;
      this.warnOnce("cell-hot", `Celdas a ${Math.round(s.cell_temperature_c)} °C, límite de diseño ${limit} °C: retrae la matriz.`, 1800, "level3:cell-hot", sourceOf(paper, "cell_design_limit_c"));
    }

    // Balance eléctrico y batería
    const load = this.load();
    s.power_load_w = load;
    s.resources.power_generated_w = round(power, 1);
    s.resources.power_consumed_w = load;
    this.minPower = Math.min(this.minPower, power);
    const cap = s.battery_capacity_wh ?? 0;
    s.battery_wh = round(clamp((s.battery_wh ?? 0) + ((power - load) * dt) / 3600, 0, cap), 2);
    if (power < value(paper, "min_power_w")) {
      this.warnOnce("low-power", `Potencia ${Math.round(power)} W, por debajo de los ${value(paper, "min_power_w")} W requeridos.`, 1800, "level3:low-power", sourceOf(paper, "min_power_w"));
    }
    if ((s.battery_wh ?? 0) <= 0 && power < load) {
      if (this.brownout_s === 0) this.info("Batería agotada: se apagan la defensa y la ciencia.", "failure", "level3:brownout");
      this.brownout_s += dt;
      if (this.brownout_s >= this.param("power_loss_limit_s")) {
        return this.fail("Pérdida de potencia: la nave quedó sin energía en el encuentro.", "level3:power-lost");
      }
    } else {
      this.brownout_s = 0;
    }

    // Casco, escudo y nanobots
    const shield = this.chosen("shield")?.id ?? "shield-cc";
    const factor = this.param(`shield_factor_${shield}`);
    let hull = s.hull_durability_pct ?? 100;
    if (!s.radiators_shaded) {
      const peri = solarIntensity(value(paper, "perihelion_rsun") * (C.sunRadius / C.au));
      hull -= this.param("hull_damage_exposed_pct_s") * (I / peri) * factor * dt;
    }
    if (this.chosen("repair") && (s.nanobot_reserve_pct ?? 0) > 0 && hull < 100 && this.brownout_s === 0) {
      const fix = Math.min(100 - hull, this.param("nanobot_repair_pct_s") * dt);
      hull += fix;
      s.nanobot_reserve_pct = round(Math.max(0, (s.nanobot_reserve_pct ?? 0) - this.param("nanobot_reserve_pct_s") * dt), 2);
    }
    s.hull_durability_pct = round(hull, 2);
    if (hull <= 0) return this.fail("El casco cedió: la nave quedó expuesta al Sol.", "level3:hull-lost");

    // Ciencia y comunicaciones
    const scienceOn = this.t >= this.safeModeUntil && this.brownout_s === 0;
    if (scienceOn) {
      const peri = value(paper, "perihelion_rsun") * (C.sunRadius / C.au);
      const rate = this.param("data_rate_max_mb_s") * Math.min(1, (peri / r) ** 2);
      const room = this.param("data_storage_mb") - s.resources.data_stored_mb;
      const got = Math.max(0, Math.min(room, rate * dt));
      s.resources.data_stored_mb += got;
      this.dataCollected += got;
      if (room <= 0) this.warnOnce("storage-full", "Memoria llena: la ciencia se detiene hasta bajar datos.", 7200, "level3:storage-full");
    }
    if (s.attitude === "antenna-to-earth") {
      s.resources.downlink_rate_kbps = this.param("downlink_kbps");
      const sent = Math.min(s.resources.data_stored_mb, (this.param("downlink_kbps") / 8000) * dt);
      s.resources.data_stored_mb -= sent;
      this.dataDownlinked += sent;
    } else {
      s.resources.downlink_rate_kbps = 0;
    }
    s.resources.data_stored_mb = round(s.resources.data_stored_mb, 3);
    s.data_downlinked_mb = round(this.dataDownlinked, 2);

    // CME
    if (this.cmeAt !== null && this.t >= this.cmeAt && !this.state.events.some((e) => e.trigger === "level3:cme")) {
      this.openCme();
    }

    this.updateHealth();
    if (this.tPeri() >= this.encounterHalf) this.leaveEncounter();
  }

  private reactorPower(): number {
    const reactor = this.def.components.find((c) => c.id === "fission-reactor");
    return reactor ? reactor.power_w : 0;
  }

  private openCme(): void {
    const choices: EventChoice[] = [];
    if (this.chosen("defense")) {
      choices.push({ id: "hts", label: "Sobrecargar el campo HTS", detail: `Casco protegido; se pierde el ${this.param("cme_hts_data_loss") * 100} % de los datos guardados.`, origin: "theoretical" });
    }
    if (this.chosen("repair")) {
      choices.push({ id: "nanobots", label: "Inyectar nanobots", detail: `Repara el daño; gasta el ${this.param("cme_nanobot_reserve_cost_pct")} % de la reserva.`, origin: "theoretical" });
    }
    choices.push({ id: "assistant", label: "Delegar al asistente de misión", detail: `${this.param("cme_assistant_success") * 100} % de éxito.`, origin: "theoretical" });
    choices.push({ id: "safe-mode", label: "Modo seguro", detail: "Escudo al Sol e instrumentos apagados 6 h. Daño menor.", origin: "real" });
    this.emit("crisis", "Eyección de masa coronal detectada. Impacto en 2 h.", {
      trigger: "level3:cme",
      source: "NASA, Parker Solar Probe: paso a través de eyecciones de masa coronal",
      deadline_s: this.t + this.param("cme_deadline_s"),
      choices,
    });
  }

  private resolveCme(choice: string): void {
    const s = this.state;
    const full = this.param("cme_hull_damage_pct");
    let damage = full;
    if (choice === "hts" && this.brownout_s === 0) {
      damage = 0;
      s.resources.data_stored_mb = round(s.resources.data_stored_mb * (1 - this.param("cme_hts_data_loss")), 3);
    } else if (choice === "nanobots") {
      damage = 5;
      s.nanobot_reserve_pct = Math.max(0, (s.nanobot_reserve_pct ?? 0) - this.param("cme_nanobot_reserve_cost_pct"));
    } else if (choice === "assistant") {
      damage = this.rng() < this.param("cme_assistant_success") ? 5 : full;
    } else if (choice === "safe-mode") {
      damage = this.param("cme_safe_mode_damage_pct");
      s.attitude = "shield-to-sun";
      s.radiators_shaded = true;
      this.safeModeUntil = this.t + this.param("cme_safe_mode_duration_s");
    }
    this.cmeOutcome = choice;
    s.hull_durability_pct = round((s.hull_durability_pct ?? 100) - damage, 2);
    this.info(
      choice === "timeout"
        ? `La CME golpeó sin respuesta: casco −${damage} %.`
        : `CME resuelta (${choice}): casco −${damage} %.`,
      damage >= full ? "failure" : "info",
      "level3:cme-resolved",
    );
    if ((s.hull_durability_pct ?? 0) <= 0) this.fail("El casco cedió tras la CME.", "level3:hull-lost");
  }

  private leaveEncounter(): void {
    const s = this.state;
    s.phase = "exit";
    this.info("Salida del encuentro: de vuelta a 0.25 AU.", "info", "level3:encounter-end");
    if (this.chosen("science")?.id === "sensors-capsule") {
      this.emit("crisis", "⚗ Ventana de eyección: separar el módulo y liberar la cápsula de 450 kg.", {
        trigger: "level3:ejection",
        deadline_s: this.t + this.param("ejection_window_s"),
        choices: [
          { id: "eject", label: "Eyectar módulo", detail: "La cápsula vuelve con las muestras.", origin: "theoretical" },
          { id: "hold", label: "Conservar el módulo", detail: "La cápsula se queda a bordo.", origin: "theoretical" },
        ],
      });
    } else {
      this.finish();
    }
  }

  private resolveEjection(choice: string): void {
    this.capsuleRecovered = choice === "eject";
    this.info(
      this.capsuleRecovered ? "⚗ Cápsula liberada en trayectoria de retorno." : "La cápsula no se liberó.",
      this.capsuleRecovered ? "info" : "warning",
      "level3:ejection-resolved",
    );
    this.finish();
  }

  private fail(reason: string, trigger: string): void {
    this.failureReason = reason;
    this.state.health = "critical";
    this.info(reason, "failure", trigger);
    this.finish();
  }

  private updateHealth(): void {
    const s = this.state;
    if (this.failureReason) return;
    const limit = this.energy() === "stirling" ? value(paper, "stirling_cold_end_limit_c") : value(paper, "cell_design_limit_c");
    const cell = s.cell_temperature_c ?? 0;
    const hull = s.hull_durability_pct ?? 100;
    const power = s.resources.power_generated_w;
    if (cell > value(paper, "cell_degradation_c") || hull < 25 || this.brownout_s > 0) s.health = "critical";
    else if (cell > limit || hull < 60 || power < (s.power_load_w ?? 0)) s.health = "warning";
    else s.health = "nominal";
  }

  report(): MissionReport {
    const s = this.state;
    const goal = this.param("data_goal_mb");
    const data = this.dataCollected;
    const target = value(paper, "perihelion_rsun");
    const reachedTarget = (s.perihelion_rsun ?? Infinity) <= target + 1e-9;
    const completed = s.phase === "complete" && !this.failureReason && this.encounterStart > 0;
    const outcome: MissionReport["outcome"] = this.failureReason
      ? "failure"
      : completed && reachedTarget && data >= goal && this.secondsDegrading === 0
        ? "success"
        : completed
          ? "partial"
          : "failure";

    const causes: MissionReport["causes"] = [];
    if (this.failureReason) causes.push({ text: this.failureReason, segment: "space", origin: "theoretical" });
    if (this.encounterStart === 0 && !this.failureReason) {
      causes.push({ text: "La misión no llegó al encuentro solar.", segment: "launch", origin: "theoretical" });
    }
    if (this.encounterStart > 0) {
      causes.push(
        reachedTarget
          ? { text: `Perihelio de ${target} R☉ alcanzado, como en el diseño de Solar Probe+.`, source: sourceOf(paper, "perihelion_rsun"), segment: "space", origin: "real" }
          : { text: `El perihelio quedó en ${s.perihelion_rsun} R☉: faltaron sobrevuelos de Venus para bajar a ${target} R☉.`, source: sourceOf(paper, "venus_flybys"), segment: "space", origin: "real" },
      );
      if (this.secondsDegrading > 0) {
        causes.push({ text: `Las celdas pasaron ~350 °C durante ${Math.round(this.secondsDegrading / 60)} min: degradación irreversible.`, source: sourceOf(paper, "cell_degradation_c"), segment: "space", origin: "real" });
      } else if (this.secondsOverCellLimit > 0) {
        causes.push({ text: `Las celdas superaron el límite de diseño durante ${Math.round(this.secondsOverCellLimit / 60)} min.`, source: sourceOf(paper, "cell_design_limit_c"), segment: "space", origin: "real" });
      } else {
        causes.push({ text: "Las celdas se mantuvieron bajo el límite de diseño todo el encuentro.", source: sourceOf(paper, "cell_design_limit_c"), segment: "space", origin: "real" });
      }
      if (this.minPower < value(paper, "min_power_w")) {
        causes.push({ text: `La potencia bajó a ${Math.round(this.minPower)} W, por debajo de los ${value(paper, "min_power_w")} W requeridos.`, source: sourceOf(paper, "min_power_w"), segment: "space", origin: "real" });
      }
      if (this.mainArrayLost) {
        causes.push({ text: "La matriz principal no se plegó a tiempo y se destruyó.", source: sourceOf(paper, "main_array_limit_au"), segment: "space", origin: "real" });
      }
      if (this.stirlingFailed) {
        causes.push({ text: "El convertidor Stirling falló: el paper lo descarta por falta de herencia de vuelo.", source: sourceOf(paper, "stirling_system_efficiency"), segment: "space", origin: "real" });
      }
      if (this.cmeOutcome) {
        causes.push({ text: `Respuesta a la CME: ${this.cmeOutcome}.`, segment: "ground", origin: "theoretical" });
      }
      causes.push({
        text: data >= goal ? `Ciencia: ${Math.round(data)} MB reunidos, sobre la meta de ${goal} MB.` : `Ciencia: ${Math.round(data)} MB de ${goal} MB.`,
        segment: "user",
        origin: "theoretical",
      });
    }

    const advice: string[] = [];
    if (!reachedTarget) advice.push("Ejecuta las tres ventanas de Venus: cada sobrevuelo baja el perihelio.");
    if (this.secondsOverCellLimit > 0 || this.secondsDegrading > 0) advice.push("Retrae la matriz secundaria al acercarte: en perihelio solo ~34 cm² iluminados bastan (paper, p. 7-8).");
    if (this.minPower < value(paper, "min_power_w")) advice.push("No retraigas de más: la potencia debe quedar sobre 482 W.");
    if (this.mainArrayLost) advice.push("Pliega la matriz principal antes de ~0.13 AU o inclínala hasta 74°.");
    if (data < goal) advice.push("Baja datos lejos del Sol, cuando girar la antena cuesta poco calor.");

    const score = Math.round(
      (outcome === "failure" ? 0 : 3000) +
        (reachedTarget ? 2500 : 0) +
        Math.min(1, data / goal) * 2500 +
        (s.hull_durability_pct ?? 0) * 10 +
        (this.capsuleRecovered ? 1000 : 0) -
        this.secondsOverCellLimit / 6,
    );

    return {
      scenario: "level3-ikaros",
      outcome,
      score: Math.max(0, score),
      causes,
      advice,
      metrics: {
        min_distance_rsun: Number.isFinite(this.minDistanceRsun) ? round(this.minDistanceRsun, 2) : "—",
        max_speed_km_s: round(this.maxSpeed, 1),
        venus_flybys: s.venus_flybys_done ?? 0,
        final_hull_durability_pct: round(s.hull_durability_pct ?? 0, 1),
        min_power_w: Number.isFinite(this.minPower) ? Math.round(this.minPower) : "—",
        max_cell_temperature_c: Number.isFinite(this.maxCell) ? round(this.maxCell, 1) : "—",
        minutes_over_cell_limit: Math.round(this.secondsOverCellLimit / 60),
        science_data_mb: Math.round(data),
        data_downlinked_mb: Math.round(this.dataDownlinked),
        main_array_lost: this.mainArrayLost,
        capsule_recovered: this.capsuleRecovered,
        mission_elapsed_s: Math.round(this.t),
      },
      comparisons: [
        {
          mission: "Parker Solar Probe",
          metric: "Distancia mínima",
          ours: Number.isFinite(this.minDistanceRsun) ? `${round(this.minDistanceRsun, 2)} R☉` : "—",
          theirs: `${value(missions, "parker_perihelion_rsun")} R☉`,
          source: sourceOf(missions, "parker_perihelion_rsun"),
        },
        {
          mission: "Parker Solar Probe",
          metric: "Velocidad máxima",
          ours: `${round(this.maxSpeed, 1)} km/s`,
          theirs: `${value(missions, "parker_max_speed_km_s")} km/s`,
          source: sourceOf(missions, "parker_max_speed_km_s"),
        },
        {
          mission: "Parker Solar Probe",
          metric: "Sobrevuelos de Venus",
          ours: `${s.venus_flybys_done ?? 0} (abreviado)`,
          theirs: `${value(missions, "parker_venus_flybys")}`,
          source: sourceOf(missions, "parker_venus_flybys"),
        },
        {
          mission: "Solar Probe+ (diseño 2008)",
          metric: "Potencia mínima en el encuentro",
          ours: Number.isFinite(this.minPower) ? `${Math.round(this.minPower)} W` : "—",
          theirs: `${value(paper, "min_power_w")} W requeridos`,
          source: sourceOf(paper, "min_power_w"),
        },
      ],
    };
  }
}
