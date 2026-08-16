import { defineConfig } from "vite";

export default defineConfig({
  // transformers.js ships its own WASM runtime; let Vite leave it un-prebundled.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
});
