import type {
  ComponentOption,
  EventChoice,
  MissionReport,
  PlayerAction,
  ScenarioDefinition,
  ScenarioId,
  SimEvent,
  SimState,
} from "@ikaros/contracts";
import { scenario } from "../data";
import { createRng } from "../rng";

/** Paso interno máximo, s de misión. Un step() largo se parte en pasos de este tamaño. */
export const MAX_SUBSTEP_S = 60;

export abstract class Level {
  readonly def: ScenarioDefinition;
  state: SimState;
  protected rng: () => number;
  protected finished = false;
  private eventSeq = 0;
  private lastWarning = new Map<string, number>();

  constructor(id: ScenarioId, seed: number) {
    this.def = scenario(id);
    this.rng = createRng(seed);
    this.state = this.initialState();
  }

  protected abstract initialState(): SimState;
  /** Avanza un subpaso; dt <= MAX_SUBSTEP_S. */
  protected abstract tick(dt_s: number): void;
  protected abstract onAction(action: PlayerAction): void;
  abstract report(): MissionReport;

  param(key: string): number {
    const p = this.def.params[key];
    if (!p) throw new Error(`Falta el parámetro "${key}" en data/scenarios/${this.def.id}.json`);
    return p.value;
  }

  paramSource(key: string): string {
    return this.def.params[key]?.source ?? `data/scenarios/${this.def.id}.json`;
  }

  get t(): number {
    return this.state.resources.mission_elapsed_s;
  }

  get done(): boolean {
    return this.finished;
  }

  step(dt_s: number): void {
    if (!(dt_s > 0) || this.finished) return;
    let left = dt_s;
    while (left > 0 && !this.finished) {
      const dt = Math.min(left, MAX_SUBSTEP_S);
      this.state.resources.mission_elapsed_s += dt;
      this.expireDeadlines();
      this.tick(dt);
      left -= dt;
    }
  }

  act(action: PlayerAction): void {
    if (action.type === "set-time-scale") return; // la escala de tiempo es del cliente
    if (action.type === "select-component") {
      this.select(action.slot, action.componentId);
      return;
    }
    if (action.type === "resolve-event") {
      const ev = this.state.events.find((e) => e.id === action.eventId);
      if (!ev || ev.resolved || !ev.choices) return;
      if (!ev.choices.some((c) => c.id === action.choice)) return;
      ev.resolved = action.choice;
      this.onChoice(ev, action.choice);
      return;
    }
    if (this.finished) return;
    this.onAction(action);
  }

  protected onChoice(_ev: SimEvent, _choice: string): void {}

  // ---- Hangar ----

  protected components(slot: string): ComponentOption[] {
    return this.def.components.filter((c) => c.slot === slot);
  }

  protected chosen(slot: string): ComponentOption | undefined {
    const id = this.state.selected?.[slot];
    return this.def.components.find((c) => c.id === id);
  }

  protected chosenAll(): ComponentOption[] {
    return this.def.slots.map((s) => this.chosen(s.id)).filter((c): c is ComponentOption => !!c);
  }

  protected select(slot: string, componentId: string): void {
    if (this.state.phase !== "hangar") {
      this.info("El diseño se cierra al lanzar.", "warning");
      return;
    }
    if (!this.def.slots.some((s) => s.id === slot)) return;
    const selected = { ...(this.state.selected ?? {}) };
    if (componentId === "none") {
      delete selected[slot];
    } else {
      const comp = this.def.components.find((c) => c.id === componentId && c.slot === slot);
      if (!comp) return;
      selected[slot] = componentId;
    }
    this.state.selected = selected;
    this.onSelectionChanged();
  }

  protected onSelectionChanged(): void {}

  /** Lista de problemas que bloquean el lanzamiento (vacía si se puede lanzar). */
  protected missingRequired(): string[] {
    return this.def.slots
      .filter((s) => s.required && !this.state.selected?.[s.id])
      .map((s) => `Falta elegir: ${s.label}.`);
  }

  // ---- Eventos ----

  protected emit(
    kind: SimEvent["kind"],
    text: string,
    extra: { trigger?: string; source?: string; choices?: EventChoice[]; deadline_s?: number } = {},
  ): SimEvent {
    const ev: SimEvent = { id: `${this.def.id}-${++this.eventSeq}`, at_s: this.t, kind, text };
    if (extra.trigger) ev.trigger = extra.trigger;
    if (extra.source) ev.source = extra.source;
    if (extra.choices) ev.choices = extra.choices;
    if (extra.deadline_s !== undefined) ev.deadline_s = extra.deadline_s;
    this.state.events.push(ev);
    return ev;
  }

  protected info(text: string, kind: SimEvent["kind"] = "info", trigger?: string, source?: string) {
    return this.emit(kind, text, { trigger, source });
  }

  /** Aviso que no se repite antes de cooldown_s. */
  protected warnOnce(key: string, text: string, cooldown_s: number, trigger?: string, source?: string) {
    const last = this.lastWarning.get(key);
    if (last !== undefined && this.t - last < cooldown_s) return;
    this.lastWarning.set(key, this.t);
    this.emit("warning", text, { trigger, source });
  }

  protected openDecision(id: string): SimEvent | undefined {
    return this.state.events.find((e) => e.trigger === id && e.choices && !e.resolved);
  }

  private expireDeadlines(): void {
    for (const ev of this.state.events) {
      if (ev.choices && !ev.resolved && ev.deadline_s !== undefined && this.t >= ev.deadline_s) {
        ev.resolved = "timeout";
        this.onChoice(ev, "timeout");
      }
    }
  }

  protected finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.state.phase = "complete";
  }

  snapshot(): SimState {
    return structuredClone(this.state);
  }
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function round(x: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
