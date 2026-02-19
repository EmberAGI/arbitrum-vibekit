import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HireAgentsPage } from './HireAgentsPage';

describe('HireAgentsPage (skeleton numbers)', () => {
  it('renders skeletons for agent numeric fields until list sync has completed', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [
          {
            id: 'agent-clmm',
            name: 'Camelot CLMM',
            creator: 'Ember AI Team',
            status: 'for_hire',
            isLoaded: false,
          },
        ],
        featuredAgents: [
          {
            id: 'agent-clmm',
            name: 'Camelot CLMM',
            status: 'for_hire',
            isLoaded: false,
            chains: [],
            protocols: [],
          },
        ],
      }),
    );

    expect(html).toContain('animate-pulse');
  });
});
