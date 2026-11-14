import type { SimEvent } from "@ikaros/contracts";
import { factsFor } from "../data/sources";
import { tr } from "../i18n";

/** Asistente de misión: muestra los textos de content/ ligados a los eventos más recientes. */
export function Assistant({ events, max = 1 }: { events: SimEvent[]; max?: number }) {
  const seen = new Set<string>();
  const facts = [];
  for (let i = events.length - 1; i >= 0 && facts.length < max; i--) {
    const trigger = events[i]?.trigger;
    if (!trigger || seen.has(trigger)) continue;
    seen.add(trigger);
    facts.push(...factsFor(trigger));
  }
  if (facts.length === 0) return null;
  return (
    <>
      {facts.slice(0, max).map((f) => (
        <p key={f.id} className="fact">
          <span className="fact-tag">{tr("Asistente", "Assistant")}</span> {f.text}
          <span className="fact-src"> — {f.source}</span>
          {f.origin === "theoretical" && <span className="tag tag-theory">⚗ {tr("teórico", "theoretical")}</span>}
        </p>
      ))}
    </>
  );
}
