import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const tooltipPath = path.resolve(process.cwd(), 'src/components/ui/CursorListTooltip.tsx');

describe('CursorListTooltip title styles', () => {
  it('uses mono heading styling without forced uppercase', () => {
    const source = fs.readFileSync(tooltipPath, 'utf8');

    expect(source).toContain('font-mono');
    expect(source).not.toContain('uppercase tracking-[0.14em]');
  });
});
