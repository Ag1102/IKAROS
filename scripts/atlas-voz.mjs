// Genera la voz de Atlas (content/atlas.json) con un servidor de voz local compatible con Argo:
// POST {url}/voz con {"texto": "..."} devuelve un WAV. Cada línea queda en
// apps/web/public/atlas/<idioma>/<id>.mp3; solo se regeneran las líneas nuevas o cambiadas.
//
//   node scripts/atlas-voz.mjs es [http://127.0.0.1:5299]
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lang = process.argv[2];
const url = process.argv[3] ?? "http://127.0.0.1:5299";
if (lang !== "es" && lang !== "en") throw new Error("Uso: node scripts/atlas-voz.mjs es|en [url]");

const lines = JSON.parse(readFileSync(join(root, "content/atlas.json"), "utf8"));
const outDir = join(root, "apps/web/public/atlas", lang);
const manifestPath = join(root, "apps/web/public/atlas/manifest.json");
mkdirSync(outDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
manifest[lang] ??= {};

const hash = (t) => createHash("sha256").update(t).digest("hex").slice(0, 12);
// La voz usada (referencia y ajustes) también cuenta: si cambia, se regeneran todas las líneas.
const voice = process.env.ATLAS_VOZ_HUELLA ?? "defecto";
const fresh = (l) => {
  const m = manifest[lang][l.id];
  return m?.text === hash(l[lang]) && m?.voice === voice && existsSync(join(outDir, `${l.id}.mp3`));
};
const pending = lines.filter((l) => !fresh(l));
console.log(`Atlas (${lang}): ${pending.length} de ${lines.length} líneas por generar.`);

for (const [i, line] of pending.entries()) {
  const text = line[lang];
  const started = Date.now();
  const res = await fetch(`${url}/voz`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texto: text }),
  });
  if (!res.ok) throw new Error(`La voz falló en ${line.id}: ${await res.text()}`);
  const wav = join(tmpdir(), `atlas-${lang}-${line.id}.wav`);
  writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
  // MP3 mono a 64 kbps: suficiente para voz y liviano para la web. loudnorm iguala el volumen entre líneas.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5", "-ac", "1", "-b:a", "64k", join(outDir, `${line.id}.mp3`)]);
  rmSync(wav);
  manifest[lang][line.id] = { text: hash(text), voice };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  [${i + 1}/${pending.length}] ${line.id} (${Math.round((Date.now() - started) / 1000)} s)`);
}

// Las líneas que ya no existen en el guion se quitan del manifiesto.
const ids = new Set(lines.map((l) => l.id));
for (const id of Object.keys(manifest[lang])) if (!ids.has(id)) delete manifest[lang][id];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Listo.");
