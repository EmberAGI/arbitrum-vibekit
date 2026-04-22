import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const routePath = path.resolve(process.cwd(), 'src/app/hire-agents/[id]/page.tsx');

describe('Hire agents preview route wiring', () => {
  it('requires an explicit preview flag before accepting preview-only query params', () => {
    const source = fs.readFileSync(routePath, 'utf8');

    expect(source).toContain("type AgentRouteTab = 'blockers' | 'metrics' | 'transactions' | 'chat';");
    expect(source).toContain("type UiPreviewFixture = 'managed';");
    expect(source).not.toContain("value === 'settings'");
    expect(source).toContain("const uiPreviewEnabled = process.env.NEXT_PUBLIC_UI_PREVIEW === 'true';");
    expect(source).not.toContain("process.env.NODE_ENV === 'development'");
    expect(source).toContain("const requestedTab = parseAgentRouteTab(searchParams.get('tab'));");
    expect(source).toContain("const uiPreviewTab = uiPreviewEnabled ? parseAgentRouteTab(searchParams.get('__tab')) : null;");
    expect(source).toContain("const uiPreviewFixture = uiPreviewEnabled ? parseUiPreviewFixture(searchParams.get('__fixture')) : null;");
    expect(source).toContain('const selectedTab = requestedTab ?? uiPreviewTab;');
    expect(source).toContain('const previewLifecycleState = buildUiPreviewLifecycleState({');
    expect(source).toContain('const previewDomainProjection = buildUiPreviewDomainProjection({');
    expect(source).toContain('fixture: uiPreviewFixture,');
    expect(source).toContain('lifecycleState={previewLifecycleState}');
    expect(source).toContain('domainProjection={previewDomainProjection}');
    expect(source).not.toContain('lastOnboardingBootstrap:');
    expect(source).not.toContain('onboarding={');
  });
});
