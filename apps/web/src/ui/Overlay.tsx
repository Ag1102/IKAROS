import { Credits } from "./Credits";
import { Glossary } from "./Glossary";

export type OverlayKind = "credits" | "glossary" | null;

export function Overlay({ kind, onClose }: { kind: OverlayKind; onClose: () => void }) {
  if (kind === "credits") return <Credits onClose={onClose} />;
  if (kind === "glossary") return <Glossary onClose={onClose} />;
  return null;
}
