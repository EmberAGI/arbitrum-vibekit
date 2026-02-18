import { describe, expect, it } from 'vitest';

import { resolveMetricsRendererId } from './agentMetricsRegistry';

describe('agentMetricsRegistry', () => {
  it('resolves agent-specific renderer ids', () => {
    expect(resolveMetricsRendererId('agent-gmx-allora')).toBe('agent-gmx-allora');
    expect(resolveMetricsRendererId('agent-pendle')).toBe('agent-pendle');
  });

  it('falls back to default renderer for unknown agents', () => {
    expect(resolveMetricsRendererId('agent-clmm')).toBe('default');
    expect(resolveMetricsRendererId('unknown')).toBe('default');
  });
});
