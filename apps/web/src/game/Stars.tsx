import { tr } from "../i18n";

/** De 0 a 3 estrellas. */
export function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={tr(`${n} de 3 estrellas`, `${n} of 3 stars`)}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "star on" : "star"}>
          ★
        </span>
      ))}
    </span>
  );
}
