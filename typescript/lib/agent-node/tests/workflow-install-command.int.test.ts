import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { workflowInstallCommand } from '../src/cli/commands/workflow-install.js';

describe('workflow install command integration', () => {
  let testDir: string;
  let configDir: string;
  let workflowsDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = join(tmpdir(), `workflow-install-int-${Date.now()}`);
    configDir = join(testDir, 'config');
    workflowsDir = join(configDir, 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should install all workflows successfully', async () => {
    // Given: a simple workflow with minimal package.json (no deps for speed)
    const workflow1 = join(workflowsDir, 'test-workflow-1');
    mkdirSync(workflow1);
    writeFileSync(
      join(workflow1, 'package.json'),
      JSON.stringify({
        name: 'test-workflow-1',
        version: '1.0.0',
        description: 'Test workflow 1',
        main: 'index.js',
        // No dependencies for faster test
      }),
    );
    writeFileSync(join(workflow1, 'index.js'), 'module.exports = { test: true };');

    // When: installing all workflows
    await workflowInstallCommand(undefined, { configDir, all: true });

    // Then: pnpm creates node_modules in workflow directory
    expect(existsSync(join(workflow1, 'node_modules'))).toBe(true);

    // And: creates pnpm-lock.yaml in workflow directory
    expect(existsSync(join(workflow1, 'pnpm-lock.yaml'))).toBe(true);

    // And: NOT in the config or monorepo root
    expect(existsSync(join(configDir, 'node_modules'))).toBe(false);
    expect(existsSync(join(configDir, 'pnpm-lock.yaml'))).toBe(false);
    expect(existsSync(join(testDir, 'node_modules'))).toBe(false);
    expect(existsSync(join(testDir, 'pnpm-lock.yaml'))).toBe(false);
  });

  it('should install specific workflow by name', async () => {
    // Given: two workflows
    const workflow1 = join(workflowsDir, 'workflow-to-install');
    mkdirSync(workflow1);
    writeFileSync(
      join(workflow1, 'package.json'),
      JSON.stringify({
        name: 'workflow-to-install',
        version: '1.0.0',
      }),
    );
    writeFileSync(join(workflow1, 'index.js'), 'module.exports = {};');

    const workflow2 = join(workflowsDir, 'workflow-to-skip');
    mkdirSync(workflow2);
    writeFileSync(
      join(workflow2, 'package.json'),
      JSON.stringify({
        name: 'workflow-to-skip',
        version: '1.0.0',
      }),
    );
    writeFileSync(join(workflow2, 'index.js'), 'module.exports = {};');

    // When: installing specific workflow
    await workflowInstallCommand('workflow-to-install', { configDir });

    // Then: only the specified workflow gets node_modules
    expect(existsSync(join(workflow1, 'node_modules'))).toBe(true);
    expect(existsSync(join(workflow1, 'pnpm-lock.yaml'))).toBe(true);

    // And: the other workflow doesn't
    expect(existsSync(join(workflow2, 'node_modules'))).toBe(false);
    expect(existsSync(join(workflow2, 'pnpm-lock.yaml'))).toBe(false);
  });

  it('should use frozen lockfile in CI mode', async () => {
    // Given: a workflow
    const workflow1 = join(workflowsDir, 'ci-workflow');
    mkdirSync(workflow1);
    writeFileSync(
      join(workflow1, 'package.json'),
      JSON.stringify({
        name: 'ci-workflow',
        version: '1.0.0',
      }),
    );
    writeFileSync(join(workflow1, 'index.js'), 'module.exports = {};');

    // When: first installing normally to generate a lockfile
    await workflowInstallCommand(undefined, { configDir });
    const initialLockfile = await import('fs').then((fs) =>
      fs.promises.readFile(join(workflow1, 'pnpm-lock.yaml'), 'utf-8'),
    );
    expect(initialLockfile.length).toBeGreaterThan(0);

    // When: installing with frozen-lockfile
    await workflowInstallCommand(undefined, { configDir, frozenLockfile: true });

    // Then: node_modules still present and lockfile unchanged
    expect(existsSync(join(workflow1, 'node_modules'))).toBe(true);
    const frozenLockfile = await import('fs').then((fs) =>
      fs.promises.readFile(join(workflow1, 'pnpm-lock.yaml'), 'utf-8'),
    );
    expect(frozenLockfile).toBe(initialLockfile);
  });

  it('should handle missing workflow gracefully', async () => {
    // Given: one installable workflow exists
    const existing = join(workflowsDir, 'existing');
    mkdirSync(existing);
    writeFileSync(
      join(existing, 'package.json'),
      JSON.stringify({ name: 'existing', version: '1.0.0' }),
    );
    writeFileSync(join(existing, 'index.js'), 'module.exports = {};');

    // When: trying to install non-existent workflow
    const promise = workflowInstallCommand('does-not-exist', { configDir });

    // Then: it throws with helpful error
    await expect(promise).rejects.toThrow('Workflow "does-not-exist" not found or not installable');
  });

  it('should run pnpm in correct directory (workflow dir, not root)', async () => {
    // Given: a workflow with package.json
    const workflowName = 'location-test';
    const workflow1 = join(workflowsDir, workflowName);
    mkdirSync(workflow1);
    writeFileSync(
      join(workflow1, 'package.json'),
      JSON.stringify({
        name: workflowName,
        version: '1.0.0',
      }),
    );
    writeFileSync(join(workflow1, 'index.js'), 'module.exports = {};');

    // When: installing
    await workflowInstallCommand(workflowName, { configDir });

    // Then: pnpm artifacts are only in workflow directory
    expect(existsSync(join(workflow1, 'node_modules'))).toBe(true);
    expect(existsSync(join(workflow1, 'pnpm-lock.yaml'))).toBe(true);

    // And: workspace isolation - nothing in parent directories
    expect(existsSync(join(workflowsDir, 'node_modules'))).toBe(false);
    expect(existsSync(join(workflowsDir, 'pnpm-lock.yaml'))).toBe(false);
    expect(existsSync(join(configDir, 'node_modules'))).toBe(false);
    expect(existsSync(join(configDir, 'pnpm-lock.yaml'))).toBe(false);
  });

  it('should create separate pnpm-lock.yaml per workflow', async () => {
    // Given: multiple workflows
    const workflow1 = join(workflowsDir, 'workflow-a');
    mkdirSync(workflow1);
    writeFileSync(
      join(workflow1, 'package.json'),
      JSON.stringify({
        name: 'workflow-a',
        version: '1.0.0',
      }),
    );
    writeFileSync(join(workflow1, 'index.js'), 'module.exports = {};');

    const workflow2 = join(workflowsDir, 'workflow-b');
    mkdirSync(workflow2);
    writeFileSync(
      join(workflow2, 'package.json'),
      JSON.stringify({
        name: 'workflow-b',
        version: '1.0.0',
      }),
    );
    writeFileSync(join(workflow2, 'index.js'), 'module.exports = {};');

    // When: installing all workflows
    await workflowInstallCommand(undefined, { configDir });

    // Then: each workflow has its own lockfile
    expect(existsSync(join(workflow1, 'pnpm-lock.yaml'))).toBe(true);
    expect(existsSync(join(workflow2, 'pnpm-lock.yaml'))).toBe(true);

    // And: they're independent (different directories)
    const files1 = readdirSync(workflow1);
    const files2 = readdirSync(workflow2);
    expect(files1).toContain('pnpm-lock.yaml');
    expect(files2).toContain('pnpm-lock.yaml');
  });

  it('should not mutate monorepo lockfile', async () => {
    // Given: a monorepo root with existing lockfile
    writeFileSync(join(testDir, 'pnpm-lock.yaml'), 'original-monorepo-lockfile-content');

    // And: a workflow
    const workflow1 = join(workflowsDir, 'isolated-workflow');
    mkdirSync(workflow1);
    writeFileSync(
      join(workflow1, 'package.json'),
      JSON.stringify({
        name: 'isolated-workflow',
        version: '1.0.0',
      }),
    );
    writeFileSync(join(workflow1, 'index.js'), 'module.exports = {};');

    // When: installing workflow
    await workflowInstallCommand(undefined, { configDir });

    // Then: monorepo lockfile is unchanged
    const monorepoLockfile = await import('fs').then((fs) =>
      fs.promises.readFile(join(testDir, 'pnpm-lock.yaml'), 'utf-8'),
    );
    expect(monorepoLockfile).toBe('original-monorepo-lockfile-content');

    // And: workflow has its own lockfile
    expect(existsSync(join(workflow1, 'pnpm-lock.yaml'))).toBe(true);
  });

  it('should skip non-installable workflows (no package.json)', async () => {
    // Given: a workflow without package.json
    const workflow1 = join(workflowsDir, 'simple-script');
    mkdirSync(workflow1);
    writeFileSync(join(workflow1, 'index.js'), 'module.exports = {};');

    // And: a workflow with package.json
    const workflow2 = join(workflowsDir, 'package-workflow');
    mkdirSync(workflow2);
    writeFileSync(
      join(workflow2, 'package.json'),
      JSON.stringify({
        name: 'package-workflow',
        version: '1.0.0',
      }),
    );
    writeFileSync(join(workflow2, 'index.js'), 'module.exports = {};');

    // When: installing all
    await workflowInstallCommand(undefined, { configDir });

    // Then: only the package workflow gets installed
    expect(existsSync(join(workflow1, 'node_modules'))).toBe(false);
    expect(existsSync(join(workflow2, 'node_modules'))).toBe(true);
  });

  it('should handle partial success correctly', async () => {
    // Given: one valid and one invalid workflow
    const validWorkflow = join(workflowsDir, 'valid');
    mkdirSync(validWorkflow);
    writeFileSync(
      join(validWorkflow, 'package.json'),
      JSON.stringify({
        name: 'valid',
        version: '1.0.0',
      }),
    );
    writeFileSync(join(validWorkflow, 'index.js'), 'module.exports = {};');

    const invalidWorkflow = join(workflowsDir, 'invalid');
    mkdirSync(invalidWorkflow);
    writeFileSync(
      join(invalidWorkflow, 'package.json'),
      JSON.stringify({
        name: 'invalid',
        version: '1.0.0',
        dependencies: {
          // Non-existent package to cause install failure
          'definitely-does-not-exist-package-xyz': '^99.99.99',
        },
      }),
    );
    writeFileSync(join(invalidWorkflow, 'index.js'), 'module.exports = {};');

    // When: installing all workflows
    await workflowInstallCommand(undefined, { configDir });

    // Then: valid workflow succeeds
    expect(existsSync(join(validWorkflow, 'node_modules'))).toBe(true);

    // And: invalid workflow fails (no node_modules created)
    expect(existsSync(join(invalidWorkflow, 'node_modules'))).toBe(false);
  });
});
