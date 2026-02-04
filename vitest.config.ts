import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "ts-builds/vitest"

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      exclude: ["node_modules", "dist", ".idea", ".git", ".cache", "tests/manual/**/*"],
      environment: "node",
      globals: true,
      testTimeout: 10000,
      setupFiles: ["./vitest.setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        exclude: ["node_modules/", "bin/", "logs/", "**/*.config.{js,ts}", "**/*.test.{js,ts}", "**/*.spec.{js,ts}"],
      },
    },
  }),
)
