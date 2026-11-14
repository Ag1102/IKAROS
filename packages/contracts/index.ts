// Contrato entre la simulación (packages/sim) y el cliente (apps/web).
// Solo tipos. Los cambios se avisan a la otra persona y van en un commit aparte.
// Unidades en el nombre del campo: _kg, _w, _km, _s, _c, _usd_m.

export type ScenarioId = "level1-repair" | "level2-leo" | "level3-ikaros";

/** Etiqueta de origen de cada dato: real (con cita) o teórico del juego. */
export type DataOrigin = "real" | "theoretical";

export interface Resources {
  mass_kg: number;
  power_generated_w: number;
  power_consumed_w: number;
  budget_usd_m: number;
  data_stored_mb: number;
  downlink_rate_kbps: number;
  mission_elapsed_s: number;
}

export type Health = "nominal" | "warning" | "critical";

export interface SimState {
  scenario: ScenarioId;
  resources: Resources;
  distance_to_sun_km?: number;
  cell_temperature_c?: number;
  hull_durability_pct?: number;
  health: Health;
  phase: string;
  events: SimEvent[];
}

export interface SimEvent {
  id: string;
  at_s: number;
  kind: "info" | "warning" | "failure" | "crisis";
  text: string;
  /** Clave de data/ o content/ con la fuente, si aplica. */
  source?: string;
}

export type PlayerAction =
  | { type: "set-time-scale"; value: number }
  | { type: "select-component"; slot: string; componentId: string }
  | { type: "launch" }
  | { type: "burn"; delta_v_m_s: number }
  | { type: "retract-array"; fraction: number }
  | { type: "resolve-event"; eventId: string; choice: string };

export interface Simulation {
  /** Carga un escenario definido en data/scenarios/. */
  load(scenario: ScenarioId, seed: number): SimState;
  /** Avanza la simulación dt_s segundos de misión. */
  step(dt_s: number): SimState;
  act(action: PlayerAction): SimState;
  report(): MissionReport;
}

export interface MissionReport {
  scenario: ScenarioId;
  outcome: "success" | "partial" | "failure";
  score: number;
  /** Causas del resultado, para el informe post-misión. */
  causes: { text: string; source?: string }[];
  metrics: Record<string, number | string | boolean>;
}
