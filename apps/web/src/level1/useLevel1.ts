import { useCallback, useRef, useState } from "react";
import type { PlayerAction, SimState } from "@ikaros/contracts";
import { Level1, type Level1View } from "./game";
import { useGameLoop } from "../hooks/useGameLoop";

interface Snapshot {
  state: SimState;
  view: Level1View;
}

/**
 * Estado del nivel 1 para la interfaz. La escena lee posiciones directamente del juego
 * en cada cuadro; los paneles reciben una copia unas 10 veces por segundo y tras cada acción.
 */
export function useLevel1(timeScale: number) {
  const gameRef = useRef<Level1 | null>(null);
  if (gameRef.current === null) gameRef.current = new Level1();
  const game = gameRef.current;

  const [shot, setShot] = useState<Snapshot>(() => ({ state: game.load(), view: game.view() }));
  const latest = useRef<SimState>(shot.state);

  useGameLoop(
    (dt) => {
      latest.current = game.step(dt);
    },
    () => setShot({ state: latest.current, view: game.view() }),
    timeScale,
  );

  const act = useCallback(
    (a: PlayerAction) => {
      latest.current = game.act(a);
      setShot({ state: latest.current, view: game.view() });
    },
    [game],
  );

  return { game, state: shot.state, view: shot.view, act };
}
