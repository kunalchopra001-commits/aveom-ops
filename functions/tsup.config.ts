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
  // Runtime packages stay as require() calls and are installed in the cloud.
  external: ["firebase-admin", "firebase-functions", "exceljs"],
});
