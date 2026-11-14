import type { ReactNode } from "react";

/** Teclas de un reto, como en un mando de consola: «[Espacio] mantener». */
export function KeyHint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="key-hint">
      {keys.map((k) => (
        <kbd key={k}>{k}</kbd>
      ))}
      <span>{children}</span>
    </span>
  );
}

/** Fila de pistas de teclas. */
export function KeyHints({ children }: { children: ReactNode }) {
  return <p className="key-hints">{children}</p>;
}
