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
import { scenario, sourceText, type Lang } from "../data";
import { createRng } from "../rng";

/** Paso interno máximo, s de misión. Un step() largo se parte en pasos de este tamaño. */
export const MAX_SUBSTEP_S = 60;
/** Tope de un solo step(): un año de misión. */
export const MAX_STEP_S = 365 * 86_400;

export abstract class Level {
  readonly def: ScenarioDefinition;
  state: SimState;
  protected rng: () => number;
  protected finished = false;
  private eventSeq = 0;
  private lastWarning = new Map<string, number>();

  readonly lang: Lang;

  constructor(id: ScenarioId, seed: number, lang: Lang = "es") {
    // El idioma va antes que initialState(): ese método ya emite el primer evento.
    this.lang = lang;
    this.def = scenario(id, lang);
    this.rng = createRng(seed);
    this.state = this.initialState();
  }

  protected abstract initialState(): SimState;
  /** Avanza un subpaso; dt <= MAX_SUBSTEP_S. */
  protected abstract tick(dt_s: number): void;
  protected abstract onAction(action: PlayerAction): void;
  abstract report(): MissionReport;

  /** Texto en el idioma de la partida. */
  protected L(es: string, en: string): string {
    return this.lang === "en" ? en : es;
  }

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

  /** Subpaso de cada fase; las fases sin física fina pueden usar uno mayor. */
  protected substep(): number {
    return MAX_SUBSTEP_S;
  }

  step(dt_s: number): void {
    // En el hangar el reloj de misión no corre: el diseño no gasta tiempo de misión.
    if (!Number.isFinite(dt_s) || dt_s <= 0 || this.finished || this.state.phase === "hangar") return;
    let left = Math.min(dt_s, MAX_STEP_S);
    while (left > 0 && !this.finished) {
      const dt = Math.min(left, this.substep());
      const decisions = this.openDecisionCount();
      this.state.resources.mission_elapsed_s += dt;
      this.tick(dt);
      // Los plazos vencen después del subpaso: un cambio de fase cuenta desde el siguiente.
      this.expireDeadlines();
      left -= dt;
      // Si se abrió una decisión, el paso termina aquí: con pasos largos (crucero acelerado)
      // la decisión podría abrirse y vencer dentro de la misma llamada sin que nadie la vea.
      if (this.openDecisionCount() > decisions) break;
    }
  }

  private openDecisionCount(): number {
    let n = 0;
    for (const e of this.state.events) if (e.choices && !e.resolved) n++;
    return n;
  }

  act(action: PlayerAction): void {
    if (action.type === "set-time-scale") return; // la escala de tiempo es del cliente
    if (!hasFiniteNumbers(action)) return;
    if (action.type === "select-component") {
      this.select(action.slot, action.componentId);
      return;
    }
    if (action.type === "resolve-event") {
      if (this.finished) return;
      const ev = this.state.events.find((e) => e.id === action.eventId);
      if (!ev || ev.resolved || !ev.choices) return;
      // «timeout» es la respuesta de quien no actuó a tiempo: vale como el plazo vencido.
      if (action.choice !== "timeout" && !ev.choices.some((c) => c.id === action.choice)) return;
      ev.resolved = action.choice;
      this.onChoice(ev, action.choice);
      return;
    }
    if (this.finished) return;
    this.onAction(action);
  }

  protected onChoice(_ev: SimEvent, _choice: string): void {}

  // Hangar

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
      this.info(this.L("El diseño se cierra al lanzar.", "The design is locked at launch."), "warning");
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
      .map((s) => this.L(`Falta elegir: ${s.label}.`, `Still to choose: ${s.label}.`));
  }

  // Eventos

  protected emit(
    kind: SimEvent["kind"],
    text: string,
    extra: { trigger?: string; source?: string; choices?: EventChoice[]; deadline_s?: number } = {},
  ): SimEvent {
    // Un mismo aviso repetido en el mismo instante (clics repetidos) se registra una sola vez.
    if (!extra.choices) {
      for (let i = this.state.events.length - 1; i >= 0; i--) {
        const e = this.state.events[i]!;
        if (e.at_s !== this.t) break;
        if (e.text === text && e.kind === kind) return e;
      }
    }
    const ev: SimEvent = { id: `${this.def.id}-${++this.eventSeq}`, at_s: this.t, kind, text };
    if (extra.trigger) ev.trigger = extra.trigger;
    if (extra.source) ev.source = sourceText(extra.source, this.lang);
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
    // Una decisión que queda abierta al terminar ya no tiene efecto.
    for (const ev of this.state.events) {
      if (ev.choices && !ev.resolved) ev.resolved = "timeout";
    }
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

function hasFiniteNumbers(action: PlayerAction): boolean {
  return Object.values(action).every((v) => typeof v !== "number" || Number.isFinite(v));
}
