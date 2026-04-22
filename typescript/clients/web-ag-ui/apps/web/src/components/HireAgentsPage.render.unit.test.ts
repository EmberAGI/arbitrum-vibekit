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
    expect(html).toContain(
      'rounded-3xl border border-[#E2D0BE] bg-gradient-to-b from-[#FFF9F2] to-[#F2E8DB]',
    );
    expect(html).toContain(
      'border border-[#E7D3BE] bg-gradient-to-r from-[#FFF4E8] via-[#FBEBDD] to-[#F6E4D4]',
    );
  });
});
