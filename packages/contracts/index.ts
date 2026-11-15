// Contrato entre la simulación (packages/sim) y el cliente (apps/web).
// Solo tipos.
// Unidades en el nombre del campo: _kg, _w, _km, _s, _c, _usd_m.

export type ScenarioId = "level1-repair" | "level3-ikaros";

/** Etiqueta de origen de cada dato: real (con cita) o teórico del juego. */
export type DataOrigin = "real" | "theoretical";

/** Valor numérico tal como vive en data/: con unidad, fuente y origen. */
export interface SourcedValue<T = number> {
  value: T;
  unit: string;
  source: string;
  retrieved: string;
  origin: DataOrigin;
  note?: string;
}

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

/** Orientación de la nave en el nivel 3: escudo al Sol o antena a la Tierra. */
export type Attitude = "shield-to-sun" | "antenna-to-earth";

export interface SimState {
  scenario: ScenarioId;
  resources: Resources;
  distance_to_sun_km?: number;
  cell_temperature_c?: number;
  hull_durability_pct?: number;
  health: Health;
  phase: string;
  events: SimEvent[];

  /** Componente elegido por ranura (hangar). */
  selected?: Record<string, string>;
  /** Presupuesto que queda tras el hangar. */
  budget_remaining_usd_m?: number;
  /** Capacidad del lanzador elegido o del vehículo de servicio. */
  mass_capacity_kg?: number;
  battery_wh?: number;
  battery_capacity_wh?: number;
  delta_v_remaining_m_s?: number;

  // Nivel 1 (órbita terrestre)
  altitude_km?: number;
  target_altitude_km?: number;
  inclination_deg?: number;
  comm_window_open?: boolean;
  repair_progress_pct?: number;
  data_downlinked_mb?: number;

  // Nivel 1: encuentro y acople con la ISS
  /** Posición en la órbita, grados (0 = mediodía orbital). */
  orbit_angle_deg?: number;
  target_orbit_angle_deg?: number;
  /** Cuánto va la ISS por delante de la nave, grados (negativo = va por detrás). */
  target_lead_deg?: number;
  /** Adelanto que necesita una transferencia de Hohmann desde la altitud actual, grados. */
  ideal_lead_deg?: number;
  /** Distancia a lo largo de la órbita hasta la ISS, km (positivo = la ISS va delante). */
  separation_km?: number;
  fuel_kg?: number;
  fuel_capacity_kg?: number;
  /** Por debajo de esta cantidad la ISS ordena abortar el acople. */
  fuel_reserve_kg?: number;
  /** Posición relativa al puerto de acople, m: x adelante (eje V), y arriba (eje R), z a la derecha. */
  rel_position_m?: Vec3;
  rel_velocity_m_s?: Vec3;
  in_daylight?: boolean;
  /** Compensación automática de la deriva orbital durante el acercamiento. */
  rcs_assist?: boolean;
  /** true si la nave va dentro del corredor de aproximación. */
  in_corridor?: boolean;
  /** Fin de la fase automática de encuentro, s de misión. */
  rendezvous_end_s?: number;
  /** Hasta cuándo puede durar el acercamiento manual, s de misión. */
  approach_deadline_s?: number;

  // Nivel 3 (Ikaros)
  distance_to_sun_rsun?: number;
  distance_to_sun_au?: number;
  solar_intensity_suns?: number;
  perihelion_rsun?: number;
  venus_flybys_done?: number;
  speed_km_s?: number;
  /** 0 = matriz secundaria extendida, 1 = retraída tras el escudo. */
  array_retraction?: number;
  array_illuminated_cm2?: number;
  array_tilt_deg?: number;
  main_array_stowed?: boolean;
  main_array_temperature_c?: number;
  radiator_temperature_c?: number;
  attitude?: Attitude;
  radiators_shaded?: boolean;
  power_load_w?: number;
  nanobot_reserve_pct?: number;
  /** ⚗ Estado de los sistemas teóricos (true = encendido). */
  systems?: Partial<Record<IkarosSystem, boolean>>;
}

