import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'es2022',
  tsconfig: './tsconfig.json',
  skipNodeModulesBundle: true,
  external: [
    '@aave/contract-helpers',
    '@aave/math-utils',
    '@bgd-labs/aave-address-book',
    'ethers',
    'zod',
  ],
});
