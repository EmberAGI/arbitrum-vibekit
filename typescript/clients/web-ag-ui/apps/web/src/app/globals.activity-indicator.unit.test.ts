import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsPath = path.resolve(process.cwd(), 'src/app/globals.css');

describe('Latest activity indicator animation', () => {
  it('uses a single thin overlay sweep with a hold before restarting', () => {
    const source = fs.readFileSync(globalsPath, 'utf8');

    expect(source).toContain('@keyframes latestActivitySweep');
    expect(source).toContain('78% {');
    expect(source).toContain('transform: translateX(-120%);');
    expect(source).toContain('transform: translateX(120%);');
    expect(source).toContain('.latest-activity-indicator::after');
    expect(source).toContain('content: attr(data-activity-text);');
    expect(source).toContain('color: var(--ember-card);');
    expect(source).toContain('clip-path: inset(0 45% 0 45%);');
    expect(source).toContain('will-change: transform;');
    expect(source).toContain('animation: latestActivitySweep 3.4s linear infinite;');
  });
});