export interface EventChoice {
  id: string;
  label: string;
  detail: string;
  origin: DataOrigin;
}

export interface SimEvent {
  id: string;
  at_s: number;
  kind: "info" | "warning" | "failure" | "crisis";
  text: string;
  /** Clave de data/ o content/ con la fuente, si aplica. */
  source?: string;
  /** Disparador para los textos del asistente (content/*.json → ContentEntry.trigger). */
  trigger?: string;
  /** Opciones si el evento pide una decisión (resolve-event). */
  choices?: EventChoice[];
  /** Tiempo de misión límite para decidir; al pasar se resuelve como "timeout". */
  deadline_s?: number;
  /** Opción elegida, una vez resuelto. */
  resolved?: string;
}

export type PlayerAction =
  | { type: "set-time-scale"; value: number }
  | { type: "select-component"; slot: string; componentId: string }
  | { type: "launch" }
  | { type: "burn"; delta_v_m_s: number }
  /** Fracción de la matriz secundaria retraída tras el escudo, 0–1. */
  | { type: "retract-array"; fraction: number }
  | { type: "resolve-event"; eventId: string; choice: string }
  /** Inclinación de la matriz principal respecto al Sol, en grados. */
  | { type: "tilt-array"; deg: number }
  | { type: "stow-main-array" }
  | { type: "set-attitude"; attitude: Attitude }
  /** ⚗ Enciende o apaga un sistema teórico del nivel 3 (reactor o campo HTS). */
  | { type: "set-system"; system: IkarosSystem; on: boolean }
  /** Pulso de los propulsores de control de reacción: Δv en m/s en ejes del puerto (x, y, z). */
  | { type: "rcs"; x: number; y: number; z: number }
  /** Enciende o apaga la compensación automática de la deriva orbital. */
  | { type: "set-assist"; on: boolean };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** ⚗ Sistemas teóricos del nivel 3 que el jugador mantiene en marcha. */
export type IkarosSystem = "reactor" | "hts";

export interface Simulation {
  /** Carga un escenario definido en data/scenarios/. */
  load(scenario: ScenarioId, seed: number): SimState;
  /** Avanza la simulación dt_s segundos de misión. */
  step(dt_s: number): SimState;
  act(action: PlayerAction): SimState;
  report(): MissionReport;
}

/** Segmentos de una misión NASA, usados para ordenar el informe. */
export type MissionSegment = "launch" | "space" | "ground" | "user";

export interface MissionReport {
  scenario: ScenarioId;
  outcome: "success" | "partial" | "failure";
  score: number;
  /** Causas del resultado, para el informe post-misión. */
  causes: { text: string; source?: string; segment?: MissionSegment; origin?: DataOrigin }[];
  metrics: Record<string, number | string | boolean>;
  /** Qué cambiar la próxima vez. */
  advice?: string[];
  /** Comparación con misiones reales. */
  comparisons?: MissionComparison[];
}

export interface MissionComparison {
  mission: string;
  metric: string;
  ours: string;
  theirs: string;
  source: string;
}

// Definición de escenarios (data/scenarios/*.json)

export interface SlotDefinition {
  id: string;
  label: string;
  required: boolean;
}

export interface ComponentOption {
  id: string;
  slot: string;
  name: string;
  description: string;
  cost_usd_m: number;
  mass_kg: number;
  /** Positivo genera, negativo consume. */
  power_w: number;
  /** Origen de la tecnología. */
  origin: DataOrigin;
  /** Origen de las cifras de costo, masa y potencia. */
  figures_origin: DataOrigin;
  source: string;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  title: string;
  subtitle: string;
  briefing: string[];
  objectives: string[];
  slots: SlotDefinition[];
  components: ComponentOption[];
  /** Límites y parámetros del nivel, cada uno con fuente. */
  params: Record<string, SourcedValue>;
}

// Contenido escrito (content/*.json)

export interface ContentEntry {
  id: string;
  /** Coincide con SimEvent.trigger. */
  trigger: string;
  text: string;
  source: string;
  origin: DataOrigin;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  source: string;
}
