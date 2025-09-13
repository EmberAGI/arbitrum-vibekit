import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
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
    '@gmx-io/sdk',
    'ethers',
    'zod',
  ],
});
