import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const specificationPaths = [
  'docs/specs/index.spec.html',
  'docs/specs/domains/external-data-evidence-contract.spec.html',
  'docs/adr/0001-neutral-data-contract-package.spec.html',
] as const;

async function readSpecification(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('canonical onchain-action contract specifications', () => {
  it('keeps the annotation runtime from overriding the canonical document theme', async () => {
    const [runtime, stylesheet] = await Promise.all([
      readFile(path.join(repositoryRoot, 'docs/specs/.viz/runtime.js'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docs/specs/.style/spec.css'), 'utf8'),
    ]);
    const runtimeStyles = /const CSS = `([\s\S]*?)`;/u.exec(runtime)?.[1];

    expect(runtimeStyles).toBeDefined();
    expect(stylesheet).toMatch(/body\s*\{[^}]*background:/su);
    expect(stylesheet).toMatch(/body\s*\{[^}]*color:\s*var\(--ink\)/su);
    expect(runtimeStyles).not.toMatch(/(?:^|\n|\})\s*body\s*\{[^}]*(?:background|color)\s*:/su);

    for (const relativePath of specificationPaths) {
      const document = await readSpecification(relativePath);

      expect(document).toContain('<main>');
      expect(document).not.toContain('<article class="spec">');
    }
  });

  it('keeps local document, stylesheet, and renderer links resolvable', async () => {
    for (const relativePath of specificationPaths) {
      const document = await readSpecification(relativePath);
      const hrefs = [...document.matchAll(/\b(?:href|src)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((href): href is string => href !== undefined);

      for (const href of hrefs) {
        if (/^(?:https?:|#)/.test(href)) {
          continue;
        }

        const target = path.resolve(repositoryRoot, path.dirname(relativePath), href);

        await expect(readFile(target)).resolves.toBeDefined();
      }
    }
  });

  it('keeps stable anchors unique and rendered diagrams accessibly labelled', async () => {
    const anchors = new Set<string>();
    let labelledDiagramCount = 0;

    for (const relativePath of specificationPaths) {
      const document = await readSpecification(relativePath);
      const documentAnchors = [...document.matchAll(/\bdata-anchor="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((anchor): anchor is string => anchor !== undefined);

      expect(documentAnchors.length).toBeGreaterThan(0);

      for (const anchor of documentAnchors) {
        expect(anchors.has(anchor), `duplicate data-anchor: ${anchor}`).toBe(false);
        anchors.add(anchor);
      }

      for (const [, labelledBy] of document.matchAll(
        /<svg\b[^>]*\brole="img"[^>]*\baria-labelledby="([^"]+)"/g,
      )) {
        if (labelledBy === undefined) {
          throw new Error('diagram aria-labelledby capture is missing');
        }

        labelledDiagramCount += 1;
        const labelIds = labelledBy.split(/\s+/);

        expect(labelIds).toHaveLength(2);
        expect(document).toContain(`<title id="${labelIds[0]}">`);
        expect(document).toContain(`<desc id="${labelIds[1]}">`);
      }
    }

    expect(labelledDiagramCount).toBe(3);
  });
});
