import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsPath = path.resolve(process.cwd(), 'src/app/globals.css');

describe('Latest activity indicator animation', () => {
  it('uses a single left-to-right sweep with a hold before restarting', () => {
    const source = fs.readFileSync(globalsPath, 'utf8');

    expect(source).toContain('@keyframes latestActivitySweep');
    expect(source).toContain('66.4% {');
    expect(source).toContain('background-position: -180% 50%;');
    expect(source).toContain('background-size: 320% 100%;');
    expect(source).toContain('background-position: 180% 50%;');
    expect(source).toContain('animation: latestActivitySweep 3.52s linear infinite;');
  });
});
