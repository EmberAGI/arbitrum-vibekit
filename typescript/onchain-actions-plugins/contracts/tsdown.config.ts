import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'core/index': 'src/core/index.ts',
    'plugins/index': 'src/plugins/index.ts',
    'endpoints/index': 'src/endpoints/index.ts',
    'external-data/index': 'src/external-data/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['zod'],
});
