import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const interruptNodes = [
  'collectSetupInput.ts',
  'collectFundingTokenInput.ts',
  'collectDelegations.ts',
] as const;

describe('Pendle interrupt invariants', () => {
  it.each(interruptNodes)('%s uses shared interrupt payload helpers', async (fileName) => {
    const source = await readFile(new URL(`./${fileName}`, import.meta.url), 'utf8');
    expect(source.includes('requestInterruptPayload(')).toBe(true);
    expect(source.includes('JSON.parse(')).toBe(false);
  });
});

