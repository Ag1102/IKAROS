import { useState } from "react";
import { tr } from "../i18n";

/** Explicación científica plegada: solo la ve quien la pide. */
export function Why({ text, formula, source }: { text: string; formula?: string; source?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="why">
      <button className="link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? tr("Ocultar", "Hide") : tr("¿Por qué?", "Why?")}
      </button>
      {open && (
        <div className="why-body">
          <p>{text}</p>
          {formula && <p className="why-formula">{formula}</p>}
          {source && <p className="fact-src">{source}</p>}
        </div>
      )}
    </div>
  );
}
