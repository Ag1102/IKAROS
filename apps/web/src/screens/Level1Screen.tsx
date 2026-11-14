import { useEffect, useMemo, useState } from "react";
import type { PlayerAction } from "@ikaros/contracts";
import { Scene } from "../scene/Scene";
import { useLevel1 } from "../level1/useLevel1";
import { previewBurn1 } from "../level1/game";
import { EventLog, ResourcesPanel, TopBar } from "../ui/Panels";
import { LevelPanel } from "../ui/LevelPanel";
import { Overlay, type OverlayKind } from "../ui/Overlay";
import { useHotkey } from "../hooks/useHotkey";

export function Level1Screen({ onExit }: { onExit: () => void }) {
  const [timeScale, setTimeScale] = useState(60);
  const [dv1, setDv1] = useState(0);
  const [dv2, setDv2] = useState(0);
  const [hideUi, setHideUi] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [follow, setFollow] = useState(false);
  const { game, state, view, act } = useLevel1(timeScale);

  useHotkey("h", () => setHideUi((v) => !v));

  const preview = useMemo(() => {
    if (view.phase === "burn1") return previewBurn1(dv1);
    if (view.phase === "burn2") return game.previewBurn2(dv2);
    return null;
  }, [view.phase, dv1, dv2, game]);

  // Al llegar al objetivo, la cámara se acerca sola al Hubble.
  useEffect(() => {
    if (view.phase === "toolkit") setFollow(true);
  }, [view.phase]);

  const onAct = (a: PlayerAction) => {
    if (a.type === "resolve-event" && a.eventId === "restart") {
      setDv1(0);
      setDv2(0);
      setFollow(false);
    }
    act(a);
  };

  return (
    <div className={hideUi ? "shell hide-ui" : "shell"}>
      <div className="viewport">
        <Scene
          game={game}
          phase={view.phase}
          servicer={view.servicer}
          preview={preview}
          follow={follow}
          docked={view.docked}
        />
      </div>
      <TopBar
        state={state}
        timeScale={timeScale}
        onTimeScale={setTimeScale}
        onTogglePanels={() => setHideUi((v) => !v)}
        follow={follow}
        onFollow={() => setFollow((v) => !v)}
        onGlossary={() => setOverlay("glossary")}
        onCredits={() => setOverlay("credits")}
        onExit={onExit}
      />
      <aside className="side">
        <ResourcesPanel state={state} fuel_kg={view.propellant_kg} dv_ms={view.dvLeft_ms} />
        <EventLog events={state.events} />
      </aside>
      <footer className="orbit-note">Arrastra: girar · Rueda: zoom · Clic derecho: desplazar · H: paneles</footer>
      <aside className="guide-wrap">
        <LevelPanel
          view={view}
          report={game.report()}
          dv1={dv1}
          dv2={dv2}
          setDv1={setDv1}
          setDv2={setDv2}
          preview={preview}
          act={onAct}
        />
      </aside>
      <Overlay kind={overlay} onClose={() => setOverlay(null)} />
    </div>
  );
}
