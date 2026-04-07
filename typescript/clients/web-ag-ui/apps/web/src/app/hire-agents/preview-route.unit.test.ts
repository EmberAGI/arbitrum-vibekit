import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const routePath = path.resolve(process.cwd(), 'src/app/hire-agents/[id]/page.tsx');

describe('Hire agents preview route wiring', () => {
  it('accepts a real tab query param while keeping preview tab fallback and no legacy onboarding props', () => {
    const source = fs.readFileSync(routePath, 'utf8');

    expect(source).toContain("type AgentRouteTab = 'blockers' | 'metrics' | 'transactions' | 'chat';");
    expect(source).not.toContain("value === 'settings'");
    expect(source).toContain("const requestedTab = parseAgentRouteTab(searchParams.get('tab'));");
    expect(source).toContain("const uiPreviewTab = uiPreviewEnabled ? parseAgentRouteTab(searchParams.get('__tab')) : null;");
    expect(source).toContain('const selectedTab = requestedTab ?? uiPreviewTab;');
    expect(source).not.toContain('onboarding={');
  });
});
