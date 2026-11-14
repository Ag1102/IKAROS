import { useState } from "react";
import type { Selection } from "./Spacecraft";

/** Selección que se ve en la vista previa: la actual más la opción que se está mirando. */
export function usePreview(selected: Selection) {
  const [hover, setHover] = useState<{ slot: string; id: string } | null>(null);
  const preview: Selection = hover ? { ...(selected ?? {}), [hover.slot]: hover.id } : selected;
  return {
    preview,
    highlight: hover?.slot ?? null,
    onPreview: (slot: string | null, id: string | null) => setHover(slot && id ? { slot, id } : null),
  };
}
