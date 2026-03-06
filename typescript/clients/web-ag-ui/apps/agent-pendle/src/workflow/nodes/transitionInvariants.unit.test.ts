import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const transitionNodes = ['prepareOperator.ts', 'runCycleCommand.ts', 'pollCycle.ts'] as const;

describe('Pendle transition invariants', () => {
  it.each(transitionNodes)('%s uses shared transition helpers (no direct Command construction)', async (fileName) => {
    const source = await readFile(new URL(`./${fileName}`, import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('graph uses guarded conditional routing after onboarding/cycle nodes', async () => {
    const source = await readFile(new URL('../../agent.ts', import.meta.url), 'utf8');

    expect(source.includes(".addConditionalEdges('runCycleCommand'")).toBe(true);
    expect(source.includes(".addConditionalEdges('collectFundingTokenInput'")).toBe(true);
    expect(source.includes(".addConditionalEdges('collectDelegations'")).toBe(true);
    expect(source.includes(".addConditionalEdges('prepareOperator'")).toBe(true);
    expect(source.includes(".addConditionalEdges('pollCycle'")).toBe(true);
  });
});
