/** Generador determinista (mulberry32): la misma semilla da la misma misión. */
export function createRng(seed: number): () => number {
  // Acepta semillas decimales, como las de Math.random().
  const whole = Number.isInteger(seed) ? seed : Math.floor((Number.isFinite(seed) ? seed : 0) * 4294967296);
  let a = whole >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
