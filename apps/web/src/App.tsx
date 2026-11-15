import { lazy, Suspense, useState } from "react";
import { Menu } from "./ui/Menu";
import { Overlay, type OverlayKind } from "./ui/Overlay";
import { AchievementToast } from "./game/achievements";
import { hasWebGL } from "./ui/webgl";
import { tr, useLang } from "./i18n";

const ServicioOrbitaScreen = lazy(() =>
  import("./levels/servicio-orbita/ServicioOrbitaScreen").then((m) => ({ default: m.ServicioOrbitaScreen })),
);
const IkarosScreen = lazy(() => import("./levels/ikaros/IkarosScreen").then((m) => ({ default: m.IkarosScreen })));

type Screen = "menu" | "servicio-orbita" | "ikaros";
const SCREEN_BY_LEVEL: Record<number, Screen> = { 1: "servicio-orbita", 2: "ikaros" };

export function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  // Al cambiar de idioma se vuelve a pintar todo el árbol.
  useLang();
  const exit = () => setScreen("menu");

  if (screen !== "menu") {
    return (
      <Suspense fallback={<p className="loading">{tr("Cargando nivel…", "Loading level…")}</p>}>
        {screen === "servicio-orbita" && <ServicioOrbitaScreen onExit={exit} />}
        {screen === "ikaros" && <IkarosScreen onExit={exit} />}
        <AchievementToast />
      </Suspense>
    );
  }
  return (
    <>
      <Menu
        webgl={hasWebGL()}
        onPlay={(n) => setScreen(SCREEN_BY_LEVEL[n] ?? "menu")}
        onCredits={() => setOverlay("credits")}
        onGlossary={() => setOverlay("glossary")}
      />
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </>
  );
}
