import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

import { describe, it, expect, afterEach, vi } from 'vitest';

import { workflowDiscoverCommand } from '../src/cli/commands/workflow-discover.js';

import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

describe('workflow discover command integration', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  it('syncs new discovered workflows while retaining existing entries (no prune)', async () => {
    // Given: a config workspace with an existing registry entry
    const configDir = createTestConfigWorkspace({
      agentName: 'Discover Sync Test',
      skills: [],
    });
    tempDirs.push(configDir);

    // Existing registry entry not present on disk
    const registryPath = join(configDir, 'workflow.json');
    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          workflows: [{ id: 'existing', from: './workflows/existing/index.ts', enabled: false }],
        },
        null,
        2,
      ),
      'utf-8',
    );

    // Create discovered workflows on disk: a (index.ts) and b (workflow.ts)
    const workflowsDir = join(configDir, 'workflows');
    mkdirSync(join(workflowsDir, 'a'), { recursive: true });
    writeFileSync(join(workflowsDir, 'a', 'index.ts'), 'export default { id: "a" }', 'utf-8');
    mkdirSync(join(workflowsDir, 'b'), { recursive: true });
    writeFileSync(join(workflowsDir, 'b', 'workflow.ts'), 'export default { id: "b" }', 'utf-8');

    // When: running discover with --sync (no --prune)
    workflowDiscoverCommand({ configDir, sync: true });

    // Then: registry should contain existing + new additions
    const next = JSON.parse(readFileSync(registryPath, 'utf-8')) as {
      workflows: Array<{ id: string; from: string; enabled?: boolean }>;
    };
    const ids = next.workflows.map((w) => w.id).sort();
    expect(ids).toEqual(['a', 'b', 'existing']);

    // Existing entry retained with original fields
    const existing = next.workflows.find((w) => w.id === 'existing');
    expect(existing?.from).toBe('./workflows/existing/index.ts');
    expect(existing?.enabled).toBe(false);

    // New additions default to enabled=true
    const addedA = next.workflows.find((w) => w.id === 'a');
    const addedB = next.workflows.find((w) => w.id === 'b');
    expect(addedA?.enabled ?? true).toBe(true);
    expect(addedB?.enabled ?? true).toBe(true);
    // Path should reference workflows/<id>/
    expect(addedA?.from).toContain('workflows/a/');
    expect(addedB?.from).toContain('workflows/b/');
  });

  it('adds new entries as disabled when --disabled is provided', async () => {
    // Given
    const configDir = createTestConfigWorkspace({
      agentName: 'Discover Disabled Test',
      skills: [],
    });
    tempDirs.push(configDir);
    const workflowsDir = join(configDir, 'workflows');
    mkdirSync(join(workflowsDir, 'c'), { recursive: true });
    writeFileSync(join(workflowsDir, 'c', 'index.ts'), 'export default { id: "c" }', 'utf-8');

    // When
    workflowDiscoverCommand({ configDir, sync: true, disabled: true });

    // Then
    const next = JSON.parse(readFileSync(join(configDir, 'workflow.json'), 'utf-8')) as {
      workflows: Array<{ id: string; enabled?: boolean }>;
    };
    const c = next.workflows.find((w) => w.id === 'c');
    expect(c?.enabled).toBe(false);
  });

  it('prunes entries not present on disk when --prune is provided', async () => {
    // Given
    const configDir = createTestConfigWorkspace({
      agentName: 'Discover Prune Test',
      skills: [],
    });
    tempDirs.push(configDir);
    const registryPath = join(configDir, 'workflow.json');
    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          workflows: [{ id: 'ghost', from: './workflows/ghost/index.ts', enabled: true }],
        },
        null,
        2,
      ),
      'utf-8',
    );
    const workflowsDir = join(configDir, 'workflows');
    mkdirSync(join(workflowsDir, 'd'), { recursive: true });
    writeFileSync(join(workflowsDir, 'd', 'index.ts'), 'export default { id: "d" }', 'utf-8');

    // When
    workflowDiscoverCommand({ configDir, sync: true, prune: true });

    // Then
    const next = JSON.parse(readFileSync(registryPath, 'utf-8')) as {
      workflows: Array<{ id: string }>;
    };
    const ids = next.workflows.map((w) => w.id).sort();
    expect(ids).toEqual(['d']); // 'ghost' removed
  });

  it('dry-run prints changes without modifying workflow.json', async () => {
    // Given
    const configDir = createTestConfigWorkspace({
      agentName: 'Discover Dry-Run Test',
      skills: [],
    });
    tempDirs.push(configDir);
    const registryPath = join(configDir, 'workflow.json');
    const original = readFileSync(registryPath, 'utf-8');
    const workflowsDir = join(configDir, 'workflows');
    mkdirSync(join(workflowsDir, 'e'), { recursive: true });
    writeFileSync(join(workflowsDir, 'e', 'index.ts'), 'export default { id: "e" }', 'utf-8');

    // Spy on console to ensure command runs (avoid brittle text assertions)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // When
    workflowDiscoverCommand({ configDir, sync: true, dryRun: true });

    // Then: registry unchanged
    const now = readFileSync(registryPath, 'utf-8');
    expect(now).toBe(original);

    // Cleanup spy
    consoleSpy.mockRestore();
  });
});
