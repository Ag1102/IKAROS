import { Dialog } from "./Dialog";
import { glossary } from "../data/sources";
import { tr } from "../i18n";

export function Glossary({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={tr("Glosario", "Glossary")} onClose={onClose}>
      <dl className="glossary">
        {glossary().map((t) => (
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
