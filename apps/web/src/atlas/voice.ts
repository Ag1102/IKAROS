// Voz de Atlas: reproduce los clips pregenerados (public/atlas/<idioma>/<id>.mp3). Atlas solo habla
// con su propia voz: si un clip falta, está desactualizado o no se puede reproducir, la línea se
// muestra como texto (sin cambiar a una voz robótica del sistema, que suena a otra persona).
// voiceLevel() da el volumen de la voz en cada cuadro, para que el holograma mueva la boca.
import type { Lang } from "../i18n";

const KEY = "ikaros-atlas-muted";

let muted = (() => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(value: boolean): void {
  muted = value;
  try {
    window.localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // Se mantiene en la pestaña aunque no se pueda guardar.
  }
  if (value) stop();
}

let audio: HTMLAudioElement | null = null;
let finish: (() => void) | null = null;
/** Atlas está "hablando" (con audio, con la voz del sistema o solo con texto). */
let talking = false;

// ---- Volumen en vivo (Web Audio) ----

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let samples: Uint8Array | null = null;
let analysed: HTMLAudioElement | null = null;

/**
 * Conecta el clip a un analizador. Solo si el contexto ya está corriendo: si quedara suspendido,
 * el clip pasaría por él y no sonaría. El primer clip, antes del primer clic, va sin analizar.
 */
function analyse(el: HTMLAudioElement): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (ctx.state !== "running") return;
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(ctx.destination);
      samples = new Uint8Array(analyser.fftSize);
    }
    ctx.createMediaElementSource(el).connect(analyser);
    analysed = el;
  } catch {
    analysed = null;
  }
}

/** Volumen de la voz de 0 a 1. Sin analizador, una oscilación suave mientras habla. */
export function voiceLevel(): number {
  if (!talking) return 0;
  if (analyser && samples && analysed && analysed === audio) {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / samples.length) * 5);
  }
  const t = performance.now() / 1000;
  return 0.25 + 0.25 * Math.abs(Math.sin(t * 9) * Math.sin(t * 3.7));
}

export const isTalking = () => talking;

/** Detiene lo que esté sonando y resuelve su promesa. */
export function stop(): void {
  audio?.pause();
  audio = null;
  talking = false;
  const f = finish;
  finish = null;
  f?.();
}

// ---- Clip al día con el texto ----

type Manifest = Record<string, Record<string, { text: string }>>;
let manifest: Promise<Manifest | null> | null = null;

/** Huella del texto igual a la del generador (sha256 en hex, 12 caracteres). */
async function textHash(text: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

/**
 * ¿El clip grabado dice exactamente este texto? Si el guion cambió y la voz aún no se
 * regeneró, Atlas lee el texto con la voz del sistema en vez de decir la versión vieja.
 */
async function clipIsCurrent(id: string, text: string, lang: Lang): Promise<boolean> {
  manifest ??= fetch("/atlas/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  const [m, hash] = await Promise.all([manifest, textHash(text)]);
  if (!m || !hash) return true;
  return m[lang]?.[id]?.text === hash;
}

/** Tiempo de lectura cuando no hay audio: ~15 caracteres por segundo, mínimo 3 s. */
export const readingMs = (text: string) => Math.max(3000, text.length * 65);

/**
 * Dice una línea y resuelve al terminar (o al detenerla). Sin voz, espera el tiempo de lectura
 * para que el texto se alcance a leer.
 */
export function speak(id: string, text: string, lang: Lang): Promise<void> {
  stop();
  talking = true;
  return new Promise((resolve) => {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      if (finish === end) {
        finish = null;
        talking = false;
      }
      resolve();
    };
    finish = end;
    if (muted) {
      window.setTimeout(end, readingMs(text));
      return;
    }
    void clipIsCurrent(id, text, lang).then((current) => {
      if (done) return; // se detuvo mientras se comprobaba
      if (!current) return textOnly(text, end);
      const clip = new Audio(`/atlas/${lang}/${id}.mp3`);
      audio = clip;
      analyse(clip);
      clip.onended = end;
      clip.onerror = () => {
        if (audio === clip) textOnly(text, end);
      };
      clip.play().catch(() => {
        // Autoplay bloqueado o clip ausente: queda el texto en pantalla.
        if (audio === clip) textOnly(text, end);
      });
    });
  });
}

/** Sin clip utilizable: el texto se queda en pantalla el tiempo de lectura. */
function textOnly(text: string, end: () => void): void {
  audio = null;
  window.setTimeout(end, readingMs(text));
}
