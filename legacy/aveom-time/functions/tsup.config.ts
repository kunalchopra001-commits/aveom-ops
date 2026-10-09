import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node22",
  outDir: "lib",
  clean: true,
  sourcemap: true,
  bundle: true,
  // Heavy / runtime-resolved packages stay as normal require() calls and are
  // installed in the cloud from package.json dependencies.
  external: ["firebase-admin", "firebase-functions", "exceljs", "openai"],
});
