import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend-free build. Everything (including the analysis Web Worker) is bundled
// into static assets that can be served from any static host or CDN.
export default defineConfig({
  plugins: [react()],
  // Use relative asset paths so the build can be hosted from any sub-path.
  base: "./",
  worker: {
    // The analysis worker is an ES module worker; keep it as ESM after bundling.
    format: "es",
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
  },
});
