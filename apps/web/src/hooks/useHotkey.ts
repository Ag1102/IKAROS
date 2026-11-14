import { useEffect, useRef } from "react";

/** Atajo de una tecla, ignorado mientras se escribe o se usa un control de formulario. */
export function useHotkey(key: string, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === key) ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);
}
