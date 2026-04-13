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
    expect(portfolioManager.name).toBe('Ember Portfolio Agent');
    expect(portfolioManager.imageUrl).toBe(
      'https://www.emberai.xyz/Logo.svg?dpl=dpl_J6BA6gqb9V9kgyUjTjKdpkPToAd7',
    );
    expect(portfolioManager.marketplaceCardBg).toBe('rgba(124,58,237,0.10)');
    expect(portfolioManager.marketplaceCardHoverBg).toBe('rgba(124,58,237,0.14)');
    expect(portfolioManager.marketplaceRowBg).toBe('rgba(124,58,237,0.08)');
    expect(portfolioManager.marketplaceRowHoverBg).toBe('rgba(124,58,237,0.12)');
    expect(portfolioManager.surfaceTag).toBe('Swarm');
    expect(emberLending.name).toBe('Ember Lending');
    expect(emberLending.description).toBe(
      'Executes lending strategies within the mandates you approve, monitors positions in the background, and keeps capital deployed within your policy and risk limits.',
    );
    expect(emberLending.imageUrl).toBe('/ember-lending-avatar.svg');
    expect(emberLending.avatarBg).toBe('#9896FF');
    expect(emberLending.onboardingOwnerAgentId).toBe('agent-portfolio-manager');
    expect(emberLending.surfaceTag).toBe('Swarm');
    expect(emberLending.protocols).toEqual(['Aave']);
    expect(clmm.surfaceTag).toBe('Workflow');
    expect(clmm.imperativeCommandTransport).toBe('forwarded-props');
    expect(clmm.settingsSyncTransport).toBe('sync-command');
    expect(piExample.imperativeCommandTransport).toBe('forwarded-props');
    expect(piExample.settingsSyncTransport).toBe('sync-command');
    expect(portfolioManager.imperativeCommandTransport).toBe('forwarded-props');
    expect(portfolioManager.settingsSyncTransport).toBe('shared-state-update');
    expect(emberLending.settingsSyncTransport).toBe('shared-state-update');
    expect(isRegisteredAgentId('agent-clmm')).toBe(true);
    expect(isRegisteredAgentId('agent-pi-example')).toBe(true);
    expect(isRegisteredAgentId('agent-portfolio-manager')).toBe(true);
    expect(isRegisteredAgentId('agent-ember-lending')).toBe(true);

    const featured = getFeaturedAgents();
    expect(featured.map((agent) => agent.id)).toEqual([
      'agent-portfolio-manager',
      'agent-ember-lending',
      'agent-clmm',
      'agent-pendle',
      'agent-gmx-allora',
    ]);
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
