import { Suspense, lazy, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { Dialog } from "../ui/Dialog";
import { formatNumber } from "../ui/format";
import { C } from "../data/sources";
import { coversLatitude, projectLeo } from "./projection";
import { GroundTrack } from "./GroundTrack";
import { Stars } from "./Stars";
import { Why } from "./Why";
import { Callout } from "./Callout";
import { unlock } from "./achievements";
import { why } from "./explanations";
import { tr } from "../i18n";

const LaunchView = lazy(() => import("./LaunchView").then((m) => ({ default: m.LaunchView })));

/**
 * Zona que debe sobrevolar cada objetivo. Supuesto del juego: los bosques boreales están entre
 * ~50° y 70° N. Pendiente de pasar a data/.
 */
const ZONES: Record<string, [number, number] | null> = { "obj-fires": [50, 70], "obj-oceans": null };

/** Estrellas según lo cerca que quedó la velocidad de la circular. 0 = no hay órbita útil. */
export function insertionStars(v_km_s: number, alt_km: number): number {
  const p = projectLeo(alt_km, v_km_s);
  if (p.outcome === "reentry" || p.outcome === "escape") return 0;
  const err = Math.abs(v_km_s / p.vCircular - 1);
  return err <= 0.005 ? 3 : err <= 0.015 ? 2 : err <= 0.05 ? 1 : 0;
}

const MIN_F = 0.9;
const MAX_F = 1.45;

export function OrbitLaunch({
  def,
  state,
  act,
  onDone,
  onClose,
}: {
  def: ScenarioDefinition;
  state: SimState;
  act: (a: PlayerAction) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"heading" | "launch">("heading");
  const orbits = def.components.filter((c) => c.slot === "orbit");
  const orbitId = state.selected?.orbit;
  const alt = state.altitude_km ?? 0;
  const inc = state.inclination_deg ?? 0;
  const zone = ZONES[state.selected?.objective ?? ""] ?? null;
  const covered = zone === null || coversLatitude(inc, zone[0]).ok;

  // Lanzamiento: potencia como fracción de la velocidad circular; el jugador no ve el número exacto.
  const vc = Math.sqrt(C.muEarth / (C.earthRadius + alt));
  const [power, setPower] = useState(0.94);
  const [flying, setFlying] = useState<number | null>(null);
  const [landed, setLanded] = useState(false);
  const v = vc * power;
  const projection = projectLeo(alt, v);
  const stars = landed ? insertionStars(v, alt) : 0;

  const result = () => {
    if (projection.outcome === "reentry")
      return (
        <Callout tone="bad">
          {tr("¡Se quemó! Ibas lento y cayó a la atmósfera.", "It burned up! Too slow, it fell into the atmosphere.")}
        </Callout>
      );
    if (projection.outcome === "escape")
      return (
        <Callout tone="bad">
          {tr("¡Se escapó! Ibas tan rápido que dejó la Tierra.", "It escaped! So fast it left the Earth behind.")}
        </Callout>
      );
    if (stars === 3) return <Callout tone="good">{tr("¡Órbita perfecta!", "Perfect orbit!")}</Callout>;
    if (stars > 0)
      return (
        <Callout tone="almost">
          {power > 1
            ? tr("¡En órbita! Quedó un poco alargada: sobró potencia.", "In orbit! A bit stretched: too much power.")
            : tr("¡En órbita! Quedó un poco baja: faltó potencia.", "In orbit! A bit low: not enough power.")}
        </Callout>
      );
    return (
      <Callout tone="bad">
        {power > 1
          ? tr(
              "La órbita quedó demasiado alargada. Ajusta la potencia.",
              "The orbit is too stretched. Adjust the power.",
            )
          : tr("La órbita quedó demasiado baja. Ajusta la potencia.", "The orbit is too low. Adjust the power.")}
      </Callout>
    );
  };

  return (
    <Dialog
      title={step === "heading" ? tr("1 · Elige el rumbo", "1 · Pick a heading") : tr("2 · ¡Lanza!", "2 · Launch!")}
      onClose={onClose}
      wide
    >
      {step === "heading" ? (
        <div className="game-step">
          <div className="choice-row" role="radiogroup" aria-label="Órbita">
            {orbits.map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={orbitId === o.id}
                className={orbitId === o.id ? "big-choice on" : "big-choice"}
                onClick={() => act({ type: "select-component", slot: "orbit", componentId: o.id })}
              >
                {o.name}
              </button>
            ))}
          </div>
          {orbitId ? (
            <>
              <GroundTrack alt_km={alt} inclination_deg={inc} zone={zone} covered={covered} />
              {zone === null ? (
                <Callout tone="good">
                  {tr(
                    "Los océanos están por todas partes: cualquier rumbo sirve.",
                    "Oceans are everywhere: any heading works.",
                  )}
                </Callout>
              ) : covered ? (
                <Callout tone="good">
                  {tr(
                    "¡Tu satélite pasa sobre los bosques del norte!",
                    "Your satellite flies over the northern forests!",
                  )}
                </Callout>
              ) : (
                <Callout tone="bad">
                  {tr(
                    "No llega tan al norte. Prueba otro rumbo.",
                    "It doesn't reach that far north. Try another heading.",
                  )}
                </Callout>
              )}
              <Why {...why("inclination")} />
              <button className="primary" disabled={!covered} onClick={() => setStep("launch")}>
                {tr("Siguiente", "Next")}
              </button>
            </>
          ) : (
            <p className="note">
              {tr("Elige un rumbo para ver por dónde pasará.", "Pick a heading to see where it will fly.")}
            </p>
          )}
        </div>
      ) : (
        <div className="game-launch">
          <div className="launch-view">
            <Suspense fallback={null}>
              <LaunchView
                alt_km={alt}
                inclination_deg={inc}
                projection={projection}
                flying={flying}
                landed={landed}
                onFlightEnd={() => {
                  setLanded(true);
                  const s = insertionStars(v, alt);
                  if (s > 0) unlock("first-orbit");
                  if (s === 3) unlock("perfect-orbit");
                }}
              />
            </Suspense>
          </div>
          <div className="launch-controls">
            {!landed ? (
              <>
                <label className="power" htmlFor="power">
                  <span>{tr("Potencia", "Power")}</span>
                  <input
                    id="power"
                    type="range"
                    min={MIN_F}
                    max={MAX_F}
                    step={0.001}
                    value={power}
                    disabled={flying !== null}
                    onChange={(e) => setPower(Number(e.target.value))}
                  />
                </label>
                <p className="note">
                  {tr(
                    "El arco naranja muestra hacia dónde saldrá. Línea punteada: la órbita buscada.",
                    "The orange arc shows where it will go. Dotted line: the target orbit.",
                  )}
                </p>
                <button className="primary big" disabled={flying !== null} onClick={() => setFlying(performance.now())}>
                  {tr("¡Lanzar!", "Launch!")}
                </button>
              </>
            ) : (
              <>
                <Stars n={stars} />
                {result()}
                <p className="note">
                  {tr("Velocidad:", "Speed:")} {formatNumber(v, 2)} km/s · {tr("la buscada:", "target:")}{" "}
                  {formatNumber(vc, 2)} km/s
                </p>
                <Why {...why("insertion")} />
                <div className="row-actions">
                  <button
                    className="scale-btn"
                    onClick={() => {
                      setLanded(false);
                      setFlying(null);
                    }}
                  >
                    {tr("Otra vez", "Try again")}
                  </button>
                  {stars > 0 && (
                    <button
                      className="primary"
                      onClick={() => {
                        onDone();
                        onClose();
                      }}
                    >
                      {tr("¡Listo!", "Done!")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
