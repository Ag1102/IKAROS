import { Dialog } from "./Dialog";
import { GLOSSARY } from "./facts";

export function Glossary({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Glosario" onClose={onClose}>
      <dl className="glossary">
        {GLOSSARY.map((t) => (
          <div key={t.term}>
            <dt>{t.term}</dt>
            <dd>{t.def}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
