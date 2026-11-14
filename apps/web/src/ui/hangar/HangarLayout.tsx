import { lazy, Suspense, type ReactNode } from "react";
import type { NasaModelInfo } from "../../ships/models";
import { formatNumber } from "../format";
import { tr } from "../../i18n";

const HangarStage = lazy(() => import("./HangarStage"));

export interface HangarStat {
  label: string;
  value: number;
  unit: string;
  /** Si hay máximo se dibuja una barra. */
  max?: number;
  digits?: number;
  warn?: boolean;
  /** Texto propio en lugar del número. */
  text?: string;
}

function StatMeter({ s }: { s: HangarStat }) {
  const pct = s.max ? Math.max(0, Math.min(100, (s.value / s.max) * 100)) : null;
  return (
    <div className={`hstat${s.warn ? " warn" : ""}`}>
      <div className="hstat-head">
        <span>{s.label}</span>
        <span className="num">
          {s.text ?? formatNumber(s.value, s.digits ?? 0)}
          {s.max !== undefined && <span className="hstat-max"> / {formatNumber(s.max, s.digits ?? 0)}</span>}{" "}
          <small>{s.unit}</small>
        </span>
      </div>
      {pct !== null && (
        <div className="hstat-bar" aria-hidden="true">
          <div style={{ width: `${pct}%` }} />
          {[25, 50, 75].map((t) => (
            <i key={t} style={{ left: `${t}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Hangar con aspecto de juego: la nave real gira en el centro, el equipo a la izquierda y la
 * telemetría de diseño a la derecha, con el botón de lanzamiento.
 */
export function HangarLayout({
  levelTitle,
  heading,
  stage,
  briefing,
  objectives,
  model,
  focus,
  slots,
  stats,
  extra,
  problems,
  launchLabel = tr("Lanzar misión", "Launch mission"),
  onLaunch,
  assistant,
  overlay,
  onExit,
  onGlossary,
  onCredits,
}: {
  levelTitle: string;
  heading: string;
  stage: string;
  briefing: string[];
  objectives: string[];
  model: NasaModelInfo;
  /** Pieza que se está mirando, para resaltarla sobre la nave. */
  focus?: string | null;
  slots: ReactNode;
  stats: HangarStat[];
  extra?: ReactNode;
  problems: string[];
  launchLabel?: string;
  onLaunch: () => void;
  assistant?: ReactNode;
  /** Capa sobre la nave (p. ej. la zona donde se sueltan las piezas). */
  overlay?: ReactNode;
  onExit: () => void;
  onGlossary: () => void;
  onCredits: () => void;
}) {
  return (
    <div className="hangar-game">
      <Suspense fallback={null}>
        <HangarStage model={model} active={Boolean(focus)} />
      </Suspense>
      <div className="hangar-shade" aria-hidden="true" />
      {overlay}

      <header className="hangar-top">
        <div className="brand">
          <span className="brand-name">IKAROS</span>
          <span className="brand-sub">{levelTitle} · Hangar</span>
        </div>
        <div className="scale">
          <button onClick={onGlossary}>{tr("Glosario", "Glossary")}</button>
          <button onClick={onCredits}>{tr("Créditos", "Credits")}</button>
          <button onClick={onExit}>{tr("Menú", "Menu")}</button>
        </div>
      </header>

      <section className="hangar-loadout" aria-labelledby="loadout-h">
        <h2 id="loadout-h">{heading}</h2>
        <p className="stage">{stage}</p>
        <details className="briefing">
          <summary>{tr("Informe de la misión", "Mission briefing")}</summary>
          {briefing.map((b) => (
            <p key={b}>{b}</p>
          ))}
          <ul className="causes">
            {objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </details>
        {slots}
      </section>

      <div className="hangar-caption" aria-live="polite">
        <span className="hangar-model">{model.name}</span>
        <span className="hangar-focus">
          {focus
            ? `${tr("Revisando", "Inspecting")}: ${focus}`
            : tr("Arrastra para girar la nave", "Drag to rotate the spacecraft")}
        </span>
      </div>

      <section className="hangar-stats" aria-labelledby="stats-h">
        <h2 id="stats-h">{tr("Telemetría de diseño", "Design telemetry")}</h2>
        {stats.map((s) => (
          <StatMeter key={s.label} s={s} />
        ))}
        {extra}
        {problems.length > 0 && (
          <ul className="problems" role="alert">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <button className="launch-cta" onClick={onLaunch}>
          {launchLabel}
        </button>
        {assistant}
      </section>
    </div>
  );
}

/** Nombre de la pieza que se está mirando en la lista, a partir de la selección de vista previa. */
export function focusName(
  def: { components: { id: string; slot: string; name: string }[] },
  preview: Record<string, string> | undefined,
  slot: string | null,
): string | null {
  if (!slot) return null;
  const id = preview?.[slot];
  return def.components.find((c) => c.slot === slot && c.id === id)?.name ?? null;
}
