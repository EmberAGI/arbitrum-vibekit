import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutPath = path.resolve(process.cwd(), 'src/app/layout.tsx');

describe('RootLayout font wiring', () => {
  it('imports Roboto and Roboto Mono from next/font/google', () => {
    const source = fs.readFileSync(layoutPath, 'utf8');

    expect(source).toContain("from 'next/font/google'");
    expect(source).toContain('Roboto');
    expect(source).toContain('Roboto_Mono');
  });

  it('wires Roboto variables into body className', () => {
    const source = fs.readFileSync(layoutPath, 'utf8');

    expect(source).toContain("variable: '--font-roboto'");
    expect(source).toContain("variable: '--font-roboto-mono'");
    expect(source).toContain('roboto.variable');
    expect(source).toContain('robotoMono.variable');
  });
});
