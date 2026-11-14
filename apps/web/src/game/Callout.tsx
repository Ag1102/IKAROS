import type { ReactNode } from "react";

/** Mensaje corto de resultado: bien, casi o mal. */
export function Callout({ tone, children }: { tone: "good" | "almost" | "bad"; children: ReactNode }) {
  return (
    <p className={`callout callout-${tone}`} role="status">
      {children}
    </p>
  );
}
