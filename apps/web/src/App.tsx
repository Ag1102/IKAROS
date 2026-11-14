import { lazy, Suspense, useState } from "react";
import { Menu } from "./ui/Menu";
import { Overlay, type OverlayKind } from "./ui/Overlay";
import { hasWebGL } from "./ui/webgl";
import { tr, useLang } from "./i18n";

const Level1Screen = lazy(() => import("./screens/Level1Screen").then((m) => ({ default: m.Level1Screen })));
const Level2Screen = lazy(() => import("./screens/Level2Screen").then((m) => ({ default: m.Level2Screen })));
const Level3Screen = lazy(() => import("./screens/Level3Screen").then((m) => ({ default: m.Level3Screen })));

type Screen = "menu" | "level1" | "level2" | "level3";

export function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  // Al cambiar de idioma se vuelve a pintar todo el árbol.
  useLang();
  const exit = () => setScreen("menu");

  if (screen !== "menu") {
    return (
      <Suspense fallback={<p className="loading">{tr("Cargando nivel…", "Loading level…")}</p>}>
        {screen === "level1" && <Level1Screen onExit={exit} />}
        {screen === "level2" && <Level2Screen onExit={exit} />}
        {screen === "level3" && <Level3Screen onExit={exit} />}
      </Suspense>
    );
  }
  return (
    <>
      <Menu
        webgl={hasWebGL()}
        onPlay={(n) => setScreen(n === 1 ? "level1" : n === 2 ? "level2" : "level3")}
        onCredits={() => setOverlay("credits")}
        onGlossary={() => setOverlay("glossary")}
      />
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </>
  );
}
