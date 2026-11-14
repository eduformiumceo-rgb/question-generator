import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // Your curriculum data (src/shs, src/jhs, src/primary, src/kg) is ~16.5MB
    // total and eagerly imported by curriculumIndex.js. Raising this just
    // silences Vite's chunk-size warning — it does NOT fix the underlying
    // bundle-size issue the README already flagged. Splitting curriculum
    // data to load per-level is a real follow-up, not solved here.
    chunkSizeWarningLimit: 4000,
  },
});
