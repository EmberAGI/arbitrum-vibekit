import { describe, expect, it } from 'vitest';

import {
  AGENT_REGISTRY,
  getAgentConfig,
  getAllAgents,
  getFeaturedAgents,
  isRegisteredAgentId,
} from './agents';

describe('agents config', () => {
  it('returns registered agent config and feature ordering', () => {
    const clmm = getAgentConfig('agent-clmm');
    expect(clmm.name).toBe('Camelot CLMM');
    expect(isRegisteredAgentId('agent-clmm')).toBe(true);

    const featured = getFeaturedAgents();
    expect(featured.map((agent) => agent.id)).toEqual(['agent-clmm', 'agent-pendle', 'agent-gmx-allora']);
  });

  it('returns a formatted fallback config for unknown agents', () => {
    const unknown = getAgentConfig('agent-alpha-beta');
    expect(unknown.id).toBe('agent-alpha-beta');
    expect(unknown.name).toBe('Agent Alpha Beta');
    expect(unknown.creator).toBe('Unknown');
    expect(unknown.creatorVerified).toBe(false);
    expect(isRegisteredAgentId('agent-alpha-beta')).toBe(false);
  });

  it('returns every static registry entry through getAllAgents', () => {
    const ids = getAllAgents().map((agent) => agent.id).sort();
    expect(ids).toEqual(Object.keys(AGENT_REGISTRY).sort());
  });
});
