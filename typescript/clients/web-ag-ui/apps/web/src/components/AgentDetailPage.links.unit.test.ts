import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentDetailPage } from './AgentDetailPage';

describe('AgentDetailPage (header links)', () => {
  it('removes the printer icon and renders website/github/x links', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).not.toContain('lucide-printer');
    expect(html).toContain('href="https://emberai.xyz"');
    expect(html).toContain('href="https://github.com/EmberAGI/arbitrum-vibekit"');
    expect(html).toContain('href="https://x.com/emberagi"');
  });

  it('renders hired detail chrome with the light-shell refresh treatment', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-portfolio-manager',
        agentName: 'Ember Portfolio Agent',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('border-[#eadac7]');
    expect(html).toContain('bg-white/80');
    expect(html).not.toContain('bg-[#2a2a2a] hover:bg-[#333] text-white');
  });
});
