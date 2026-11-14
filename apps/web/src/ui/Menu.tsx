import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { LEVELS, type MenuLevel } from "../menu/levels";

const MenuScene = lazy(() => import("../menu/MenuScene"));

type LevelN = MenuLevel["n"];

export function Menu({
  webgl,
  onPlay,
  onCredits,
  onGlossary,
}: {
  webgl: boolean;
  onPlay: (n: number) => void;
  onCredits: () => void;
  onGlossary: () => void;
}) {
  const [selected, setSelected] = useState<LevelN>(3);
  const current = LEVELS.find((l) => l.n === selected)!;
  const canPlay = (l: MenuLevel) => l.ready && webgl;
  const enter = (n: LevelN) => {
    const l = LEVELS.find((x) => x.n === n);
    if (l && canPlay(l)) onPlay(n);
  };

  // Teclado de consola: flechas o W/S para elegir, Enter para entrar, 1–3 directo.
  const keys = useRef({ selected, enter });
  keys.current = { selected, enter };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const i = LEVELS.findIndex((l) => l.n === keys.current.selected);
      const k = e.key.toLowerCase();
      if (k === "arrowdown" || k === "s") {
        e.preventDefault();
        setSelected(LEVELS[(i + 1) % LEVELS.length]!.n);
      } else if (k === "arrowup" || k === "w") {
        e.preventDefault();
        setSelected(LEVELS[(i + LEVELS.length - 1) % LEVELS.length]!.n);
      } else if (k === "1" || k === "2" || k === "3") {
        setSelected(Number(k) as LevelN);
      } else if (k === "enter" && !(e.target instanceof HTMLButtonElement)) {
        keys.current.enter(keys.current.selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="menu3d">
      {webgl && (
        <Suspense fallback={null}>
          <MenuScene selected={selected} onSelect={setSelected} onEnter={enter} />
        </Suspense>
      )}
      <div className="menu3d-shade" aria-hidden="true" />

      <header className="menu3d-brand">
        <h1>IKAROS</h1>
        <p>Diseña, lanza y opera una misión espacial.</p>
      </header>

      {!webgl && (
        <p className="warn menu3d-warn" role="alert">
          Este navegador no tiene WebGL activado, y los niveles necesitan gráficos 3D. Prueba con una versión reciente
          de Chrome, Edge, Firefox o Safari, o activa la aceleración por hardware.
        </p>
      )}

      <nav className="missions" aria-label="Misiones">
        <p className="missions-title">Selección de misión</p>
        <ol>
          {LEVELS.map((l) => {
            const active = l.n === selected;
            return (
              <li key={l.n} className={`mission${active ? " active" : ""}${l.ready ? "" : " locked"}`}>
                <button
                  className="mission-pick"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setSelected(l.n)}
                  onDoubleClick={() => enter(l.n)}
                >
                  <span className="mission-num">{String(l.n).padStart(2, "0")}</span>
                  <span className="mission-name">{l.name}</span>
                  <span className="mission-tag">{l.ready ? l.tag : "Bloqueada"}</span>
                </button>
                {active && (
                  <div className="mission-detail">
                    <p>{l.text}</p>
                    <button className="mission-go" disabled={!canPlay(l)} onClick={() => enter(l.n)}>
                      {l.ready ? "Entrar" : "Pendiente"}
                      {canPlay(l) && <kbd>⏎</kbd>}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <footer className="menu3d-foot">
        <p className="hints" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Elegir
          </span>
          <span>
            <kbd>⏎</kbd> Entrar
          </span>
          <span>Clic en la escena para elegir · Doble clic para entrar</span>
        </p>
        <p className="note">
          Proyecto educativo del NASA Space Apps Challenge 2026. No está respaldado por NASA. Las tecnologías marcadas
          con ⚗ son teóricas.{" "}
          <button className="link" onClick={onCredits}>
            Créditos y recursos
          </button>{" "}
          ·{" "}
          <button className="link" onClick={onGlossary}>
            Glosario
          </button>
        </p>
      </footer>
      <p className="sr-only" aria-live="polite">
        Misión {current.n}: {current.name}
      </p>
    </main>
  );
}
