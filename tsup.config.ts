import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/bin/cli.ts"],
  format: ["esm"], // Only ESM due to top-level await
  dts: false, // Temporarily disable DTS due to Zod v4 compatibility issues
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  target: "node22", // Target Node 22.x
  outDir: "dist",
  shims: true,
  // Improve Node.js compatibility
  platform: "node",
  // Optimize bundle size
  treeshake: true,
  // Ensure proper module resolution
  replaceNodeEnv: true,
})
