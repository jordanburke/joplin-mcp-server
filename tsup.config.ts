import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts', 'bin/cli.ts'],
  format: ['esm'], // Only ESM due to top-level await
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  target: 'node18', // Support wider range of Node versions
  outDir: 'dist',
  shims: true,
  // Improve Node.js compatibility
  platform: 'node',
  // Optimize bundle size
  treeshake: true,
  // Ensure proper module resolution
  replaceNodeEnv: true,
});