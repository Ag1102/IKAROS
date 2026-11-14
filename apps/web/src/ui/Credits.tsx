import { Dialog } from "./Dialog";

const CHALLENGE_RESOURCES =
  "https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/?tab=resources";

export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Créditos y recursos" onClose={onClose}>
      <p>
        Ikaros es un juego educativo creado para el NASA Space Apps Challenge 2026 (reto
        <i> Space Mission Design Game</i>). No está respaldado por NASA ni por ninguna agencia. Las tecnologías marcadas
        con ⚗ son teóricas o ficticias.
      </p>

      <h3>Modelos y texturas de NASA (sin modificar)</h3>
      <ul>
        <li>
          Hubble Space Telescope (A), Parker Solar Probe y Earth (A) — NASA 3D Resources.{" "}
          <a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noreferrer">
            science.nasa.gov/3d-resources
          </a>
        </li>
      </ul>

      <h3>Recursos del reto que guían el diseño</h3>
      <ul>
        <li>
          <b>Design and Develop Science Missions:</b> los cuatro segmentos de una misión (lanzamiento, espacio, tierra,
          usuario) estructuran el informe.
        </li>
        <li>
          <b>General Mission Analysis Tool (GMAT):</b> referencia para verificar la mecánica orbital.
        </li>
        <li>
          <b>Concept Maturity Levels (JPL) y Mission Design Lab:</b> etapas de diseño de cada nivel.
        </li>
        <li>
          <b>NASA Mission Viz:</b> referencia de visualización de trayectorias.
        </li>
        <li>
          <b>A Learning Game About Telescopes:</b> patrón de opciones restringidas y comparación final con misiones
          reales.
        </li>
        <li>
          <b>CubeSat 101:</b> base del tutorial y del concepto de operaciones.
        </li>
        <li>
          <b>Reto 2023 «Visualize a Space Mission Using VR»:</b> referencia de requisitos de visualización.
        </li>
        <li>
          <b>Canadian Space Agency, Digital Games and Activities:</b> inspiración educativa.
        </li>
      </ul>
      <p>
        Lista completa en la{" "}
        <a href={CHALLENGE_RESOURCES} target="_blank" rel="noreferrer">
          pestaña Resources del reto
        </a>
        .
      </p>

      <h3>Nivel 3 · Ikaros</h3>
      <p>
        Basado en Landis et al., «Solar Power System Design for the Solar Probe+ Mission», AIAA 2008-5712 (NASA Glenn /
        JHU APL).
      </p>
    </Dialog>
  );
}
