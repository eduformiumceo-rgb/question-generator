import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // The curriculum data (src/shs, src/jhs, src/primary, src/kg, ~14 MB over 77 subjects) is LAZY-LOADED one subject at
    // a time (see src/curriculumLoaders.js), so the entry file stays small: about 870 KB (280 KB gzipped) as of this writing.
    // The limit sits just above that on purpose: if the build warns, something has started importing curriculum data eagerly
    // again, or a new dependency is very large. Raise it only after checking which of those it is.
    chunkSizeWarningLimit: 900,
  },
});
