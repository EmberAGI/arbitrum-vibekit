import copy from 'rollup-plugin-copy';
import { defineConfig } from 'tsdown';

export default defineConfig({
  // Entry point - use glob pattern to include all source files except tests
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/cli/templates/**/*.ts'],

  // Unbundle mode - preserves directory structure like tsc
  unbundle: true,

  // Output format - ESM only (matching NodeNext module resolution)
  format: ['esm'],

  // Platform target
  platform: 'node',

  // Enable TypeScript declarations (.d.ts files)
  dts: true,

  // Enable source maps for debugging
  sourcemap: true,

  // Clean output directory before build
  clean: true,

  // Output directory
  outDir: 'dist',

  // Use Rollup plugin to copy templates to exact destination
  plugins: [
    copy({
      targets: [
        {
          src: 'src/cli/templates/**',
          dest: 'dist/cli/templates',
        },
        {
          src: '.env.example',
          dest: 'dist',
        },
      ],
      hook: 'writeBundle', // Copy after bundle is written
    }),
  ],

  // Target ES2022 (matching tsconfig)
  target: 'es2022',
});
