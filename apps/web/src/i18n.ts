// Idioma de la interfaz (español o inglés). Los números y la física no cambian con el idioma.
import { useSyncExternalStore } from "react";

export type Lang = "es" | "en";

const KEY = "ikaros-lang";

function initial(): Lang {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (fromUrl === "es" || fromUrl === "en") return fromUrl;
    const saved = window.localStorage.getItem(KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    // Sin URL o sin almacenamiento (pruebas, modo privado): se decide por el navegador.
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "es";
  return nav.toLowerCase().startsWith("es") ? "es" : "en";
}

let current: Lang = typeof window !== "undefined" ? initial() : "es";
const listeners = new Set<() => void>();

if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    // El idioma se mantiene en esta pestaña aunque no se pueda guardar (o no hay navegador, en pruebas).
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Idioma actual; el componente se vuelve a pintar al cambiarlo. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Texto en el idioma actual: tr("Entrar", "Enter"). */
export function tr(es: string, en: string): string {
  return current === "en" ? en : es;
}

/** Código de idioma para formatear números (separadores de miles y decimales). */
export function numberLocale(): string {
  return current === "en" ? "en-US" : "es-CO";
}
