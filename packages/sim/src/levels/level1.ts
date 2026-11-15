import type { MissionReport, PlayerAction, SimState, Vec3 } from "@ikaros/contracts";
import { C, missions, sourceOf, value } from "../data";
import {
  HOHMANN_MAX_RAISE,
  hohmannDeltaV,
  hohmannTarget,
  hohmannTime,
  propellantFor,
  rocketDeltaV,
} from "../physics";
import type { Lang } from "../data";
import { Level, round } from "./base";

interface Transfer {
  r1_km: number;
  r2_km: number;
  start_s: number;
  end_s: number;
  /** Ángulo de la nave al encender, rad. */
  from_rad: number;
}

const MIN_ALTITUDE_KM = 150;
/** Margen de altitud para dar por alcanzada la órbita de la ISS, km. */
const ALTITUDE_MATCH_KM = 1;
const TAU = 2 * Math.PI;

/** Lleva un ángulo a (-π, π]. */
export function wrapAngle(a: number): number {
  const w = ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return w === -Math.PI ? Math.PI : w;
}

const meanMotion = (r_km: number) => Math.sqrt(C.muEarth / (r_km * r_km * r_km));

/**
 * Adelanto que debe llevar el objetivo para que una transferencia de Hohmann de r1 a r2
 * llegue justo a su lado, rad: π menos lo que avanza el objetivo durante la media elipse.
 */
export function hohmannLead(r1_km: number, r2_km: number): number {
  return Math.PI - meanMotion(r2_km) * hohmannTime(C.muEarth, r1_km, r2_km);
}

/**
 * Δv para cerrar una separación a lo largo de la órbita en `orbits` vueltas, m/s.
 * Clohessy-Wiltshire: un cambio de semieje Δa deriva 3πΔa por vuelta y cuesta n·Δa/2 por encendido.
 */
export function phasingDeltaV(separation_m: number, r_km: number, orbits = 1): number {
  return (meanMotion(r_km) * Math.abs(separation_m)) / (3 * Math.PI * orbits);
}

