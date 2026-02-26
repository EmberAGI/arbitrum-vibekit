import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectFundingTokenInputNode } from './collectFundingTokenInput.js';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

describe('collectFundingTokenInputNode', () => {
  it('uses state-driven routing and avoids direct Command construction', async () => {
    const source = await readFile(new URL('./collectFundingTokenInput.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('returns a state-only update when setup input is missing', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      view: {},
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, {});

    expect(result).toEqual({});
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });
});
