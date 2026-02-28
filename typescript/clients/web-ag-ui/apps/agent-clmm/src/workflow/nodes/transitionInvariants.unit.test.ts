import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const transitionNodes = [
  'listPools.ts',
  'prepareOperator.ts',
  'runCycleCommand.ts',
  'pollCycle.ts',
] as const;

describe('CLMM transition invariants', () => {
  it.each(transitionNodes)('%s uses shared transition helpers (no direct Command construction)', async (fileName) => {
    const source = await readFile(new URL(`./${fileName}`, import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });
});

