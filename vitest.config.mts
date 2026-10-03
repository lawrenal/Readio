import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors the "@/*" -> "./src/*" alias from tsconfig.json — vitest doesn't
// read tsconfig paths on its own.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
