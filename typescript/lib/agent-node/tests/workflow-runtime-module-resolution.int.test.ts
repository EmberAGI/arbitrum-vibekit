import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, afterEach } from 'vitest';

import type { EffectiveWorkflow } from '../src/config/composers/effective-set-composer.js';
import { WorkflowPluginLoader } from '../src/config/runtime/workflow-loader.js';

describe('Workflow runtime - per-workflow module resolution', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('resolves imports from workflow-local node_modules', async () => {
    // Given: a config workspace with a workflow that imports a local-only dependency
    const configDir = join(
      tmpdir(),
      `wf-module-res-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    tempDirs.push(configDir);
    const wfDir = join(configDir, 'workflows', 'pkg-wf');
    const nmDir = join(wfDir, 'node_modules', 'localdep');
    mkdirSync(nmDir, { recursive: true });

    // Local dependency exposed in workflow-local node_modules
    writeFileSync(join(nmDir, 'index.js'), `export default () => 'localdep-ok';`, 'utf-8');

    // Workflow entry imports the local dependency
    writeFileSync(
      join(wfDir, 'index.js'),
      `
import dep from 'localdep';
export default {
  id: 'pkg-wf',
  name: 'Package Workflow',
  version: '1.0.0',
  async *execute() {
    yield { type: 'artifact', artifact: { name: 'dep.txt', mimeType: 'text/plain', data: dep() } };
  }
};
`,
      'utf-8',
    );

    const effective: EffectiveWorkflow = {
      id: 'pkg-wf',
      entry: { id: 'pkg-wf', from: './workflows/pkg-wf/index.js', enabled: true },
      usedBySkills: [],
    };

    // When: loading the workflow via WorkflowPluginLoader
    const loader = new WorkflowPluginLoader();
    await loader.load([effective], configDir);
    const plugin = loader.getPlugin('pkg-wf');
    expect(plugin).toBeDefined();

    // Then: executing the workflow yields an artifact produced via local dependency
    const results: unknown[] = [];
    for await (const state of plugin!.plugin.execute({})) {
      results.push(state);
    }
    const hasLocalDepArtifact = results.some((y) => {
      if (
        y &&
        typeof y === 'object' &&
        'type' in y &&
        (y as { type?: unknown }).type === 'artifact'
      ) {
        const artifact = (y as { artifact?: { data?: unknown } }).artifact;
        return artifact?.data === 'localdep-ok';
      }
      return false;
    });
    expect(hasLocalDepArtifact).toBe(true);
  });
});
