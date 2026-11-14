import { useMemo } from "react";
import { C } from "../data/sources";

/** Rotación de la Tierra respecto a las estrellas (día sidéreo), rad/s. */
const EARTH_RATE = (2 * Math.PI) / 86164;
const W = 360;
const H = 180;

/** Traza sobre el mapa durante un día, para una órbita circular. */
function track(alt_km: number, inc_deg: number) {
  const r = C.earthRadius + alt_km;
  const n = Math.sqrt(C.muEarth / r ** 3);
  const inc = (inc_deg * Math.PI) / 180;
  const segments: string[] = [];
  let current: string[] = [];
  let lastX: number | null = null;
  for (let t = 0; t <= 86400; t += 60) {
    const u = n * t;
    const lat = Math.asin(Math.sin(inc) * Math.sin(u));
    let lon = Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) - EARTH_RATE * t;
    lon = ((((lon + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const x = ((lon * 180) / Math.PI + 180) * (W / 360);
    const y = (90 - (lat * 180) / Math.PI) * (H / 180);
    if (lastX !== null && Math.abs(x - lastX) > W / 2) {
      segments.push(current.join(" "));
      current = [];
    }
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    lastX = x;
  }
  segments.push(current.join(" "));
  return segments;
}

/** Mapa del mundo (textura de NASA) con la traza de un día y la zona que hay que vigilar. */
export function GroundTrack({
  alt_km,
  inclination_deg,
  zone,
  covered,
}: {
  alt_km: number;
  inclination_deg: number;
  /** Banda de latitudes del objetivo, en grados (sur, norte). */
  zone: [number, number] | null;
  covered: boolean;
}) {
  const lines = useMemo(() => track(alt_km, inclination_deg), [alt_km, inclination_deg]);
  const y = (lat: number) => (90 - lat) * (H / 180);
  return (
    <svg className="groundtrack" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Traza del satélite sobre la Tierra">
      <image href="/textures/earth.jpg" x="0" y="0" width={W} height={H} preserveAspectRatio="none" />
      {zone && (
        <rect
          className={covered ? "gt-zone covered" : "gt-zone"}
          x="0"
          y={y(zone[1])}
          width={W}
          height={y(zone[0]) - y(zone[1])}
        />
      )}
      {lines.map((pts, i) => (
        <polyline key={i} className="gt-line" points={pts} />
      ))}
    </svg>
  );
}
