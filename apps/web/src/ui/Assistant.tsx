import { factsFor } from "./facts";

/** Asistente de misión: muestra los datos escritos para un momento del juego. */
export function Assistant({ trigger }: { trigger: string }) {
  const facts = factsFor(trigger);
  if (facts.length === 0) return null;
  return (
    <>
      {facts.map((f) => (
        <p key={f.id} className="fact">
          <span className="fact-tag">Dato</span> {f.text}
          {f.source && <span className="fact-src"> — {f.source}</span>}
        </p>
      ))}
    </>
  );
}
