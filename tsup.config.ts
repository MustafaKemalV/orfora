import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/openai.ts", "src/local.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
});
