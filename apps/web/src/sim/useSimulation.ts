import { useCallback, useMemo, useRef, useState } from "react";
import type { MissionReport, PlayerAction, ScenarioId, SimState, Simulation } from "@ikaros/contracts";
import { createSimulation, scenario } from "@ikaros/sim";
import { useGameLoop } from "../hooks/useGameLoop";

const newSeed = () => Math.floor(Math.random() * 1_000_000);

/**
 * Conecta un nivel con el motor de simulación. La escena lee `latest` en cada cuadro;
 * los paneles reciben una copia del estado unas 10 veces por segundo y tras cada acción.
 */
export function useSimulation(
  id: ScenarioId,
  timeScale: number,
  /** Velocidad máxima según el estado (p. ej. durante el encuentro solar). */
  maxScale?: (s: SimState) => number,
) {
  const simRef = useRef<Simulation | null>(null);
  if (simRef.current === null) simRef.current = createSimulation();
  const sim = simRef.current;

  const [state, setState] = useState<SimState>(() => sim.load(id, newSeed()));
  const latest = useRef<SimState>(state);

  useGameLoop(
    (dt) => {
      const cap = maxScale?.(latest.current) ?? Infinity;
      latest.current = sim.step(timeScale > cap ? (dt * cap) / timeScale : dt);
    },
    () => setState(latest.current),
    timeScale,
  );

  const act = useCallback(
    (a: PlayerAction) => {
      latest.current = sim.act(a);
      setState(latest.current);
    },
    [sim],
  );

  const restart = useCallback(() => {
    latest.current = sim.load(id, newSeed());
    setState(latest.current);
  }, [sim, id]);

  const done = state.phase === "complete";
  const report: MissionReport | null = useMemo(() => (done ? sim.report() : null), [done, sim]);
  const def = useMemo(() => scenario(id), [id]);

  return { state, latest, act, restart, report, def };
}
