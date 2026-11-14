import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { LEVELS, menuLevels, type MenuLevel } from "../menu/levels";
import { setLang, tr, useLang } from "../i18n";
import { getUnlocked, resetProgress, useUnlocked } from "../progress";

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
  // Se abre en el último nivel desbloqueado.
  const [selected, setSelected] = useState<LevelN>(() => getUnlocked() as LevelN);
  const unlocked = useUnlocked();
  const lang = useLang();
  const levels = menuLevels();
  const current = levels.find((l) => l.n === selected)!;
  const isLocked = (l: MenuLevel) => l.n > unlocked;
  const canPlay = (l: MenuLevel) => l.ready && webgl && !isLocked(l);
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
        <p>{tr("Diseña, lanza y opera una misión espacial.", "Design, launch and operate a space mission.")}</p>
      </header>

      <div className="scale lang-switch" role="group" aria-label={tr("Idioma", "Language")}>
        {(["es", "en"] as const).map((l) => (
          <button
            key={l}
            className={l === lang ? "on" : ""}
            aria-pressed={l === lang}
            lang={l}
            onClick={() => setLang(l)}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {!webgl && (
        <p className="warn menu3d-warn" role="alert">
          {tr(
            "Este navegador no tiene WebGL activado, y los niveles necesitan gráficos 3D. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari, o activa la aceleración por hardware.",
            "This browser does not have WebGL enabled, and the levels need 3D graphics. Try a recent version of Chrome, Edge, Firefox or Safari, or turn on hardware acceleration.",
          )}
        </p>
      )}

      <nav className="missions" aria-label={tr("Misiones", "Missions")}>
        <p className="missions-title">{tr("Selección de misión", "Mission select")}</p>
        <ol>
          {levels.map((l) => {
            const active = l.n === selected;
            const locked = isLocked(l) || !l.ready;
            return (
              <li key={l.n} className={`mission${active ? " active" : ""}${locked ? " locked" : ""}`}>
                <button
                  className="mission-pick"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setSelected(l.n)}
                  onDoubleClick={() => enter(l.n)}
                >
                  <span className="mission-num">{String(l.n).padStart(2, "0")}</span>
                  <span className="mission-name">{l.name}</span>
                  <span className="mission-tag">
                    {locked ? (
                      <>
                        <LockIcon /> {tr("Bloqueada", "Locked")}
                      </>
                    ) : (
                      l.tag
                    )}
                  </span>
                </button>
                {active && (
                  <div className="mission-detail">
                    <p>{l.text}</p>
                    {isLocked(l) && (
                      <p className="mission-lock">
                        <LockIcon />{" "}
                        {tr(
                          `Supera el nivel ${l.n - 1} con la misión cumplida para desbloquearla.`,
                          `Complete level ${l.n - 1} successfully to unlock it.`,
                        )}
                      </p>
                    )}
                    <button className="mission-go" disabled={!canPlay(l)} onClick={() => enter(l.n)}>
                      {isLocked(l)
                        ? tr("Bloqueada", "Locked")
                        : l.ready
                          ? tr("Entrar", "Enter")
                          : tr("Pendiente", "Coming soon")}
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
            <kbd>↓</kbd> {tr("Elegir", "Select")}
          </span>
          <span>
            <kbd>⏎</kbd> {tr("Entrar", "Enter")}
          </span>
          <span>
            {tr(
              "Clic en la escena para elegir · Doble clic para entrar",
              "Click the scene to select · Double-click to enter",
            )}
          </span>
        </p>
        <p className="note">
          {tr(
            "Proyecto educativo del NASA Space Apps Challenge 2026. No está respaldado por NASA. Las tecnologías marcadas con ⚗ son teóricas.",
            "Educational project for the NASA Space Apps Challenge 2026. Not endorsed by NASA. Technologies marked ⚗ are theoretical.",
          )}{" "}
          <button className="link" onClick={onCredits}>
            {tr("Créditos y recursos", "Credits and resources")}
          </button>{" "}
          ·{" "}
          <button className="link" onClick={onGlossary}>
            {tr("Glosario", "Glossary")}
          </button>
          {unlocked > 1 && (
            <>
              {" "}
              ·{" "}
              <button
                className="link"
                onClick={() => {
                  if (window.confirm(tr("¿Volver a bloquear los niveles 2 y 3?", "Lock levels 2 and 3 again?"))) {
                    resetProgress();
                    setSelected(1);
                  }
                }}
              >
                {tr("Reiniciar progreso", "Reset progress")}
              </button>
            </>
          )}
        </p>
      </footer>
      <p className="sr-only" aria-live="polite">
        {tr("Misión", "Mission")} {current.n}: {current.name}
      </p>
    </main>
  );
}

/** Candado de trazo simple, del mismo grosor que el texto. */
function LockIcon() {
  return (
    <svg className="lock-icon" viewBox="0 0 12 14" width="10" height="12" aria-hidden="true">
      <rect x="1" y="6" width="10" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
