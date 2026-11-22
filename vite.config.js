import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // The curriculum data (src/shs, src/jhs, src/primary, src/kg, ~14 MB over 77 subjects) is LAZY-LOADED one subject at
    // a time (see src/curriculumLoaders.js), so the entry file is ~570 KB. This limit is deliberately tight: if the build
    // warns, something has started importing curriculum data eagerly again (or a new dependency is very large).
    chunkSizeWarningLimit: 900,
  },
});
