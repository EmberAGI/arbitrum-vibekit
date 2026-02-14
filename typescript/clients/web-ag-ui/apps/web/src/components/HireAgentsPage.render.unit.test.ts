import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HireAgentsPage } from './HireAgentsPage';

describe('HireAgentsPage (render harness)', () => {
  it('renders in a node environment', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [],
        featuredAgents: [],
        onHireAgent: () => {},
        onViewAgent: () => {},
      }),
    );

    expect(html).toContain('Hire Agents');
  });
});

