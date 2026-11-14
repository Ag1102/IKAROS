import { Dialog } from "./Dialog";
import { GLOSSARY } from "../data/sources";

export function Glossary({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Glosario" onClose={onClose}>
      <dl className="glossary">
        {GLOSSARY.map((t) => (
          <div key={t.term}>
            <dt>{t.term}</dt>
            <dd>
              {t.definition} <span className="fact-src">— {t.source}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
