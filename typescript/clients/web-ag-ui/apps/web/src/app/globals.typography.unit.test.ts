import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsPath = path.resolve(process.cwd(), 'src/app/globals.css');

describe('Global typography wiring', () => {
  it('uses Roboto font variables for body and mono utility classes', () => {
    const source = fs.readFileSync(globalsPath, 'utf8');

    expect(source).toContain('font-family: var(--font-roboto)');
    expect(source).toContain('.font-mono {');
    expect(source).toContain('var(--font-roboto-mono)');
  });

  it('keeps table headers in title case instead of forced uppercase', () => {
    const source = fs.readFileSync(globalsPath, 'utf8');

    expect(source).toContain('.agent-table th {');
    expect(source).toContain('text-transform: none;');
  });
});
