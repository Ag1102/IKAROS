// Textos del asistente de misión y del glosario. Esta lista es la base; los archivos
// content/*.json del equipo de contenido se suman a ella y la reemplazan por `id`.

export interface Fact {
  id: string;
  /** Momento del juego en que se muestra, p. ej. "l1:briefing". */
  trigger: string;
  text: string;
  source?: string;
}

export interface Term {
  term: string;
  def: string;
}

const SEED: Fact[] = [
  {
    id: "hubble-sm4",
    trigger: "l1:briefing",
    text: "El Hubble recibió su última visita de servicio en mayo de 2009: STS-125, llamada Servicing Mission 4, fue la quinta y última.",
    source: "NASA",
  },
  {
    id: "sts125-compare",
    trigger: "l1:result",
    text: "Misión real comparable: STS-125 (transbordador Atlantis, mayo de 2009), la quinta y última misión de servicio al Hubble.",
    source: "NASA",
  },
  {
    id: "spp-cells",
    trigger: "l3:encounter",
    text: "En el perihelio solo queda iluminada una cadena parcial de celdas, unos 34 cm².",
    source: "Landis et al., AIAA 2008-5712",
  },
  {
    id: "spp-compare",
    trigger: "l3:result",
    text: "Misión real comparable: Parker Solar Probe. El diseño del paper preveía 7 sobrevuelos de Venus y 24 pasadas cerca del Sol.",
    source: "Landis et al., AIAA 2008-5712",
  },
];

export const GLOSSARY: Term[] = [
  {
    term: "Δv (delta-v)",
    def: "Cambio de velocidad que la nave puede lograr con su combustible. Es el presupuesto de las maniobras.",
  },
  { term: "Apogeo y perigeo", def: "Puntos más lejano y más cercano de una órbita alrededor de la Tierra." },
  {
    term: "Transferencia de Hohmann",
    def: "Paso entre dos órbitas circulares con dos quemas tangenciales; suele ser la opción que menos Δv gasta.",
  },
  {
    term: "Ecuación de Tsiolkovsky",
    def: "Relaciona el Δv con la masa inicial, la masa final y el impulso específico del motor.",
  },
  {
    term: "Impulso específico (Isp)",
    def: "Eficiencia de un motor, en segundos: a mayor Isp, más Δv con el mismo combustible.",
  },
  {
    term: "Ventana de comunicación",
    def: "Tiempo en que la nave es visible desde una estación terrena y puede enviar o recibir datos.",
  },
  {
    term: "C3",
    def: "Energía característica de lanzamiento. Cuanto mayor es, más energía pide al lanzador y menos masa puede llevar.",
  },
  { term: "AM0", def: "Intensidad solar fuera de la atmósfera a 1 AU; el paper usa 1 367 W/m²." },
  {
    term: "R☉ (radio solar)",
    def: "Unos 696 000 km. El perihelio del paper es 9,5 R☉ medido desde el centro del Sol.",
  },
  { term: "AU (unidad astronómica)", def: "Distancia media entre la Tierra y el Sol, unos 149,6 millones de km." },
  { term: "Perihelio", def: "Punto de una órbita más cercano al Sol." },
  {
    term: "CML (Concept Maturity Levels)",
    def: "Escala de JPL que mide la madurez del concepto de una misión, desde la idea inicial hasta el diseño puntual.",
  },
];

type ContentModule = Fact | Fact[];
const external = import.meta.glob<ContentModule>("../../../../content/*.json", { eager: true, import: "default" });

function merge(): Fact[] {
  const byId = new Map(SEED.map((f) => [f.id, f]));
  for (const mod of Object.values(external)) {
    for (const f of Array.isArray(mod) ? mod : [mod]) {
      if (f && typeof f.id === "string" && typeof f.text === "string") byId.set(f.id, f);
    }
  }
  return [...byId.values()];
}

const FACTS = merge();

export function factsFor(trigger: string): Fact[] {
  return FACTS.filter((f) => f.trigger === trigger);
}
