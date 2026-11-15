import { useEffect, useRef, useState } from "react";
import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { physics } from "@ikaros/sim";
import { Scene } from "../../scene/Scene";
import { useSimulation } from "../../sim/useSimulation";
import { recordResult, recordStars } from "../../progress";
import { ScoreHud, ScoreProvider, pilotRatio, starsFor, useScore, type Rating } from "../../game/score";
import { BoltSequence } from "../../game/BoltSequence";
import { menuLevels } from "../../menu/levels";
import { C } from "../../data/sources";
import { TopBar, type TimeScale } from "../../ui/Panels";
import { HangarSlots } from "../../ui/HangarSlots";
import { Assistant } from "../../ui/Assistant";
import { Report } from "../../ui/Report";
import { useLaunchSequence } from "../../ui/LaunchSequence";
import { Overlay, type OverlayKind } from "../../ui/Overlay";
import { formatNumber } from "../../ui/format";
import { useHotkey } from "../../hooks/useHotkey";
import { Callout } from "../../game/Callout";
import { Stars } from "../../game/Stars";
import { KeyHint, KeyHints } from "../../game/KeyHint";
import { unlock } from "../../game/achievements";
import { MODELS } from "../../ships/models";
import { HangarLayout, focusName } from "../../ui/hangar/HangarLayout";
import { usePreview } from "../../ships/usePreview";
import { ProxView } from "./ProxView";
import { ProxHud, maneuversLeft, useThrusters } from "./ProxHud";
import { tr } from "../../i18n";
import { useAtlas } from "../../atlas/Atlas";

const orbitScales = (): TimeScale[] => [
  { value: 0, label: tr("Pausa", "Pause") },
  { value: 60, label: "60×" },
  { value: 600, label: "600×" },
  { value: 2400, label: "2400×" },
];
const proxScales = (): TimeScale[] => [
  { value: 0, label: tr("Pausa", "Pause") },
  { value: 1, label: "1×" },
  { value: 5, label: "5×" },
  { value: 10, label: "10×" },
];

const r = (alt_km: number) => C.earthRadius + alt_km;
const hohmann = (from_km: number, to_km: number) => physics.hohmannDeltaV(C.muEarth, r(from_km), r(to_km)) * 1000;
const meanMotion = (alt_km: number) => Math.sqrt(C.muEarth / r(alt_km) ** 3);
const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;

/**
 * La ventana de encendido se abre cuando a la ISS le faltan 0,6° para el adelanto justo
 * (unos 70 km de error): antes, la llegada quedaría demasiado lejos para el combustible.
 */
export const WINDOW_OPEN_DEG = 0.6;

/** Diferencia entre el adelanto de la ISS y el que pide la transferencia, grados. */
const gapOf = (s: SimState) => (s.target_lead_deg ?? 0) - (s.ideal_lead_deg ?? 0);

/** Hay una transferencia en curso si el último encendido aún no tuvo llegada. */
function inTransfer(state: SimState): boolean {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const t = state.events[i]?.trigger;
    if (t === "level1:rendezvous" || t === "level1:miss" || t === "level1:miss-fuel") return false;
    if (t === "level1:burn") return true;
  }
  return false;
}

/** Velocidad máxima del tiempo: cerca de la ventana de encendido se frena para poder acertar. */
function speedCap(s: SimState): number {
  if (s.phase === "approach") return 10;
  if (s.phase !== "phasing" || inTransfer(s)) return Infinity;
  const gap = Math.abs(gapOf(s));
  return gap < 0.3 ? 30 : gap < 1 ? 120 : Infinity;
}

/** Calificación del encendido según la distancia a la que dejaría la ISS, km. */
export function burnRating(miss_km: number): Rating {
  return miss_km <= 8 ? "perfect" : miss_km <= 30 ? "good" : "fail";
}

