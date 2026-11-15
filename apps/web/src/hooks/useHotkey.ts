import { useEffect, useRef } from "react";

/** Atajo de una tecla, ignorado mientras se escribe, se usa un control de formulario o hay una ventana modal. */
export function useHotkey(key: string, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      // Espacio sobre un botón ya lo pulsa; con una ventana modal abierta los atajos no llegan al nivel.
      if (key === " " && t instanceof HTMLButtonElement) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key.toLowerCase() === key) ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);
}
