import { defineConfig } from "vitest/config";

export default defineConfig({
  // Las misiones completas del piloto automático tardan unos segundos; con la máquina cargada pueden pasar de 5 s.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});
