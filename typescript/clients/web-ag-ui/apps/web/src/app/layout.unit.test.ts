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

  it('does not hard-force a dark document shell', () => {
    const source = fs.readFileSync(layoutPath, 'utf8');

    expect(source).not.toContain('<html lang="en" className="dark"');
    expect(source).not.toContain("colorScheme: 'dark'");
    expect(source).not.toContain("document.documentElement.className='dark'");
    expect(source).not.toContain("bg-[#09090B]");
    expect(source).not.toContain("text-[#D1D1D1]");
  });

  it('renders the persistent portfolio top bar above every page', () => {
    const source = fs.readFileSync(layoutPath, 'utf8');

    expect(source).toContain("import { GlobalPortfolioTopBarNoSSR }");
    expect(source).toContain("import { AuthoritativeAgentSnapshotCacheProvider }");
    expect(source).toContain("import { InactiveAgentProvider }");
    expect(source).toContain('flex h-screen flex-col overflow-hidden');
    expect(source).toContain('flex min-h-0 flex-1 overflow-hidden');
    expect(source.indexOf('<AuthoritativeAgentSnapshotCacheProvider>')).toBeLessThan(
      source.indexOf('<InactiveAgentProvider>'),
    );
    expect(source.indexOf('<InactiveAgentProvider>')).toBeLessThan(
      source.indexOf('<GlobalPortfolioTopBarNoSSR />'),
    );
    expect(source.indexOf('<GlobalPortfolioTopBarNoSSR />')).toBeLessThan(source.indexOf('<AppSidebarNoSSR />'));
    expect(source.indexOf('<GlobalPortfolioTopBarNoSSR />')).toBeLessThan(source.indexOf('{children}'));
    expect(source.indexOf('<AppSidebarNoSSR />')).toBeLessThan(source.indexOf('<AgentRuntimeProvider>'));
    expect(source.indexOf('<AgentRuntimeProvider>')).toBeLessThan(source.indexOf('{children}'));
  });
});
