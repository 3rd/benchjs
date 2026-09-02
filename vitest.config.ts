import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    includeSource: ["src/**/*.{ts,tsx}"],
    environment: "node",
    setupFiles: ["node:timers/promises", "vitest.setup.ts"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}"],
      reporter: process.env.CI ? "json" : "html-spa",
      thresholds: {
        statements: 90,
        functions: 90,
        branches: 90,
        lines: 90,
      },
    },
    testTimeout: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});

