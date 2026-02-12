import { describe, expect, it } from 'vitest';

import { resolveMetricsTabLabel } from './agentUi';

describe('agentUi', () => {
  it('labels the metrics tab as Metrics', () => {
    expect(resolveMetricsTabLabel('agent-gmx-allora')).toBe('Metrics');
    expect(resolveMetricsTabLabel('agent-clmm')).toBe('Metrics');
    expect(resolveMetricsTabLabel('agent-pendle')).toBe('Metrics');
  });
});
