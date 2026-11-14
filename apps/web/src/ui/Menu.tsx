const LEVELS = [
  {
    n: 1,
    name: "Servicio en órbita",
    text: "Reparar un satélite: transferencia de dos quemas y ventana de comunicación.",
    ready: true,
  },
  {
    n: 2,
    name: "Observación de la Tierra",
    text: "Diseño de una misión LEO completa. Pendiente de datos y reglas.",
    ready: false,
  },
  { n: 3, name: "Ikaros", text: "Encuentro solar basado en Solar Probe+. Hangar, encuentro e informe.", ready: true },
];

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
  return (
    <main className="menu">
      <h1>IKAROS</h1>
      <p className="menu-sub">Diseña, lanza y opera una misión espacial.</p>
      {!webgl && (
        <p className="warn" role="alert">
          Este navegador no tiene WebGL activado, y los niveles necesitan gráficos 3D. Prueba con una versión reciente
          de Chrome, Edge, Firefox o Safari, o activa la aceleración por hardware.
        </p>
      )}
      <table className="levels">
        <tbody>
          {LEVELS.map((l) => (
            <tr key={l.n}>
              <th scope="row" className="num">
                {l.n}
              </th>
              <td>
                <b>{l.name}</b>
                <span>{l.text}</span>
              </td>
              <td>
                <button className="primary" disabled={!l.ready || !webgl} onClick={() => onPlay(l.n)}>
                  {l.ready ? "Entrar" : "Pendiente"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        Proyecto educativo del NASA Space Apps Challenge 2026. No está respaldado por NASA. Las tecnologías marcadas con
        ⚗ son teóricas.{" "}
        <button className="link" onClick={onCredits}>
          Créditos y recursos
        </button>{" "}
        ·{" "}
        <button className="link" onClick={onGlossary}>
          Glosario
        </button>
      </p>
    </main>
  );
}
