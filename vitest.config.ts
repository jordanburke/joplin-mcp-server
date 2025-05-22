import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Test files pattern
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".idea", ".git", ".cache", "tests/manual/**/*"],

    // Test environment
    environment: "node",

    // Globals
    globals: true,

    // Test timeout
    testTimeout: 10000,

    // Coverage settings
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "bin/", "logs/", "**/*.config.{js,ts}", "**/*.test.{js,ts}", "**/*.spec.{js,ts}"],
    },

    // Setup files
    setupFiles: ["./vitest.setup.ts"],
  },
})
