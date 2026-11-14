import type { EventChoice, MissionReport, PlayerAction, SimEvent, SimState } from "@ikaros/contracts";
import { C, missions, paper, sourceOf, value, type Lang } from "../data";
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

type Energy = "pv-cooled" | "stirling" | "fission-reactor";

/** Nivel 3: hangar, ventanas de Venus, encuentro solar con la física del paper y salida. */
export class Level3 extends Level {
  private launchedAt = 0;
  private nextFlybyAt = 0;
  private flybyWindows = 0;
  private encounterStart = 0;
  private encounterHalf = 0;
  private deltaVUsed = 0;
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
  private dived = false;
  private systems: { reactor: boolean; hts: boolean } = { reactor: true, hts: true };
  private systemsOff_s = 0;
  private erosion = 0;
  private erosionBlocked = 0;
  private nanobotRepaired = 0;
  private reactorEnergy_wh = 0;

  constructor(seed: number, lang: Lang = "es") {
    super("level3-ikaros", seed, lang);
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
      if (c.slot === "defense" && (this.brownout_s > 0 || !this.systems.hts)) continue;
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
      problems.push(
        this.L(
          `La nave pesa ${mass} kg y el lanzador lleva ${cap} kg (misión limitada por masa, ${PAPER}, p. 6).`,
          `The spacecraft weighs ${mass} kg and the launcher carries ${cap} kg (mass-limited mission, ${PAPER}, p. 6).`,
        ),
      );
    }
    if (cost > this.param("budget_usd_m")) {
      problems.push(
        this.L(
          `El diseño cuesta ${cost} M USD y el presupuesto es ${this.param("budget_usd_m")} M USD.`,
          `The design costs ${cost} M USD and the budget is ${this.param("budget_usd_m")} M USD.`,
        ),
      );
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
          this.info(
            this.L("Matriz principal plegada tras el escudo.", "Main array folded behind the shield."),
            "info",
            "level3:main-stowed",
            sourceOf(paper, "main_array_limit_au"),
          );
        }
        return;
      case "set-system":
        if (this.state.phase === "hangar") return;
        this.systems = { ...this.systems, [action.system]: action.on };
        this.state.systems = { ...this.systems };
        this.info(
          action.system === "reactor"
            ? action.on
              ? this.L("⚗ Reactor en marcha.", "⚗ Reactor running.")
              : this.L("⚗ SCRAM: el reactor se apagó.", "⚗ SCRAM: the reactor shut down.")
            : action.on
              ? this.L("⚗ Campo HTS activo.", "⚗ HTS field active.")
              : this.L("⚗ El campo HTS cayó.", "⚗ The HTS field collapsed."),
          action.on ? "info" : "warning",
          `level3:system-${action.system}-${action.on ? "on" : "off"}`,
        );
        return;
      case "set-attitude":
        if (this.state.phase === "hangar") return;
        this.state.attitude = action.attitude;
        this.state.radiators_shaded = action.attitude === "shield-to-sun";
        this.info(
          action.attitude === "shield-to-sun"
            ? this.L("Escudo al Sol: radiadores en la umbra.", "Shield to the Sun: radiators in the umbra.")
            : this.L(
                "Antena a la Tierra: radiadores fuera de la umbra.",
                "Antenna to Earth: radiators out of the umbra.",
              ),
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
      for (const p of problems)
        this.info(
          this.L(`Lanzamiento bloqueado: ${p}`, `Launch blocked: ${p}`),
          "warning",
          "level3:launch-blocked",
        );
      return;
    }
    this.launchedAt = this.t;
    this.state.phase = "cruise";
    this.cellEfficiency =
      this.energy() === "stirling"
        ? value(paper, "stirling_system_efficiency")
        : value(paper, "cell_efficiency");
    this.nextFlybyAt = this.t + this.param("flyby_interval_s");
    this.info(
      this.L(
        `Lanzamiento. Primer perihelio a ${value(paper, "first_perihelion_au")} AU (${this.param("perihelion_start_rsun")} R☉).`,
        `Launch. First perihelion at ${value(paper, "first_perihelion_au")} AU (${this.param("perihelion_start_rsun")} R☉).`,
      ),
      "info",
      "level3:launch",
      sourceOf(paper, "first_perihelion_au"),
    );
  }

  // ---- Simulación ----

  protected substep(): number {
    // El crucero no tiene física fina: basta un subpaso de una hora.
    return this.state.phase === "cruise" ? 3600 : super.substep();
  }

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

    if (
      this.flybyWindows < this.flybys() &&
      this.t >= this.nextFlybyAt &&
      !this.openDecision("level3:venus-window")
    ) {
      this.flybyWindows++;
      const next = this.param(`perihelion_after_flyby_${this.flybyWindows}_rsun`);
      this.emit(
        "crisis",
        this.L(
          `Ventana de Venus ${this.flybyWindows} de ${this.flybys()}: el sobrevuelo puede bajar el perihelio a ${next} R☉.`,
          `Venus window ${this.flybyWindows} of ${this.flybys()}: the flyby can lower the perihelion to ${next} R☉.`,
        ),
        {
          trigger: "level3:venus-window",
          source: sourceOf(paper, "venus_flybys"),
          deadline_s: this.t + this.param("flyby_window_s"),
          choices: [
            {
              id: "execute",
              label: this.L("Ejecutar sobrevuelo", "Execute flyby"),
              detail: this.L(
                `Maniobra de corrección de ${this.param("flyby_tcm_delta_v_m_s")} m/s.`,
                `Correction maneuver of ${this.param("flyby_tcm_delta_v_m_s")} m/s.`,
              ),
              origin: "real",
            },
            {
              id: "skip",
              label: this.L("Dejar pasar", "Let it pass"),
              detail: this.L("El perihelio no cambia.", "The perihelion does not change."),
              origin: "theoretical",
            },
          ],
        },
      );
    }
  }

  protected onChoice(ev: SimEvent, choice: string): void {
    if (ev.trigger === "level3:venus-window") return this.resolveFlyby(choice);
    if (ev.trigger === "level3:ikaros-dive") return this.resolveDive(choice);
    if (ev.trigger === "level3:cme") return this.resolveCme(choice);
    if (ev.trigger === "level3:ejection") return this.resolveEjection(choice);
  }

  private resolveFlyby(choice: string): void {
    const s = this.state;
    const cost = this.param("flyby_tcm_delta_v_m_s");
    if (choice === "execute" && this.deltaVLeft() >= cost) {
      this.deltaVUsed += cost;
      s.delta_v_remaining_m_s = round(this.deltaVLeft(), 1);
      s.venus_flybys_done = (s.venus_flybys_done ?? 0) + 1;
      s.perihelion_rsun = this.param(`perihelion_after_flyby_${this.flybyWindows}_rsun`);
      this.info(
        this.L(
          `Sobrevuelo de Venus completo. Nuevo perihelio: ${s.perihelion_rsun} R☉.`,
          `Venus flyby complete. New perihelion: ${s.perihelion_rsun} R☉.`,
        ),
        "info",
        "level3:venus-flyby",
        sourceOf(paper, "venus_flybys"),
      );
    } else if (choice === "execute") {
      this.info(
        this.L(
          "Sin delta-V para la maniobra de corrección: se pierde la ventana.",
          "No delta-V for the correction maneuver: the window is lost.",
        ),
        "warning",
        "level3:venus-missed",
      );
    } else {
      this.info(
        this.L(
          "Ventana de Venus perdida: el perihelio no cambia.",
          "Venus window missed: the perihelion does not change.",
        ),
        "warning",
        "level3:venus-missed",
      );
    }
    if (this.flybyWindows < this.flybys()) {
      this.nextFlybyAt = this.t + this.param("flyby_interval_s");
    } else if (this.diveReady()) {
      this.openDive();
    } else {
      this.startEncounter();
    }
  }

  /** ⚗ El kit Ikaros: mini reactor, campo HTS y nanobots. */
  private hasIkarosKit(): boolean {
    return (
      this.energy() === "fission-reactor" && Boolean(this.chosen("defense")) && Boolean(this.chosen("repair"))
    );
  }

  /** La zambullida se ofrece con los tres sobrevuelos hechos y el kit Ikaros a bordo. */
  private diveReady(): boolean {
    const atTarget = (this.state.perihelion_rsun ?? Infinity) <= value(paper, "perihelion_rsun") + 1e-9;
    return atTarget && this.hasIkarosKit();
  }

  private openDive(): void {
    const target = this.param("perihelion_ikaros_dive_rsun");
    this.emit(
      "crisis",
      this.L(
        `⚗ Zambullida Ikaros: con el reactor, el campo HTS y los nanobots, el perihelio puede bajar a ${round(target, 2)} R☉ (850.000 km).`,
        `⚗ Ikaros dive: with the reactor, the HTS field and the nanobots, the perihelion can drop to ${round(target, 2)} R☉ (850,000 km).`,
      ),
      {
        trigger: "level3:ikaros-dive",
        source: this.paramSource("perihelion_ikaros_dive_rsun"),
        deadline_s: this.t + this.param("flyby_window_s"),
        choices: [
          {
            id: "dive",
            label: this.L("⚗ Zambullirse", "⚗ Dive"),
            detail: this.L("Récord a 850.000 km.", "Record at 850,000 km."),
            origin: "theoretical",
          },
          {
            id: "stay",
            label: this.L("Quedarse en 9,5 R☉", "Stay at 9.5 R☉"),
            detail: this.L("Ya es más cerca que Parker.", "Already closer than Parker."),
            origin: "real",
          },
        ],
      },
    );
  }

  private resolveDive(choice: string): void {
    if (choice === "dive") {
      this.dived = true;
      this.state.perihelion_rsun = this.param("perihelion_ikaros_dive_rsun");
      this.info(
        this.L(
          `⚗ Zambullida iniciada: perihelio ${round(this.state.perihelion_rsun, 2)} R☉.`,
          `⚗ Dive started: perihelion ${round(this.state.perihelion_rsun, 2)} R☉.`,
        ),
        "info",
        "level3:dive",
      );
    }
    this.startEncounter();
  }

  /** Ventanas de Venus del escenario: tantas como perihelios por sobrevuelo hay en data/. */
  private flybys(): number {
    return Object.keys(this.def.params).filter((k) => /^perihelion_after_flyby_\d+_rsun$/.test(k)).length;
  }

  private deltaVLeft(): number {
    return this.param("delta_v_budget_m_s") - this.deltaVUsed;
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
      this.L(
        `Entrada a ${limit} AU (16 soles): la matriz principal debe plegarse o inclinarse hasta ${value(paper, "main_array_max_tilt_deg")}°.`,
        `Crossing ${limit} AU (16 suns): the main array must be folded or tilted up to ${value(paper, "main_array_max_tilt_deg")}°.`,
      ),
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
      this.info(
        this.L(
          "Falla del convertidor Stirling: sin herencia de vuelo, se detuvo el pistón.",
          "Stirling converter failure: with no flight heritage, the piston stopped.",
        ),
        "failure",
        "level3:stirling-failed",
        sourceOf(paper, "stirling_system_efficiency"),
      );
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
      s.main_array_temperature_c = toCelsius(tK);
      if (s.main_array_temperature_c > value(paper, "cell_degradation_c")) {
        this.mainArrayLost = true;
        this.info(
          this.L(
            "Matriz principal destruida por calor: superó ~350 °C.",
            "Main array destroyed by heat: it exceeded ~350 °C.",
          ),
          "failure",
          "level3:main-lost",
          sourceOf(paper, "cell_degradation_c"),
        );
      } else {
        if (s.main_array_temperature_c > value(paper, "main_array_temp_limit_c")) {
          this.warnOnce(
            "main-hot",
            this.L(
              `Matriz principal a ${Math.round(s.main_array_temperature_c)} °C: inclínala o pliégala.`,
              `Main array at ${Math.round(s.main_array_temperature_c)} °C: tilt it or fold it.`,
            ),
            3600,
            "level3:main-hot",
            sourceOf(paper, "main_array_temp_limit_c"),
          );
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
      this.reactorEnergy_wh += (this.reactorPower() * dt) / 3600;
      if (this.systems.reactor) heat += this.param("reactor_waste_heat_w");
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
    s.radiator_temperature_c = relax(s.radiator_temperature_c ?? radTarget, radTarget, dt, tau);
    // La celda sigue al equilibrio del lazo, no al radiador ya relajado: así el resultado no depende del paso.
    const cellTarget = radTarget + value(paper, "coolant_delta_t_c");
    s.cell_temperature_c = relax(s.cell_temperature_c ?? cellTarget, cellTarget, dt, tau);

    const limit =
      energy === "stirling" ? value(paper, "stirling_cold_end_limit_c") : value(paper, "cell_design_limit_c");
    const degrade = value(paper, "cell_degradation_c");
    this.maxCell = Math.max(this.maxCell, s.cell_temperature_c);
    if (s.cell_temperature_c > degrade) {
      this.secondsDegrading += dt;
      this.cellEfficiency *= Math.exp(-dt / 1800);
      this.warnOnce(
        "cell-degrade",
        this.L(
          `Celdas a ${Math.round(s.cell_temperature_c)} °C: degradación irreversible.`,
          `Cells at ${Math.round(s.cell_temperature_c)} °C: irreversible degradation.`,
        ),
        1800,
        "level3:cell-degrading",
        sourceOf(paper, "cell_degradation_c"),
      );
    } else if (s.cell_temperature_c > limit) {
      this.secondsOverCellLimit += dt;
      this.warnOnce(
        "cell-hot",
        this.L(
          `Celdas a ${Math.round(s.cell_temperature_c)} °C, límite de diseño ${limit} °C: retrae la matriz.`,
          `Cells at ${Math.round(s.cell_temperature_c)} °C, design limit ${limit} °C: retract the array.`,
        ),
        1800,
        "level3:cell-hot",
        sourceOf(paper, "cell_design_limit_c"),
      );
    }

    // Balance eléctrico y batería
    const load = this.load();
    s.power_load_w = load;
    s.resources.power_generated_w = power;
    s.resources.power_consumed_w = load;
    this.minPower = Math.min(this.minPower, power);
    const cap = s.battery_capacity_wh ?? 0;
    s.battery_wh = clamp((s.battery_wh ?? 0) + ((power - load) * dt) / 3600, 0, cap);
    if (power < value(paper, "min_power_w")) {
      this.warnOnce(
        "low-power",
        this.L(
          `Potencia ${Math.round(power)} W, por debajo de los ${value(paper, "min_power_w")} W requeridos.`,
          `Power ${Math.round(power)} W, below the required ${value(paper, "min_power_w")} W.`,
        ),
        1800,
        "level3:low-power",
        sourceOf(paper, "min_power_w"),
      );
    }
    if ((s.battery_wh ?? 0) <= 0 && power < load) {
      if (this.brownout_s === 0)
        this.info(
          this.L(
            "Batería agotada: se apagan la defensa y la ciencia.",
            "Battery drained: defense and science shut down.",
          ),
          "failure",
          "level3:brownout",
        );
      this.brownout_s += dt;
      if (this.brownout_s >= this.param("power_loss_limit_s")) {
        return this.fail(
          this.L(
            "Pérdida de potencia: la nave quedó sin energía en el encuentro.",
            "Loss of power: the spacecraft ran out of energy during the encounter.",
          ),
          "level3:power-lost",
        );
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
    // ⚗ Bajo 9,5 R☉ el plasma y el calor desgastan el casco; el campo HTS (con energía) desvía la mayor parte.
    const r_rsun = s.distance_to_sun_rsun ?? Infinity;
    const paperPeri = value(paper, "perihelion_rsun");
    if (r_rsun < paperPeri) {
      const intensity = (paperPeri / r_rsun) ** 2;
      const raw = this.param("dive_erosion_pct_s") * intensity * factor * dt;
      const htsOn = Boolean(this.chosen("defense")) && this.brownout_s === 0 && this.systems.hts;
      const through = htsOn ? raw * this.param("hts_erosion_factor") : raw;
      hull -= through;
      this.erosion += through;
      this.erosionBlocked += raw - through;
    }
    if (this.chosen("repair") && (s.nanobot_reserve_pct ?? 0) > 0 && hull < 100 && this.brownout_s === 0) {
      const fix = Math.min(100 - hull, this.param("nanobot_repair_pct_s") * dt);
      hull += fix;
      this.nanobotRepaired += fix;
      s.nanobot_reserve_pct = Math.max(
        0,
        (s.nanobot_reserve_pct ?? 0) - this.param("nanobot_reserve_pct_s") * dt,
      );
    }
    s.hull_durability_pct = hull;
    if (hull <= 0)
      return this.fail(
        this.L(
          "El casco cedió: la nave quedó expuesta al Sol.",
          "The hull gave way: the spacecraft was exposed to the Sun.",
        ),
        "level3:hull-lost",
      );

    // Ciencia y comunicaciones
    const scienceOn = this.t >= this.safeModeUntil && this.brownout_s === 0;
    if (scienceOn) {
      const peri = value(paper, "perihelion_rsun") * (C.sunRadius / C.au);
      const rate = this.param("data_rate_max_mb_s") * Math.min(1, (peri / r) ** 2);
      const room = this.param("data_storage_mb") - s.resources.data_stored_mb;
      const got = Math.max(0, Math.min(room, rate * dt));
      s.resources.data_stored_mb += got;
      this.dataCollected += got;
      if (room <= 0)
        this.warnOnce(
          "storage-full",
          this.L(
            "Memoria llena: la ciencia se detiene hasta bajar datos.",
            "Memory full: science stops until data is downlinked.",
          ),
          7200,
          "level3:storage-full",
        );
    }
    if (s.attitude === "antenna-to-earth") {
      s.resources.downlink_rate_kbps = this.param("downlink_kbps");
      const sent = Math.min(s.resources.data_stored_mb, (this.param("downlink_kbps") / 8000) * dt);
      s.resources.data_stored_mb -= sent;
      this.dataDownlinked += sent;
    } else {
      s.resources.downlink_rate_kbps = 0;
    }
    s.data_downlinked_mb = this.dataDownlinked;

    // CME
    if (
      this.cmeAt !== null &&
      this.t >= this.cmeAt &&
      !this.state.events.some((e) => e.trigger === "level3:cme")
    ) {
      this.openCme();
    }

    this.updateHealth();
    if (this.tPeri() >= this.encounterHalf) this.leaveEncounter();
  }

  private reactorPower(): number {
    if (!this.systems.reactor) return 0;
    const reactor = this.def.components.find((c) => c.id === "fission-reactor");
    return reactor ? reactor.power_w : 0;
  }

  private openCme(): void {
    const choices: EventChoice[] = [];
    if (this.chosen("defense")) {
      choices.push({
        id: "hts",
        label: this.cmeLabel("hts"),
        detail: this.L(
          `Casco protegido; se pierde el ${this.param("cme_hts_data_loss") * 100} % de los datos guardados.`,
          `Hull protected; ${this.param("cme_hts_data_loss") * 100} % of the stored data is lost.`,
        ),
        origin: "theoretical",
      });
    }
    if (this.chosen("repair")) {
      choices.push({
        id: "nanobots",
        label: this.cmeLabel("nanobots"),
        detail: this.L(
          `Repara el daño; gasta el ${this.param("cme_nanobot_reserve_cost_pct")} % de la reserva.`,
          `Repairs the damage; uses ${this.param("cme_nanobot_reserve_cost_pct")} % of the reserve.`,
        ),
        origin: "theoretical",
      });
    }
    choices.push({
      id: "assistant",
      label: this.cmeLabel("assistant"),
      detail: this.L(
        `${this.param("cme_assistant_success") * 100} % de éxito.`,
        `${this.param("cme_assistant_success") * 100} % chance of success.`,
      ),
      origin: "theoretical",
    });
    choices.push({
      id: "safe-mode",
      label: this.cmeLabel("safe-mode"),
      detail: this.L(
        "Escudo al Sol e instrumentos apagados 6 h. Daño menor.",
        "Shield to the Sun and instruments off for 6 h. Minor damage.",
      ),
      origin: "real",
    });
    this.emit(
      "crisis",
      this.L(
        "Eyección de masa coronal detectada. Impacto en 2 h.",
        "Coronal mass ejection detected. Impact in 2 h.",
      ),
      {
        trigger: "level3:cme",
        source: "NASA, Parker Solar Probe: paso a través de eyecciones de masa coronal",
        deadline_s: this.t + this.param("cme_deadline_s"),
        choices,
      },
    );
  }

  private resolveCme(choice: string): void {
    const s = this.state;
    const full = this.param("cme_hull_damage_pct");
    let damage = full;
    if (choice === "hts" && this.brownout_s === 0 && this.systems.hts) {
      damage = 0;
      s.resources.data_stored_mb *= 1 - this.param("cme_hts_data_loss");
    } else if (choice === "nanobots") {
      damage = 5;
      s.nanobot_reserve_pct = Math.max(
        0,
        (s.nanobot_reserve_pct ?? 0) - this.param("cme_nanobot_reserve_cost_pct"),
      );
    } else if (choice === "assistant") {
      damage = this.rng() < this.param("cme_assistant_success") ? 5 : full;
    } else if (choice === "safe-mode") {
      damage = this.param("cme_safe_mode_damage_pct");
      s.attitude = "shield-to-sun";
      s.radiators_shaded = true;
      this.safeModeUntil = this.t + this.param("cme_safe_mode_duration_s");
    }
    this.cmeOutcome = choice;
    s.hull_durability_pct = (s.hull_durability_pct ?? 100) - damage;
    this.info(
      choice === "timeout"
        ? this.L(
            `La CME golpeó sin respuesta: casco −${damage} %.`,
            `The CME hit with no response: hull −${damage} %.`,
          )
        : this.L(
            `CME resuelta (${this.cmeLabel(choice)}): casco −${damage} %.`,
            `CME resolved (${this.cmeLabel(choice)}): hull −${damage} %.`,
          ),
      damage >= full ? "failure" : "info",
      "level3:cme-resolved",
    );
    if ((s.hull_durability_pct ?? 0) <= 0)
      this.fail(
        this.L("El casco cedió tras la CME.", "The hull gave way after the CME."),
        "level3:hull-lost",
      );
  }

  /** Nombre de cada respuesta a la CME, para las opciones, el registro y el informe. */
  private cmeLabel(choice: string): string {
    switch (choice) {
      case "hts":
        return this.L("Sobrecargar el campo HTS", "Overload the HTS field");
      case "nanobots":
        return this.L("Inyectar nanobots", "Inject nanobots");
      case "assistant":
        return this.L("Delegar al asistente de misión", "Delegate to the mission assistant");
      case "safe-mode":
        return this.L("Modo seguro", "Safe mode");
      case "timeout":
        return this.L("sin respuesta", "no response");
      default:
        return choice;
    }
  }

  private leaveEncounter(): void {
    const s = this.state;
    s.phase = "exit";
    this.info(
      this.L("Salida del encuentro: de vuelta a 0.25 AU.", "Leaving the encounter: back at 0.25 AU."),
      "info",
      "level3:encounter-end",
    );
    if (this.chosen("science")?.id === "sensors-capsule") {
      const text = this.L(
        "⚗ Ventana de eyección: separar el módulo y liberar la cápsula de 450 kg.",
        "⚗ Ejection window: separate the module and release the 450 kg capsule.",
      );
      this.emit("crisis", text, {
        trigger: "level3:ejection",
        deadline_s: this.t + this.param("ejection_window_s"),
        choices: [
          {
            id: "eject",
            label: this.L("Eyectar módulo", "Eject module"),
            detail: this.L("La cápsula vuelve con las muestras.", "The capsule returns with the samples."),
            origin: "theoretical",
          },
          {
            id: "hold",
            label: this.L("Conservar el módulo", "Keep the module"),
            detail: this.L("La cápsula se queda a bordo.", "The capsule stays on board."),
            origin: "theoretical",
          },
        ],
      });
    } else {
      this.finish();
    }
  }

  private resolveEjection(choice: string): void {
    this.capsuleRecovered = choice === "eject";
    this.info(
      this.capsuleRecovered
        ? this.L(
            "⚗ Cápsula liberada en trayectoria de retorno.",
            "⚗ Capsule released on a return trajectory.",
          )
        : this.L("La cápsula no se liberó.", "The capsule was not released."),
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
    const limit =
      this.energy() === "stirling"
        ? value(paper, "stirling_cold_end_limit_c")
        : value(paper, "cell_design_limit_c");
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
    if (this.failureReason)
      causes.push({ text: this.failureReason, segment: "space", origin: "theoretical" });
    if (this.encounterStart === 0 && !this.failureReason) {
      causes.push({
        text: this.L(
          "La misión no llegó al encuentro solar.",
          "The mission did not reach the solar encounter.",
        ),
        segment: "launch",
        origin: "theoretical",
      });
    }
    if (this.encounterStart > 0) {
      causes.push(
        reachedTarget
          ? {
              text: this.L(
                `Perihelio de ${target} R☉ alcanzado, como en el diseño de Solar Probe+.`,
                `${target} R☉ perihelion reached, as in the Solar Probe+ design.`,
              ),
              source: sourceOf(paper, "perihelion_rsun"),
              segment: "space",
              origin: "real",
            }
          : {
              text: this.L(
                `El perihelio quedó en ${s.perihelion_rsun} R☉: faltaron sobrevuelos de Venus para bajar a ${target} R☉.`,
                `The perihelion stayed at ${s.perihelion_rsun} R☉: more Venus flybys were needed to get down to ${target} R☉.`,
              ),
              source: sourceOf(paper, "venus_flybys"),
              segment: "space",
              origin: "real",
            },
      );
      const parker = this.param("parker_record_rsun");
      if (this.minDistanceRsun < parker) {
        causes.push({
          text: this.L(
            `¡Récord histórico! ${round(this.minDistanceRsun, 2)} R☉: más cerca del Sol que Parker Solar Probe (${parker} R☉).`,
            `Historic record! ${round(this.minDistanceRsun, 2)} R☉: closer to the Sun than Parker Solar Probe (${parker} R☉).`,
          ),
          source: this.paramSource("parker_record_rsun"),
          segment: "user",
          origin: "real",
        });
      }
      if (this.dived) {
        causes.push({
          text: this.L(
            `⚗ Cómo se logró: el mini reactor dio ${Math.round(this.reactorEnergy_wh)} Wh donde ningún panel sobrevive; el campo HTS desvió ${round(this.erosionBlocked, 1)} % de desgaste del casco y los nanobots repararon ${round(this.nanobotRepaired, 1)} %.`,
            `⚗ How it was done: the mini reactor supplied ${Math.round(this.reactorEnergy_wh)} Wh where no panel survives; the HTS field deflected ${round(this.erosionBlocked, 1)}% of hull wear and the nanobots repaired ${round(this.nanobotRepaired, 1)}%.`,
          ),
          segment: "space",
          origin: "theoretical",
        });
      }
      if (this.secondsDegrading > 0) {
        causes.push({
          text: this.L(
            `Las celdas pasaron ~350 °C durante ${Math.round(this.secondsDegrading / 60)} min: degradación irreversible.`,
            `The cells exceeded ~350 °C for ${Math.round(this.secondsDegrading / 60)} min: irreversible degradation.`,
          ),
          source: sourceOf(paper, "cell_degradation_c"),
          segment: "space",
          origin: "real",
        });
      } else if (this.secondsOverCellLimit > 0) {
        causes.push({
          text: this.L(
            `Las celdas superaron el límite de diseño durante ${Math.round(this.secondsOverCellLimit / 60)} min.`,
            `The cells exceeded the design limit for ${Math.round(this.secondsOverCellLimit / 60)} min.`,
          ),
          source: sourceOf(paper, "cell_design_limit_c"),
          segment: "space",
          origin: "real",
        });
      } else {
        causes.push({
          text: this.L(
            "Las celdas se mantuvieron bajo el límite de diseño todo el encuentro.",
            "The cells stayed below the design limit for the whole encounter.",
          ),
          source: sourceOf(paper, "cell_design_limit_c"),
          segment: "space",
          origin: "real",
        });
      }
      if (this.minPower < value(paper, "min_power_w")) {
        causes.push({
          text: this.L(
            `La potencia bajó a ${Math.round(this.minPower)} W, por debajo de los ${value(paper, "min_power_w")} W requeridos.`,
            `Power dropped to ${Math.round(this.minPower)} W, below the required ${value(paper, "min_power_w")} W.`,
          ),
          source: sourceOf(paper, "min_power_w"),
          segment: "space",
          origin: "real",
        });
      }
      if (this.mainArrayLost) {
        causes.push({
          text: this.L(
            "La matriz principal no se plegó a tiempo y se destruyó.",
            "The main array was not folded in time and was destroyed.",
          ),
          source: sourceOf(paper, "main_array_limit_au"),
          segment: "space",
          origin: "real",
        });
      }
      if (this.stirlingFailed) {
        causes.push({
          text: this.L(
            "El convertidor Stirling falló: el paper lo descarta por falta de herencia de vuelo.",
            "The Stirling converter failed: the paper rules it out for lack of flight heritage.",
          ),
          source: sourceOf(paper, "stirling_system_efficiency"),
          segment: "space",
          origin: "real",
        });
      }
      if (this.cmeOutcome) {
        causes.push({
          text: this.L(
            `Respuesta a la CME: ${this.cmeLabel(this.cmeOutcome)}.`,
            `CME response: ${this.cmeLabel(this.cmeOutcome)}.`,
          ),
          segment: "ground",
          origin: "theoretical",
        });
      }
      causes.push({
        text:
          data >= goal
            ? this.L(
                `Ciencia: ${Math.round(data)} MB reunidos, sobre la meta de ${goal} MB.`,
                `Science: ${Math.round(data)} MB collected, above the ${goal} MB goal.`,
              )
            : this.L(
                `Ciencia: ${Math.round(data)} MB de ${goal} MB.`,
                `Science: ${Math.round(data)} MB of ${goal} MB.`,
              ),
        segment: "user",
        origin: "theoretical",
      });
    }

    const advice: string[] = [];
    if (!reachedTarget)
      advice.push(
        this.L(
          "Ejecuta las tres ventanas de Venus: cada sobrevuelo baja el perihelio.",
          "Execute all three Venus windows: each flyby lowers the perihelion.",
        ),
      );
    if (this.secondsOverCellLimit > 0 || this.secondsDegrading > 0)
      advice.push(
        this.L(
          "Retrae la matriz secundaria al acercarte: en perihelio solo ~34 cm² iluminados bastan (paper, p. 7-8).",
          "Retract the secondary array as you get closer: at perihelion only ~34 cm² illuminated is enough (paper, p. 7-8).",
        ),
      );
    if (this.minPower < value(paper, "min_power_w"))
      advice.push(
        this.L(
          "No retraigas de más: la potencia debe quedar sobre 482 W.",
          "Do not over-retract: power must stay above 482 W.",
        ),
      );
    if (this.mainArrayLost)
      advice.push(
        this.L(
          "Pliega la matriz principal antes de ~0.13 AU o inclínala hasta 74°.",
          "Fold the main array before ~0.13 AU or tilt it up to 74°.",
        ),
      );
    if (data < goal)
      advice.push(
        this.L(
          "Baja datos lejos del Sol, cuando girar la antena cuesta poco calor.",
          "Downlink data far from the Sun, when turning the antenna costs little heat.",
        ),
      );

    const score = Math.round(
      (outcome === "failure" ? 0 : 3000) +
        (reachedTarget ? 2500 : 0) +
        Math.min(1, data / goal) * 2500 +
        (s.hull_durability_pct ?? 0) * 10 +
        (this.capsuleRecovered ? 1000 : 0) +
        (this.minDistanceRsun < this.param("parker_record_rsun") ? 1000 : 0) +
        (this.dived && outcome !== "failure" ? 3000 : 0) -
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
        historical_record_broken: this.minDistanceRsun < this.param("parker_record_rsun"),
        ikaros_dive: this.dived,
        hts_blocked_pct: round(this.erosionBlocked, 1),
        hull_eroded_pct: round(this.erosion, 1),
        nanobot_repaired_pct: round(this.nanobotRepaired, 1),
        reactor_energy_wh: Math.round(this.reactorEnergy_wh),
      },
      comparisons: [
        {
          mission: "Parker Solar Probe",
          metric: this.L("Distancia mínima", "Closest distance"),
          ours: Number.isFinite(this.minDistanceRsun) ? `${round(this.minDistanceRsun, 2)} R☉` : "—",
          theirs: `${value(missions, "parker_perihelion_rsun")} R☉`,
          source: sourceOf(missions, "parker_perihelion_rsun"),
        },
        {
          mission: "Parker Solar Probe",
          metric: this.L("Velocidad máxima", "Top speed"),
          ours: `${round(this.maxSpeed, 1)} km/s`,
          theirs: `${value(missions, "parker_max_speed_km_s")} km/s`,
          source: sourceOf(missions, "parker_max_speed_km_s"),
        },
        {
          mission: "Parker Solar Probe",
          metric: this.L("Sobrevuelos de Venus", "Venus flybys"),
          ours: this.L(`${s.venus_flybys_done ?? 0} (abreviado)`, `${s.venus_flybys_done ?? 0} (shortened)`),
          theirs: `${value(missions, "parker_venus_flybys")}`,
          source: sourceOf(missions, "parker_venus_flybys"),
        },
        {
          mission: this.L("Solar Probe+ (diseño 2008)", "Solar Probe+ (2008 design)"),
          metric: this.L("Potencia mínima en el encuentro", "Minimum power in the encounter"),
          ours: Number.isFinite(this.minPower) ? `${Math.round(this.minPower)} W` : "—",
          theirs: this.L(
            `${value(paper, "min_power_w")} W requeridos`,
            `${value(paper, "min_power_w")} W required`,
          ),
          source: sourceOf(paper, "min_power_w"),
        },
      ],
    };
  }
}
