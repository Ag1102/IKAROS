import { Dialog } from "./Dialog";
import { tr } from "../i18n";

const CHALLENGE_RESOURCES =
  "https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/?tab=resources";

export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={tr("Créditos y recursos", "Credits and resources")} onClose={onClose}>
      <p>
        {tr(
          "Ikaros es un juego educativo creado para el NASA Space Apps Challenge 2026 (reto",
          "Ikaros is an educational game made for the NASA Space Apps Challenge 2026 (the",
        )}
        <i> Space Mission Design Game</i>
        {tr(
          "). No está respaldado por NASA ni por ninguna agencia. Las tecnologías marcadas con ⚗ son teóricas o ficticias.",
          " challenge). It is not endorsed by NASA or any other agency. Technologies marked ⚗ are theoretical or fictional.",
        )}
      </p>

      <h3>{tr("Modelos y texturas de NASA (sin modificar)", "NASA models and textures (unmodified)")}</h3>
      <ul>
        <li>
          {tr(
            "International Space Station (ISS) (B), Space Shuttle (A), Hubble Space Telescope (A), Landsat 8, CubeSat 2U, Parker Solar Probe, Earth (A) y Venus — NASA 3D Resources.",
            "International Space Station (ISS) (B), Space Shuttle (A), Hubble Space Telescope (A), Landsat 8, CubeSat 2U, Parker Solar Probe, Earth (A) and Venus — NASA 3D Resources.",
          )}{" "}
          <a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noreferrer">
            science.nasa.gov/3d-resources
          </a>
        </li>
      </ul>

      <h3>{tr("Recursos del reto que guían el diseño", "Challenge resources that guide the design")}</h3>
      <ul>
        <li>
          <b>Design and Develop Science Missions:</b>{" "}
          {tr(
            "los cuatro segmentos de una misión (lanzamiento, espacio, tierra, usuario) estructuran el informe.",
            "the four segments of a mission (launch, space, ground, user) structure the report.",
          )}
        </li>
        <li>
          <b>General Mission Analysis Tool (GMAT):</b>{" "}
          {tr("referencia para verificar la mecánica orbital.", "reference for checking the orbital mechanics.")}
        </li>
        <li>
          <b>
            {tr(
              "Concept Maturity Levels (JPL) y Mission Design Lab:",
              "Concept Maturity Levels (JPL) and Mission Design Lab:",
            )}
          </b>{" "}
          {tr("etapas de diseño de cada nivel.", "design stages of each level.")}
        </li>
        <li>
          <b>NASA Mission Viz:</b>{" "}
          {tr("referencia de visualización de trayectorias.", "reference for trajectory visualization.")}
        </li>
        <li>
          <b>A Learning Game About Telescopes:</b>{" "}
          {tr(
            "patrón de opciones restringidas y comparación final con misiones reales.",
            "pattern of constrained choices and a final comparison with real missions.",
          )}
        </li>
        <li>
          <b>CubeSat 101:</b>{" "}
          {tr(
            "base del tutorial y del concepto de operaciones.",
            "basis for the tutorial and the concept of operations.",
          )}
        </li>
        <li>
          <b>
            {tr(
              "Reto 2023 «Visualize a Space Mission Using VR»:",
              "2023 challenge “Visualize a Space Mission Using VR”:",
            )}
          </b>{" "}
          {tr("referencia de requisitos de visualización.", "reference for visualization requirements.")}
        </li>
        <li>
          <b>Canadian Space Agency, Digital Games and Activities:</b>{" "}
          {tr("inspiración educativa.", "educational inspiration.")}
        </li>
      </ul>
      <p>
        {tr("Lista completa en la", "Full list in the")}{" "}
        <a href={CHALLENGE_RESOURCES} target="_blank" rel="noreferrer">
          {tr("pestaña Resources del reto", "challenge's Resources tab")}
        </a>
        .
      </p>

      <h3>{tr("Nivel 3 · Ikaros", "Level 3 · Ikaros")}</h3>
      <p>
        {tr(
          "Basado en Landis et al., «Solar Power System Design for the Solar Probe+ Mission», AIAA 2008-5712 (NASA Glenn / JHU APL).",
          "Based on Landis et al., “Solar Power System Design for the Solar Probe+ Mission”, AIAA 2008-5712 (NASA Glenn / JHU APL).",
        )}
      </p>
    </Dialog>
  );
}
