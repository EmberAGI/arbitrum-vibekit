import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const routePath = path.resolve(process.cwd(), 'src/app/hire-agents/[id]/page.tsx');

describe('Hire agents preview route wiring', () => {
  it('drops settings from preview tab parsing and preserves onboarding key wiring', () => {
    const source = fs.readFileSync(routePath, 'utf8');

    expect(source).toContain("type UiPreviewTab = 'blockers' | 'metrics' | 'transactions' | 'chat';");
    expect(source).not.toContain("value === 'settings'");
    expect(source).toContain("{ step: 2, key: 'setup-agent' }");
  });
});
