import { useEffect, useRef } from "react";

/**
 * Bucle de juego con requestAnimationFrame. Llama a `step` con el tiempo de misión
 * transcurrido (tiempo real × escala) y a `publish` unas 10 veces por segundo para
 * refrescar la interfaz sin re-renderizar en cada cuadro.
 */
export function useGameLoop(step: (dt_s: number) => void, publish: () => void, timeScale: number) {
  const stepRef = useRef(step);
  const publishRef = useRef(publish);
  const scaleRef = useRef(timeScale);
  stepRef.current = step;
  publishRef.current = publish;
  scaleRef.current = timeScale;

  useEffect(() => {
    let last = performance.now();
    let since = 0;
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      if (scaleRef.current > 0) stepRef.current(dt * scaleRef.current);
      since += dt;
      if (since >= 0.1) {
        since = 0;
        publishRef.current();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
