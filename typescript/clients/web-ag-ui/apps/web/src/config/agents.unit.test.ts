import { describe, expect, it } from 'vitest';

import {
  AGENT_REGISTRY,
  getAgentConfig,
  getAllAgents,
  getFeaturedAgents,
  getVisibleAgents,
  isRegisteredAgentId,
} from './agents';

describe('agents config', () => {
  it('returns registered agent config and feature ordering', () => {
    const clmm = getAgentConfig('agent-clmm');
    const piExample = getAgentConfig('agent-pi-example');
    const portfolioManager = getAgentConfig('agent-portfolio-manager');
    const emberLending = getAgentConfig('agent-ember-lending');
    expect(clmm.name).toBe('Camelot CLMM');
    expect(piExample.name).toBe('Pi Example Agent');
    expect(portfolioManager.name).toBe('Portfolio Manager');
    expect(emberLending.name).toBe('Ember Lending');
    expect(emberLending.onboardingOwnerAgentId).toBe('agent-portfolio-manager');
    expect(isRegisteredAgentId('agent-clmm')).toBe(true);
    expect(isRegisteredAgentId('agent-pi-example')).toBe(true);
    expect(isRegisteredAgentId('agent-portfolio-manager')).toBe(true);
    expect(isRegisteredAgentId('agent-ember-lending')).toBe(true);

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

  it('excludes internal-only agents from visible user-facing lists', () => {
    const allAgentIds = getAllAgents().map((agent) => agent.id);
    const visibleAgentIds = getVisibleAgents().map((agent) => agent.id);

    expect(allAgentIds).toContain('agent-pi-example');
    expect(visibleAgentIds).not.toContain('agent-pi-example');
    expect(visibleAgentIds).toContain('agent-portfolio-manager');
    expect(visibleAgentIds).toContain('agent-ember-lending');
  });
});
