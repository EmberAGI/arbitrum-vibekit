import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('pollCycleNode', () => {
  it('uses core transition helpers instead of direct Command construction', async () => {
    const source = await readFile(new URL('./pollCycle.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });
});
