import { useEffect, useRef, useState } from "react";

const STEPS = ["T−3", "T−2", "T−1", "DESPEGUE"];
const STEP_MS = 650;

/**
 * Secuencia de lanzamiento: cuando la fase sale del hangar se muestra una cuenta regresiva
 * a pantalla completa sobre la escena. Devuelve el elemento a renderizar (o null).
 */
export function useLaunchSequence(phase: string, title: string) {
  const prev = useRef(phase);
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (prev.current === "hangar" && phase !== "hangar") {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      setStep(reduced ? STEPS.length - 1 : 0);
    }
    prev.current = phase;
  }, [phase]);

  useEffect(() => {
    if (step === null) return;
    const id = window.setTimeout(
      () => setStep((s) => (s === null || s >= STEPS.length ? null : s + 1)),
      step === STEPS.length - 1 ? STEP_MS * 1.6 : STEP_MS,
    );
    return () => window.clearTimeout(id);
  }, [step]);

  if (step === null || step >= STEPS.length) return null;
  const last = step === STEPS.length - 1;
  return (
    <div className={`launch-seq${last ? " go" : ""}`} role="status" aria-live="assertive">
      <span className="launch-title">{title}</span>
      <span key={step} className="launch-count">
        {STEPS[step]}
      </span>
      <span className="launch-ring" key={`r${step}`} aria-hidden="true" />
    </div>
  );
}