/** Combustible que sobró del que había al empezar a pilotar (sobre la reserva). */
export function fuelRating(spareLeft_kg: number, used_kg: number): Rating {
  const ratio = spareLeft_kg / Math.max(1, spareLeft_kg + used_kg);
  return ratio >= 0.5 ? "perfect" : ratio >= 0.2 ? "good" : "fail";
}

/** Tiempo que sobró de la ventana de acercamiento. */
export function timeRating(left_s: number, window_s: number): Rating {
  const ratio = left_s / Math.max(1, window_s);
  return ratio >= 0.35 ? "perfect" : ratio >= 0.1 ? "good" : "fail";
}

/** Calificación del contacto: suave y centrado es perfecto. */
export function contactRating(speed_m_s: number, lateral_m: number): Rating {
  return speed_m_s <= 0.045 && lateral_m <= 0.12 ? "perfect" : "good";
}

export function ServicioOrbitaScreen(props: { onExit: () => void }) {
  return (
    <ScoreProvider>
      <ServicioOrbitaGame {...props} />
    </ScoreProvider>
  );
}

function ServicioOrbitaGame({ onExit }: { onExit: () => void }) {
  const [timeScale, setTimeScale] = useState(600);
  const [hideUi, setHideUi] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [follow, setFollow] = useState(true);
  const [eva, setEva] = useState<"pending" | "active" | "done">("pending");
  const score = useScore();
  const { state, latest, act, restart, report, def } = useSimulation(
    "level1-repair",
    eva === "active" ? 0 : timeScale,
    speedCap,
  );
  const launchSeq = useLaunchSequence(state.phase, def.title);
  const atlas = useAtlas("level1-repair", state.events);
  const approach = state.phase === "approach";

  // Al empezar a pilotar el tiempo pasa a escala humana.
  // En el momento justo del encendido el tiempo se detiene: solo queda pulsar.
  const windowPaused = useRef(false);
  const gapNow = gapOf(state);
  const waitingBurn =
    state.phase === "phasing" &&
    !inTransfer(state) &&
    Math.abs((state.altitude_km ?? 0) - (state.target_altitude_km ?? 0)) >= 1;
  useEffect(() => {
    if (waitingBurn && !windowPaused.current && gapNow <= 0.02) {
      windowPaused.current = true;
      setTimeScale(0);
    }
  }, [waitingBurn, gapNow]);

  useEffect(() => {
    if (state.phase === "approach") setTimeScale(10);
  }, [state.phase]);

  // El contacto se califica una vez; con el kit a bordo sigue una caminata para coser el panel P6.
  const rated = useRef(false);
  useEffect(() => {
    if (!report || rated.current) return;
    rated.current = true;
    if (report.metrics.docked) {
      const rating = contactRating(Number(report.metrics.contact_speed_m_s), Number(report.metrics.lateral_error_m));
      score.add(rating, tr("Acople", "Docking"));
      if (rating === "perfect") unlock("dock-first-try");
      const m = report.metrics;
      const spareLeft = Number(m.fuel_left_kg) - param(def, "reserve_kg");
      score.add(fuelRating(spareLeft, Number(m.approach_fuel_kg)), tr("Combustible", "Fuel"));
      score.add(timeRating(Number(m.approach_window_left_s), param(def, "approach_window_s")), tr("Tiempo", "Time"));
      if (report.metrics.repair_kit) setEva("active");
      else setEva("done");
    } else {
      if (state.events.some((e) => e.trigger === "level1:collision")) score.add("fail", tr("Acople", "Docking"));
      setEva("done");
    }
    // score.add es estable; basta con el informe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const stars = report && eva === "done" ? starsFor(report.outcome, pilotRatio(score.ratings)) : 0;
  useEffect(() => {
    if (!report || eva !== "done") return;
    recordResult(1, report.outcome);
    recordStars(1, stars);
  }, [report, eva, stars]);

  useHotkey("h", () => setHideUi((v) => !v));

  const onBurn = () => {
    const s = latest.current;
    // Espacio con el botón enfocado dispara dos veces: solo cuenta el primer encendido.
    if (s.phase !== "phasing" || inTransfer(s) || gapOf(s) > WINDOW_OPEN_DEG) return;
    const miss_km = (Math.abs(gapOf(s)) * Math.PI * r(s.target_altitude_km ?? 0)) / 180;
    score.add(burnRating(miss_km), tr("Encendido", "Burn"));
    act({ type: "burn", delta_v_m_s: hohmann(s.altitude_km ?? 0, s.target_altitude_km ?? 0) });
    setTimeScale(600);
  };
  const onRetry = () => {
    const s = latest.current;
    act({ type: "burn", delta_v_m_s: -hohmann(param(def, "start_altitude_km"), s.altitude_km ?? 0) });
    windowPaused.current = false;
    setTimeScale(600);
  };

  const onRestart = () => {
    rated.current = false;
    windowPaused.current = false;
    setEva("pending");
    score.reset();
    setFollow(true);
    setTimeScale(600);
    restart();
  };

  if (state.phase === "hangar") {
    return (
      <>
        <HangarPage def={def} state={state} act={act} onExit={onExit} onOverlay={setOverlay} />
        <Overlay kind={overlay} onClose={() => setOverlay(null)} />
        {atlas}
      </>
    );
  }

  return (
    <div className={hideUi ? "shell hide-ui" : "shell"}>
      <div className="viewport">
        {/* Cada vista entra con un fundido desde negro: el paso de la órbita al acople no es un corte seco. */}
        {approach || (report?.metrics.docked && state.rel_position_m) ? (
          <div key="prox" className="view-in">
            <ProxView latest={latest} day={state.in_daylight ?? true} />
          </div>
        ) : (
          <div key="orbit" className="view-in">
            <Scene latest={latest} inclination_deg={state.inclination_deg ?? 51.6} follow={follow} />
          </div>
        )}
      </div>
      <TopBar
        state={state}
        timeScale={timeScale}
        onTimeScale={setTimeScale}
        onTogglePanels={() => setHideUi((v) => !v)}
        follow={approach ? undefined : follow}
        onFollow={approach ? undefined : () => setFollow((v) => !v)}
        onGlossary={() => setOverlay("glossary")}
        onCredits={() => setOverlay("credits")}
        onExit={onExit}
        subtitle={def.title}
        scales={approach ? proxScales() : orbitScales()}
      />
      {approach && <Pilot state={state} act={act} def={def} />}
      <footer className="orbit-note">{tr("H · ocultar paneles", "H · hide panels")}</footer>
      <aside className="guide-wrap">
        <section className="panel guide" aria-label={tr("Misión", "Mission")}>
          {report ? (
            eva !== "active" && (
              <Report
                report={report}
                onRestart={onRestart}
                unlocks={menuLevels()[1]?.name}
                extra={
                  <div className="debrief-stars">
                    <Stars n={stars} />
                    <span>
                      {tr("Puntos de piloto", "Pilot points")} <b className="num">{formatNumber(score.points)}</b>
                    </span>
                  </div>
                }
              />
            )
          ) : (
            <>
              <FuelBar state={state} />
              {state.phase === "phasing" && (
                <ChaseStep
                  state={state}
                  paused={timeScale === 0}
                  onBurn={onBurn}
                  onRetry={onRetry}
                  startAlt={param(def, "start_altitude_km")}
                />
              )}
              {state.phase === "rendezvous" && <RendezvousStep state={state} />}
              {approach && <ApproachStep state={state} act={act} />}
              <Assistant events={state.events} max={1} />
            </>
          )}
        </section>
      </aside>
      <ScoreHud />
      {eva === "active" && (
        <div className="game-layer">
          <BoltSequence
            seed={7}
            title={tr("Cose el panel P6", "Stitch the P6 array")}
            onDone={(rating) => {
              score.add(rating, tr("Caminata espacial", "Spacewalk"));
              setEva("done");
            }}
          />
        </div>
      )}
      {launchSeq}
      {atlas}
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </div>
  );
}

/** Mandos del acercamiento: teclado y botones táctiles, con el HUD de la cámara de acople. */
function Pilot({ state, act, def }: { state: SimState; act: (a: PlayerAction) => void; def: ScenarioDefinition }) {
  const motion = useRef({ p: state.rel_position_m, v: state.rel_velocity_m_s });
  motion.current = { p: state.rel_position_m, v: state.rel_velocity_m_s };
  const thrusters = useThrusters(act, true, () => motion.current);
  useHotkey("g", () => act({ type: "set-assist", on: !(state.rcs_assist ?? true) }));
  return (
    <ProxHud
      state={state}
      thrusters={thrusters}
      isp_s={param(def, "isp_s")}
      keep_kg_min={param(def, "stationkeeping_kg_min")}
    />
  );
}

/** Combustible con la marca de la reserva: por debajo de ella la ISS ordena abortar. */
function FuelBar({ state }: { state: SimState }) {
  const cap = state.fuel_capacity_kg ?? 1;
  const fuel = state.fuel_kg ?? 0;
  const reserve = state.fuel_reserve_kg ?? 0;
  const low = fuel < reserve * 1.5;
  return (
    <div className={`fuel${low ? " low" : ""}`}>
      <div className="fuel-head">
        <span>{tr("Combustible", "Fuel")}</span>
        <span className="num">
          {formatNumber(fuel)} kg · Δv {formatNumber(state.delta_v_remaining_m_s ?? 0, 1)} m/s
        </span>
      </div>
      <div
        className="fuel-bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={Math.round(fuel)}
        aria-label={tr("Combustible", "Fuel")}
      >
        <div style={{ width: `${Math.max(0, Math.min(100, (fuel / cap) * 100))}%` }} />
        <i style={{ left: `${(reserve / cap) * 100}%` }} title={tr("Reserva de aborto", "Abort reserve")} />
      </div>
    </div>
  );
}

function ChaseStep({
  state,
  paused,
  onBurn,
  onRetry,
  startAlt,
}: {
  state: SimState;
  paused: boolean;
  onBurn: () => void;
  onRetry: () => void;
  startAlt: number;
}) {
  const transferring = inTransfer(state);
  const gap = gapOf(state);
  const iss = state.target_altitude_km ?? 0;
  const alt = state.altitude_km ?? 0;
  const atIss = Math.abs(alt - iss) < 1;
  const miss = [...state.events].reverse().find((e) => e.trigger === "level1:miss" || e.trigger === "level1:burn");
  // Lo que gana la nave sobre la ISS por segundo, grados.
  const rate = ((meanMotion(alt) - meanMotion(iss)) * 180) / Math.PI;
  const eta_s = rate > 0 && gap > 0 ? gap / rate : 0;
  const ready = !transferring && !atIss;

  useHotkey(" ", () => {
    if (ready) onBurn();
  });

  if (transferring) {
    return (
      <div className="chase">
        <p className="chase-title">{tr("Subiendo hacia la ISS", "Climbing to the ISS")}</p>
        <p className="note">
          {tr("Media vuelta en la elipse de transferencia.", "Half an orbit on the transfer ellipse.")}{" "}
          <span className="num">{formatNumber(alt, 0)} km</span>
        </p>
      </div>
    );
  }
  if (atIss) {
    return (
      <div className="chase">
        {miss?.trigger === "level1:miss" && <Callout tone="almost">{miss.text}</Callout>}
        <p className="note">
          {tr(
            "Para volver a intentarlo baja a la órbita de persecución: allí vas más rápido que la ISS.",
            "To try again, drop to the chase orbit: down there you are faster than the ISS.",
          )}
        </p>
        <button className="primary" onClick={onRetry}>
          {tr(`Bajar a ${formatNumber(startAlt, 0)} km`, `Drop to ${formatNumber(startAlt, 0)} km`)}
        </button>
      </div>
    );
  }
  // Barra de ventana: el centro es el momento justo; la marca entra por la derecha y avanza hacia él.
  const span = 1.5;
  const pos = 50 + Math.max(-1, Math.min(1, gap / span)) * 50;
  const zone = (0.35 / span) * 50;
  const good = Math.abs(gap) < 0.07;
  const ok = Math.abs(gap) < 0.35;
  const early = gap > WINDOW_OPEN_DEG;
  const late = gap < -0.35;
  return (
    <div className="chase">
      <p className="chase-title">{tr("Persigue a la ISS", "Chase the ISS")}</p>
      <p className="note">
        {tr(
          "Vas más abajo y más rápido: la alcanzas sola. Espera a que la marca entre en la franja y enciende.",
          "You are lower and faster: you catch up on your own. Wait for the mark to enter the band, then burn.",
        )}
      </p>
      <div className={`window-bar${good ? " good" : ok ? " ok" : ""}`} aria-hidden="true">
        <span className="window-zone" style={{ left: `${50 - zone}%`, width: `${zone * 2}%` }} />
        <span className="window-mark" style={{ left: `${pos}%` }} />
      </div>
      <p className="note num">
        {tr("La ISS va", "The ISS is")} {formatNumber(state.target_lead_deg ?? 0, 2)}°{" "}
        {tr("por delante · justo a", "ahead · exact at")} {formatNumber(state.ideal_lead_deg ?? 0, 2)}°
      </p>
      {early ? (
        <Callout tone="almost">
          {tr(`Aún no. Momento justo en ${formatMinutes(eta_s)}`, `Not yet. Right moment in ${formatMinutes(eta_s)}`)}
        </Callout>
      ) : late ? (
        <Callout tone="bad">{tr("¡Tarde! Enciende ya.", "Late! Burn now.")}</Callout>
      ) : (
        <Callout tone="good">
          {good || gap <= 0
            ? paused
              ? tr("¡Ahora! El tiempo está en pausa: enciende.", "Now! Time is paused: burn.")
              : tr("¡Ahora!", "Now!")
            : tr(`Casi: ${formatMinutes(eta_s)}`, `Almost: ${formatMinutes(eta_s)}`)}
        </Callout>
      )}
      <button className={`primary big${good ? " pulse" : ""}`} onClick={onBurn} disabled={early}>
        {early ? tr("Esperando la ventana", "Waiting for the window") : tr("Encender", "Burn")}
      </button>
      <KeyHints>
        <KeyHint keys={[tr("Espacio", "Space")]}>{tr("encender", "burn")}</KeyHint>
      </KeyHints>
    </div>
  );
}

function RendezvousStep({ state }: { state: SimState }) {
  const ev = [...state.events].reverse().find((e) => e.trigger === "level1:rendezvous");
  const left = Math.max(0, (state.rendezvous_end_s ?? 0) - state.resources.mission_elapsed_s);
  return (
    <div className="chase">
      <p className="chase-title">{tr("Aproximación final", "Final approach")}</p>
      {ev && <Callout tone="good">{ev.text}</Callout>}
      <p className="note num">
        {tr("El ordenador te lleva al punto de espera:", "The computer takes you to the hold point:")}{" "}
        {formatMinutes(left)}
      </p>
    </div>
  );
}

function ApproachStep({ state, act }: { state: SimState; act: (a: PlayerAction) => void }) {
  const assist = state.rcs_assist ?? true;
  return (
    <div className="chase">
      <p className="chase-title">{tr("Acóplate", "Dock")}</p>
      <p className="note">
        {tr(
          "Centra la cruz y acércate despacio. Al tocar: menos de 15 cm/s.",
          "Center the cross and close in slowly. At contact: under 15 cm/s.",
        )}
      </p>
      <button
        className={assist ? "scale-btn on" : "scale-btn"}
        onClick={() => act({ type: "set-assist", on: !assist })}
        title={tr(
          "Anula la deriva orbital (Clohessy-Wiltshire) gastando combustible",
          "Cancels orbital drift (Clohessy-Wiltshire) using fuel",
        )}
      >
        {tr("Compensación", "Drift hold")}: {assist ? "ON" : "OFF"} · G
      </button>
    </div>
  );
}

function formatMinutes(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${String(sec).padStart(2, "0")} s`;
}

function HangarPage({
  def,
  state,
  act,
  onExit,
  onOverlay,
}: {
  def: ScenarioDefinition;
  state: SimState;
  act: (a: PlayerAction) => void;
  onExit: () => void;
  onOverlay: (k: OverlayKind) => void;
}) {
  const [attemptFrom, setAttemptFrom] = useState<number | null>(null);
  const blocked =
    attemptFrom === null ? [] : state.events.slice(attemptFrom).filter((e) => e.trigger === "level1:overweight");
  const cargo = def.components.filter((c) => state.selected?.[c.slot] === c.id).reduce((m, c) => m + c.mass_kg, 0);
  const cap = state.mass_capacity_kg ?? 0;
  const dv = state.delta_v_remaining_m_s ?? 0;
  // Lo mínimo para subir con una transferencia exacta, más un margen para el acercamiento.
  const need = hohmann(param(def, "start_altitude_km"), param(def, "iss_altitude_km")) + 2;
  const { preview, highlight, onPreview } = usePreview(state.selected);
  // Combustible útil que quedaría al llegar con una subida perfecta, contado en maniobras.
  const isp = param(def, "isp_s");
  const m0 = state.resources.mass_kg;
  const burned = m0 * (1 - Math.exp(-(need - 2) / (isp * 9.80665)));
  const arrivalMoves = maneuversLeft((state.fuel_kg ?? 0) - burned - param(def, "reserve_kg"), m0 - burned, isp);

  return (
    <HangarLayout
      levelTitle={def.title}
      heading={tr("Bodega del transbordador", "Shuttle payload bay")}
      stage={tr(
        "Más carga = más puntos, pero menos combustible para corregir.",
        "More cargo = more points, but less fuel to correct.",
      )}
      briefing={def.briefing}
      objectives={def.objectives}
      model={MODELS.shuttle}
      focus={focusName(def, preview, highlight)}
      slots={<HangarSlots def={def} state={state} act={act} onPreview={onPreview} />}
      stats={[
        { label: tr("Carga en bodega", "Cargo in bay"), value: cargo, max: cap, unit: "kg", warn: cargo > cap },
        {
          label: tr("Δv útil (sobre la reserva)", "Usable Δv (above reserve)"),
          value: dv,
          // El mínimo es la subida exacta más el acercamiento: en rojo solo si no alcanza para llegar.
          text: `${formatNumber(dv, 1)} · ${tr("mín.", "min.")} ${formatNumber(need, 1)}`,
          unit: "m/s",
          warn: dv < need,
        },
        {
          label: tr("Maniobras al llegar (si todo sale bien)", "Maneuvers on arrival (if all goes well)"),
          value: arrivalMoves,
          max: 30,
          unit: "",
          warn: arrivalMoves < 6,
        },
      ]}
      problems={blocked.map((e) => e.text)}
      launchLabel={tr("Lanzar", "Launch")}
      onLaunch={() => {
        setAttemptFrom(state.events.length);
        act({ type: "launch" });
      }}
      assistant={<Assistant events={state.events} max={1} />}
      onExit={onExit}
      onGlossary={() => onOverlay("glossary")}
      onCredits={() => onOverlay("credits")}
    />
  );
}
