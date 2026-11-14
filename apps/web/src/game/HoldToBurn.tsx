import { useEffect, useRef, useState } from "react";
import { physics } from "@ikaros/sim";
import { C } from "../data/sources";
import { formatNumber } from "../ui/format";
import { tr } from "../i18n";

/** Δv que se acumula por segundo mientras se mantiene pulsado, m/s. */
const RATE_M_S = 12;

/** Altitud a la que llevaría una transferencia de Hohmann con ese Δv (física del motor). */
export function arrivalAltitude(alt_km: number, dv_m_s: number) {
  return physics.hohmannTarget(C.muEarth, C.earthRadius + alt_km, dv_m_s / 1000) - C.earthRadius;
}

/**
 * Mantén pulsado para acelerar: el Δv crece mientras se pulsa y la barra muestra adónde
 * llegarías. Al soltar, se enciende el motor con ese Δv.
 */
export function HoldToBurn({
  alt_km,
  target_km,
  maxDv_m_s,
  onAim,
  onBurn,
}: {
  alt_km: number;
  target_km: number;
  maxDv_m_s: number;
  onAim: (dv_m_s: number | null) => void;
  onBurn: (dv_m_s: number) => void;
}) {
  const up = target_km >= alt_km;
  const [dv, setDv] = useState(0);
  const holding = useRef<number | null>(null);
  const dvRef = useRef(0);

  const tick = (start: number) => {
    const t = (performance.now() - start) / 1000;
    const value = Math.min(maxDv_m_s, RATE_M_S * t) * (up ? 1 : -1);
    dvRef.current = value;
    setDv(value);
    onAim(value);
    holding.current = requestAnimationFrame(() => tick(start));
  };
  const start = () => {
    if (holding.current !== null) return;
    const t0 = performance.now();
    holding.current = requestAnimationFrame(() => tick(t0));
  };
  const release = () => {
    if (holding.current === null) return;
    cancelAnimationFrame(holding.current);
    holding.current = null;
    const value = dvRef.current;
    onAim(null);
    setDv(0);
    dvRef.current = 0;
    if (value !== 0) onBurn(value);
  };

  useEffect(
    () => () => {
      if (holding.current !== null) cancelAnimationFrame(holding.current);
    },
    [],
  );

  // Barra de altitudes: de la actual al doble de la distancia hasta el satélite.
  const span = Math.max(10, Math.abs(target_km - alt_km) * 2);
  const lo = up ? alt_km : alt_km - span;
  const pos = (a: number) => `${Math.min(100, Math.max(0, ((a - lo) / span) * 100))}%`;
  const arrival = dv === 0 ? alt_km : arrivalAltitude(alt_km, dv);

  return (
    <div className="hold">
      <div className="hold-bar" aria-hidden="true">
        <span className="hold-target" style={{ left: pos(target_km) }} />
        <span className="hold-now" style={{ left: pos(alt_km) }} />
        <span className="hold-arrow" style={{ left: pos(arrival) }} />
      </div>
      <div className="hold-legend">
        <span>{tr("Tú", "You")}</span>
        <span>{tr("Satélite", "Satellite")}</span>
      </div>
      <button
        className="hold-btn"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") release();
        }}
      >
        {dv === 0
          ? up
            ? tr("Mantén pulsado para subir", "Hold to climb")
            : tr("Mantén pulsado para bajar", "Hold to descend")
          : `${formatNumber(Math.abs(dv), 1)} m/s`}
      </button>
      <p className="note">
        {tr("Suelta cuando la flecha llegue al satélite.", "Release when the arrow reaches the satellite.")}
      </p>
    </div>
  );
}
