import { numberLocale } from "../i18n";

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");

/** Tiempo de misión T+ en formato DD:HH:MM:SS (los días solo si hace falta). */
export function formatElapsed(total_s: number): string {
  const s = Math.max(0, Math.floor(total_s));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const core = `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return d > 0 ? `${pad(d)}:${core}` : core;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString(numberLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