/** Posición en la elipse de transferencia, por la ecuación de Kepler. */
function transferPoint(tr: Transfer, f: number): { r_km: number; angle: number } {
  const up = tr.r2_km >= tr.r1_km;
  const a = (tr.r1_km + tr.r2_km) / 2;
  const e = Math.abs(tr.r2_km - tr.r1_km) / (tr.r1_km + tr.r2_km);
  const M = (up ? 0 : Math.PI) + Math.PI * f;
  let E = M;
  for (let i = 0; i < 20; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  return { r_km: a * (1 - e * Math.cos(E)), angle: tr.from_rad + nu - (up ? 0 : Math.PI) };
}

/**
 * Nivel 1: encuentro y acople con la ISS. Persecución en órbita (Hohmann con el adelanto justo),
 * aproximación final automática y pilotaje manual desde 122 m con las ecuaciones de Clohessy-Wiltshire.
 */
export class Level1 extends Level {
  private fuel_kg = 0;
  private theta = 0;
  private thetaIss = 0;
  private transfer: Transfer | null = null;
  private rendezvous: { start_s: number; end_s: number; sep_rad: number } | null = null;
  private pos: Vec3 = { x: 0, y: 0, z: 0 };
  private vel: Vec3 = { x: 0, y: 0, z: 0 };
  private outsideSince: number | null = null;
  private docked = false;
  private burns = 0;
  private pulses = 0;
  private terminalDv = 0;
  private arrivalMiss_km: number | null = null;
  private contact: { speed: number; lateral: number } | null = null;
  private failureReason: string | null = null;
  private launchedAt = 0;
  private approachStart: { t: number; fuel_kg: number } | null = null;
  private dockedAt: number | null = null;

  constructor(seed: number, lang: Lang = "es") {
    super("level1-repair", seed, lang);
    // Los campos de la subclase se inicializan después de super(): se ajustan aquí.
    this.fuel_kg = this.param("propellant_kg");
    this.thetaIss = (this.param("start_lead_deg") * Math.PI) / 180;
    this.refresh();
  }

  protected initialState(): SimState {
    const s: SimState = {
      scenario: "level1-repair",
      resources: {
        mass_kg: 0,
        power_generated_w: 0,
        power_consumed_w: 0,
        budget_usd_m: 0,
        data_stored_mb: 0,
        downlink_rate_kbps: 0,
        mission_elapsed_s: 0,
      },
      health: "nominal",
      phase: "hangar",
      events: [],
      selected: {},
      mass_capacity_kg: this.param("cargo_capacity_kg"),
      altitude_km: this.param("start_altitude_km"),
      target_altitude_km: this.param("iss_altitude_km"),
      inclination_deg: this.param("iss_inclination_deg"),
      fuel_capacity_kg: this.param("propellant_kg"),
      fuel_reserve_kg: this.param("reserve_kg"),
      rcs_assist: true,
      in_corridor: true,
      in_daylight: true,
    };
    this.state = s;
    this.info(this.def.subtitle, "info", "level1:start");
    return s;
  }

  // Masa y combustible

  private cargoMass(): number {
    return this.chosenAll().reduce((m, c) => m + c.mass_kg, 0);
  }

  private totalMass(): number {
    return this.param("orbiter_mass_kg") + this.cargoMass() + this.fuel_kg;
  }

  /** Δv que queda con todo el combustible, m/s. */
  private deltaVLeft(): number {
    const m0 = this.totalMass();
    return rocketDeltaV(this.param("isp_s"), m0, m0 - this.fuel_kg);
  }

  /** Δv que queda antes de tocar la reserva, m/s. */
  private deltaVUsable(): number {
    const spare = this.fuel_kg - this.param("reserve_kg");
    if (spare <= 0) return 0;
    const m0 = this.totalMass();
    return rocketDeltaV(this.param("isp_s"), m0, m0 - spare);
  }

  private spend(dv_m_s: number): void {
    this.fuel_kg = Math.max(0, this.fuel_kg - propellantFor(this.param("isp_s"), this.totalMass(), dv_m_s));
  }

  private get rIss(): number {
    return C.earthRadius + this.param("iss_altitude_km");
  }

  private refresh(): void {
    const s = this.state;
    s.fuel_kg = round(this.fuel_kg, 1);
    s.resources.mass_kg = round(this.totalMass(), 0);
    s.delta_v_remaining_m_s = round(this.deltaVUsable(), 2);
    const r = C.earthRadius + (s.altitude_km ?? 0);
    s.orbit_angle_deg = (this.theta * 180) / Math.PI;
    s.target_orbit_angle_deg = (this.thetaIss * 180) / Math.PI;
    const lead = wrapAngle(this.thetaIss - this.theta);
    s.target_lead_deg = round((lead * 180) / Math.PI, 3);
    s.separation_km = round(lead * this.rIss, 2);
    s.ideal_lead_deg = round((hohmannLead(r, this.rIss) * 180) / Math.PI, 3);
    // Sombra de la Tierra: el Sol está en el ángulo 0 del plano orbital.
    s.in_daylight = Math.abs(wrapAngle(this.theta - Math.PI)) > Math.asin(C.earthRadius / r);
    if (s.phase === "approach") {
      s.rel_position_m = { ...this.pos };
      s.rel_velocity_m_s = { ...this.vel };
    }
  }

  protected onSelectionChanged(): void {
    this.refresh();
  }

  // Acciones

  protected onAction(action: PlayerAction): void {
    if (action.type === "launch") return this.launch();
    if (action.type === "burn") return this.burn(action.delta_v_m_s);
    if (action.type === "rcs") return this.rcs(action);
    if (action.type === "set-assist") {
      this.state.rcs_assist = action.on;
      return;
    }
  }

  private launch(): void {
    if (this.state.phase !== "hangar") return;
    const cargo = this.cargoMass();
    const cap = this.param("cargo_capacity_kg");
    if (cargo > cap) {
      this.info(
        this.L(
          `Despegue bloqueado: la carga pesa ${round(cargo, 0)} kg y el máximo es ${cap} kg.`,
          `Launch blocked: the cargo weighs ${round(cargo, 0)} kg and the maximum is ${cap} kg.`,
        ),
        "warning",
        "level1:overweight",
      );
      return;
    }
    this.state.phase = "phasing";
    this.launchedAt = this.t;
    this.info(
      this.L(
        `En órbita de persecución. La ISS va ${round(this.param("start_lead_deg"), 0)}° por delante. Δv útil: ${round(this.deltaVUsable())} m/s.`,
        `In chase orbit. The ISS is ${round(this.param("start_lead_deg"), 0)}° ahead. Usable Δv: ${round(this.deltaVUsable())} m/s.`,
      ),
      "info",
      "level1:launch",
    );
    this.refresh();
  }

  private burn(dv_m_s: number): void {
    if (this.state.phase !== "phasing" || this.transfer) return;
    if (!Number.isFinite(dv_m_s) || dv_m_s === 0) return;
    const r1 = C.earthRadius + (this.state.altitude_km ?? 0);
    // Límites de la maniobra: no bajar de 150 km (atmósfera) ni subir más allá del rango de hohmannTarget.
    const bound = dv_m_s > 0 ? r1 * HOHMANN_MAX_RAISE : Math.min(r1, C.earthRadius + MIN_ALTITUDE_KM);
    const reachable = hohmannDeltaV(C.muEarth, r1, bound) * 1000;
    const dv = Math.sign(dv_m_s) * Math.min(Math.abs(dv_m_s), this.deltaVLeft(), reachable);
    if (Math.abs(dv) < 1e-6) {
      this.info(
        this.L("Sin combustible para la maniobra.", "No fuel for the maneuver."),
        "warning",
        "level1:no-fuel",
      );
      return;
    }
    this.spend(dv);
    const r2 = hohmannTarget(C.muEarth, r1, dv / 1000);
    this.transfer = {
      r1_km: r1,
      r2_km: r2,
      start_s: this.t,
      end_s: this.t + hohmannTime(C.muEarth, r1, r2),
      from_rad: this.theta,
    };
    this.burns++;
    this.info(
      this.L(
        `Encendido de ${round(dv, 1)} m/s. Media vuelta hasta ${round(r2 - C.earthRadius)} km.`,
        `Burn of ${round(dv, 1)} m/s. Half an orbit up to ${round(r2 - C.earthRadius)} km.`,
      ),
      "info",
      "level1:burn",
    );
    this.refresh();
    this.checkReserve();
  }

  private rcs(a: { x: number; y: number; z: number }): void {
    if (this.state.phase !== "approach") return;
    const lim = (v: number) => Math.max(-0.5, Math.min(0.5, v));
    const dv = { x: lim(a.x), y: lim(a.y), z: lim(a.z) };
    const mag = Math.hypot(dv.x, dv.y, dv.z);
    if (mag === 0) return;
    this.spend(mag);
    this.vel.x += dv.x;
    this.vel.y += dv.y;
    this.vel.z += dv.z;
    this.pulses++;
    this.refresh();
    this.checkReserve();
  }

  // Tiempo

  protected substep(): number {
    return this.state.phase === "approach" ? 0.5 : 20;
  }

  protected tick(dt: number): void {
    const s = this.state;
    const wasLit = s.in_daylight;
    this.thetaIss += meanMotion(this.rIss) * dt;

    if (s.phase === "phasing") this.tickPhasing(dt);
    else if (s.phase === "rendezvous") this.tickRendezvous();
    else if (s.phase === "approach") this.tickApproach(dt);

    if (this.finished) return;
    this.refresh();
    if (s.phase === "approach" && wasLit !== s.in_daylight) {
      this.info(
        s.in_daylight
          ? this.L("Amanecer orbital: vuelve la luz.", "Orbital sunrise: the light is back.")
          : this.L(
              "Noche orbital: solo las luces de la estación.",
              "Orbital night: only the station lights.",
            ),
        "info",
        s.in_daylight ? "level1:sunrise" : "level1:sunset",
      );
    }
    if (this.t - this.launchedAt >= this.param("time_limit_s")) {
      const h = round(this.param("time_limit_s") / 3600, 0);
      this.fail(
        this.L(
          `Se cerró la ventana de acople: pasaron ${h} h.`,
          `The docking window closed: ${h} h went by.`,
        ),
        "level1:timeout",
      );
      return;
    }
    const low = this.fuel_kg < this.param("reserve_kg") * 1.5;
    s.health = low || !s.in_corridor ? "warning" : "nominal";
  }

  private tickPhasing(dt: number): void {
    const s = this.state;
    const tr = this.transfer;
    if (!tr) {
      this.theta += meanMotion(C.earthRadius + (s.altitude_km ?? 0)) * dt;
      return;
    }
    const f = Math.min(1, (this.t - tr.start_s) / (tr.end_s - tr.start_s));
    const p = transferPoint(tr, f);
    this.theta = p.angle;
    s.altitude_km = p.r_km - C.earthRadius;
    if (f >= 1) {
      this.transfer = null;
      s.altitude_km = tr.r2_km - C.earthRadius;
      // El subpaso puede pasarse del final de la media elipse: ese resto ya es órbita circular.
      this.theta = tr.from_rad + Math.PI + meanMotion(tr.r2_km) * (this.t - tr.end_s);
      this.arrive();
    }
  }

  /** Fin de una transferencia: ¿quedó la nave lo bastante cerca de la ISS? */
  private arrive(): void {
    const s = this.state;
    const altMiss = (s.altitude_km ?? 0) - this.param("iss_altitude_km");
    const sep_m = wrapAngle(this.thetaIss - this.theta) * this.rIss * 1000;
    const sep_km = Math.abs(sep_m) / 1000;
    if (Math.abs(altMiss) <= ALTITUDE_MATCH_KM && sep_km <= this.param("rendezvous_window_km")) {
      s.altitude_km = this.param("iss_altitude_km");
      this.arrivalMiss_km = sep_km;
      this.terminalDv = phasingDeltaV(sep_m, this.rIss);
      const before = this.fuel_kg;
      this.spend(this.terminalDv);
      if (this.fuel_kg < this.param("reserve_kg")) {
        // Explica la causa: no es el pilotaje, es lo que costó cerrar la distancia de llegada.
        this.fail(
          this.L(
            `Llegaste a ${round(sep_km)} km de la ISS: cerrar esa distancia gastó ${round(before - this.fuel_kg, 0)} kg y te dejó bajo la reserva. Enciende más cerca del momento justo o lleva menos carga.`,
            `You arrived ${round(sep_km)} km from the ISS: closing that gap used ${round(before - this.fuel_kg, 0)} kg and left you below the reserve. Burn closer to the right moment or carry less cargo.`,
          ),
          "level1:bingo",
        );
        return;
      }
      const period = TAU / meanMotion(this.rIss);
      this.rendezvous = { start_s: this.t, end_s: this.t + period, sep_rad: sep_m / 1000 / this.rIss };
      s.rendezvous_end_s = this.t + period;
      s.phase = "rendezvous";
      this.info(
        this.L(
          `Encuentro a ${round(sep_km)} km de la ISS. La aproximación final gasta ${round(this.terminalDv, 1)} m/s y dura una vuelta.`,
          `Rendezvous ${round(sep_km)} km from the ISS. The final approach costs ${round(this.terminalDv, 1)} m/s and takes one orbit.`,
        ),
        "info",
        "level1:rendezvous",
      );
      this.checkReserve();
      return;
    }
    const where =
      Math.abs(altMiss) > ALTITUDE_MATCH_KM
        ? this.L(
            `Quedaste a ${round(Math.abs(altMiss))} km de la altitud de la ISS.`,
            `You ended ${round(Math.abs(altMiss))} km off the ISS altitude.`,
          )
        : sep_m > 0
          ? this.L(
              `Llegaste a la altitud justa, pero ${round(sep_km, 0)} km por detrás: encendiste demasiado pronto.`,
              `Right altitude, but ${round(sep_km, 0)} km behind: you burned too early.`,
            )
          : this.L(
              `Llegaste a la altitud justa, pero ${round(sep_km, 0)} km por delante: encendiste demasiado tarde.`,
              `Right altitude, but ${round(sep_km, 0)} km ahead: you burned too late.`,
            );
    this.arrivalMiss_km = sep_km;
    // Para volver a intentarlo hay que bajar a la órbita de persecución y subir otra vez.
    const retry =
      2 * hohmannDeltaV(C.muEarth, C.earthRadius + this.param("start_altitude_km"), this.rIss) * 1000;
    if (this.deltaVUsable() < retry) {
      this.fail(
        `${where} ${this.L(
          "No queda combustible para bajar y perseguirla otra vez.",
          "There is not enough fuel to drop down and chase it again.",
        )}`,
        "level1:miss-fuel",
      );
      return;
    }
    this.info(where, "warning", "level1:miss");
  }

  private tickRendezvous(): void {
    const rv = this.rendezvous;
    if (!rv) return;
    const f = Math.min(1, (this.t - rv.start_s) / (rv.end_s - rv.start_s));
    // La separación se cierra de forma suave; al final la nave queda en el punto de espera.
    this.theta = this.thetaIss - rv.sep_rad * (1 - (0.5 - Math.cos(Math.PI * f) / 2));
    if (f >= 1) this.startApproach();
  }

  private startApproach(): void {
    const off = this.param("start_offset_m");
    const rnd = () => (this.rng() * 2 - 1) * off;
    this.pos = { x: this.param("hold_point_m"), y: rnd(), z: rnd() };
    this.vel = { x: 0, y: 0, z: 0 };
    this.theta = this.thetaIss;
    this.rendezvous = null;
    this.state.rendezvous_end_s = undefined;
    this.state.phase = "approach";
    this.approachStart = { t: this.t, fuel_kg: this.fuel_kg };
    this.state.approach_deadline_s = this.t + this.param("approach_window_s");
    this.info(
      this.L(
        `Punto de espera a ${round(this.pos.x, 0)} m delante del puerto. Ahora pilotas tú.`,
        `Hold point ${round(this.pos.x, 0)} m in front of the port. You have the controls.`,
      ),
      "info",
      "level1:approach",
    );
  }

  private tickApproach(dt: number): void {
    const s = this.state;
    this.theta = this.thetaIss;
    const n = meanMotion(this.rIss);
    const { pos: p, vel: v } = this;
    // Clohessy-Wiltshire con x a lo largo de la órbita (eje V), y radial (eje R) y z fuera del plano.
    const a = { x: -2 * n * v.y, y: 3 * n * n * p.y + 2 * n * v.x, z: -n * n * p.z };
    // Mantener la nave junto a la estación (actitud, correcciones pequeñas) gasta combustible
    // cada minuto: demorarse cuesta.
    this.fuel_kg = Math.max(0, this.fuel_kg - (this.param("stationkeeping_kg_min") / 60) * dt);
    if (this.t >= (s.approach_deadline_s ?? Infinity)) {
      this.fail(
        this.L(
          "Se acabó la ventana de acercamiento: la ISS ordena retirarse.",
          "The approach window ran out: the ISS orders you to back away.",
        ),
        "level1:approach-timeout",
      );
      return;
    }
    if (s.rcs_assist) {
      // La compensación anula la deriva, pero cada m/s que corrige sale del mismo tanque.
      this.spend(Math.hypot(a.x, a.y, a.z) * dt);
    } else {
      v.x += a.x * dt;
      v.y += a.y * dt;
      v.z += a.z * dt;
    }
    const prevX = p.x;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    if (prevX > 0 && p.x <= 0) {
      this.touch();
      if (this.finished) return;
    }

    const lateral = Math.hypot(p.y, p.z);
    const cone = Math.max(0, p.x) * Math.tan((this.param("corridor_half_angle_deg") * Math.PI) / 180) + 1;
    const inside = p.x > 0 && lateral <= cone;
    s.in_corridor = inside;
    if (inside) this.outsideSince = null;
    else {
      if (this.outsideSince === null) {
        this.outsideSince = this.t;
        this.info(
          this.L(
            "Fuera del corredor de aproximación. Vuelve al eje o la ISS ordenará abortar.",
            "Outside the approach corridor. Get back on the axis or the ISS will call an abort.",
          ),
          "warning",
          "level1:corridor-warn",
        );
      }
      if (this.t - this.outsideSince >= this.param("corridor_grace_s")) {
        this.fail(
          this.L(
            "Aborto: saliste del corredor de aproximación dentro de la esfera de exclusión.",
            "Abort: you left the approach corridor inside the keep-out sphere.",
          ),
          "level1:corridor",
        );
        return;
      }
    }
    if (Math.hypot(p.x, p.y, p.z) > this.param("max_range_m")) {
      this.fail(
        this.L(
          "Aborto: te alejaste demasiado de la estación.",
          "Abort: you drifted too far from the station.",
        ),
        "level1:drift",
      );
      return;
    }
    this.checkReserve();
  }

  /** La nave cruza el plano del puerto: acople, choque o pasa de largo. */
  private touch(): void {
    const lateral = Math.hypot(this.pos.y, this.pos.z);
    const speed = -this.vel.x;
    if (lateral <= this.param("station_radius_m")) {
      this.contact = { speed, lateral };
      this.pos.x = 0;
    }
    if (lateral <= this.param("capture_radius_m") && speed <= this.param("contact_speed_max_m_s")) {
      this.docked = true;
      this.dockedAt = this.t;
      this.vel = { x: 0, y: 0, z: 0 };
      this.state.rel_position_m = { ...this.pos };
      this.state.rel_velocity_m_s = { ...this.vel };
      this.info(
        this.L(
          `¡Captura! Contacto a ${round(speed * 100, 1)} cm/s, ${round(lateral * 100, 0)} cm del centro.`,
          `Capture! Contact at ${round(speed * 100, 1)} cm/s, ${round(lateral * 100, 0)} cm off center.`,
        ),
        "info",
        "level1:docked",
      );
      this.info(
        this.L(
          "Escotillas abiertas: la carga pasa a la estación.",
          "Hatches open: the cargo moves to the station.",
        ),
        "info",
        "level1:complete",
      );
      this.refresh();
      this.finish();
      return;
    }
    if (lateral <= this.param("station_radius_m")) {
      const why =
        lateral > this.param("capture_radius_m")
          ? this.L(
              `Choque: llegaste ${round(lateral, 1)} m fuera del centro del puerto.`,
              `Collision: you arrived ${round(lateral, 1)} m off the port center.`,
            )
          : this.L(
              `Choque: tocaste a ${round(speed, 2)} m/s. El transbordador lo hacía a ${value(missions, "shuttle_contact_speed_m_s")} m/s.`,
              `Collision: you touched at ${round(speed, 2)} m/s. The shuttle did it at ${value(missions, "shuttle_contact_speed_m_s")} m/s.`,
            );
      this.fail(why, "level1:collision");
    }
  }

  private checkReserve(): void {
    if (this.finished || this.fuel_kg >= this.param("reserve_kg")) return;
    this.fail(
      this.L(
        "Aborto: el combustible bajó de la reserva. Sin ella no hay forma segura de alejarse.",
        "Abort: fuel dropped below the reserve. Without it there is no safe way to back away.",
      ),
      "level1:bingo",
    );
  }

  private fail(reason: string, trigger: string): void {
    if (this.finished) return;
    this.failureReason = reason;
    this.info(reason, "failure", trigger);
    this.state.health = "critical";
    this.refresh();
    this.finish();
  }

  // Informe

  report(): MissionReport {
    const cargo = this.cargoMass();
    const delivered = this.docked ? cargo : 0;
    const kit = Boolean(this.chosen("repair"));
    const outcome: MissionReport["outcome"] = !this.docked ? "failure" : cargo > 0 ? "success" : "partial";
    const causes: MissionReport["causes"] = [];
    if (this.failureReason)
      causes.push({ text: this.failureReason, segment: "space", origin: "theoretical" });
    if (this.docked) {
      causes.push({
        text: this.L(
          `Acople con ${round(delivered, 0)} kg de carga para la estación.`,
          `Docked with ${round(delivered, 0)} kg of cargo for the station.`,
        ),
        segment: "space",
        origin: "theoretical",
      });
      if (cargo === 0)
        causes.push({
          text: this.L(
            "Llegaste sin carga: la visita no le sirve de mucho a la tripulación.",
            "You arrived empty: the visit does little for the crew.",
          ),
          segment: "launch",
          origin: "theoretical",
        });
      if (kit)
        causes.push({
          text: this.L(
            "Con el kit a bordo, la tripulación puede coser el panel P6 como en la STS-120.",
            "With the kit on board, the crew can stitch the P6 array as on STS-120.",
          ),
          source: sourceOf(missions, "sts120_harmony_mass_kg"),
          segment: "user",
          origin: "real",
        });
    }
    const fuelLeft = this.fuel_kg;
    const spare = Math.max(0, fuelLeft - this.param("reserve_kg"));
    const softness = this.contact
      ? Math.max(0, 1 - Math.abs(this.contact.speed - this.param("contact_speed_real_m_s")) / 0.07)
      : 0;
    const approachTime = this.approachStart ? (this.dockedAt ?? this.t) - this.approachStart.t : 0;
    const approachFuel = this.approachStart ? this.approachStart.fuel_kg - fuelLeft : 0;
    const windowLeft = this.docked ? Math.max(0, this.param("approach_window_s") - approachTime) : 0;
    // Puntos por la carga, por el combustible que sobra, por llegar con tiempo y por un contacto suave.
    const score = this.docked
      ? Math.round(delivered * 0.2 + spare * 4 + windowLeft * 0.5 + softness * 1000)
      : 0;
    const advice: string[] = [];
    if ((this.arrivalMiss_km ?? 0) > 20)
      advice.push(
        this.L(
          "Enciende cuando la ISS vaya justo el adelanto indicado: cada km de error se paga en combustible.",
          "Burn when the ISS is exactly at the shown lead: every km of error is paid in fuel.",
        ),
      );
    if (this.failureReason && this.fuel_kg < this.param("reserve_kg") * 1.5)
      advice.push(
        this.L(
          "Sube menos carga o pilota con menos pulsos: todo sale del mismo tanque.",
          "Carry less cargo or fly with fewer pulses: everything comes out of one tank.",
        ),
      );
    if (this.state.events.some((e) => e.trigger === "level1:approach-timeout"))
      advice.push(
        this.L(
          "Acércate rápido mientras estás lejos y frena al final: cada minuto junto a la estación gasta combustible y tiempo.",
          "Close in fast while far away and slow down at the end: every minute near the station costs fuel and time.",
        ),
      );
    if (this.contact && this.contact.speed > this.param("contact_speed_max_m_s"))
      advice.push(
        this.L(
          "Frena antes de los últimos 10 m: el contacto real era de unos 3 cm/s.",
          "Slow down before the last 10 m: real contact was about 3 cm/s.",
        ),
      );
    const used = rocketDeltaV(
      this.param("isp_s"),
      this.param("orbiter_mass_kg") + cargo + this.param("propellant_kg"),
      this.totalMass(),
    );
    const ideal = hohmannDeltaV(C.muEarth, C.earthRadius + this.param("start_altitude_km"), this.rIss) * 1000;
    const comparisons: MissionReport["comparisons"] = [
      {
        mission: "STS-120 (Discovery, 2007)",
        metric: this.L("Carga entregada", "Cargo delivered"),
        ours: `${round(delivered, 0)} kg`,
        theirs: this.L(
          `${value(missions, "sts120_harmony_mass_kg")} kg (nodo Harmony)`,
          `${value(missions, "sts120_harmony_mass_kg")} kg (Harmony node)`,
        ),
        source: sourceOf(missions, "sts120_harmony_mass_kg"),
      },
    ];
    if (this.contact)
      comparisons.push({
        mission: this.L("Transbordador espacial", "Space Shuttle"),
        metric: this.L("Velocidad de contacto", "Contact speed"),
        ours: `${round(this.contact.speed, 3)} m/s`,
        theirs: `${value(missions, "shuttle_contact_speed_m_s")} m/s`,
        source: sourceOf(missions, "shuttle_contact_speed_m_s"),
      });
    return {
      scenario: "level1-repair",
      outcome,
      score,
      causes,
      advice,
      metrics: {
        docked: this.docked,
        cargo_delivered_kg: round(delivered, 0),
        repair_kit: kit && this.docked,
        fuel_left_kg: round(fuelLeft, 1),
        burns: this.burns,
        rcs_pulses: this.pulses,
        rendezvous_miss_km: this.arrivalMiss_km === null ? "—" : round(this.arrivalMiss_km, 1),
        terminal_dv_m_s: round(this.terminalDv, 2),
        delta_v_used_m_s: round(used, 1),
        delta_v_ideal_m_s: round(ideal, 1),
        approach_time_s: Math.round(approachTime),
        approach_fuel_kg: round(approachFuel, 1),
        approach_window_left_s: Math.round(windowLeft),
        contact_speed_m_s: this.contact ? round(this.contact.speed, 3) : "—",
        lateral_error_m: this.contact ? round(this.contact.lateral, 2) : "—",
        mission_elapsed_s: Math.round(this.t),
      },
      comparisons,
    };
  }
}
