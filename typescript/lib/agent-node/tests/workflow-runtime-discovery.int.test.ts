import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, beforeEach, afterEach } from 'vitest';

/**
 * Integration tests for workflow runtime discovery
 * These tests are SKIPPED until runtime discovery is wired into runtime/init.ts
 *
 * Once implemented, the runtime should:
 * 1. Automatically discover workflows from the filesystem
 * 2. Merge discovered workflows with registry workflows
 * 3. Support hot reload for discovered workflows
 */
describe('Workflow Runtime Discovery Integration', () => {
  let testDir: string;
  let configDir: string;
  let workflowsDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = join(tmpdir(), `workflow-runtime-discovery-${Date.now()}`);
    configDir = join(testDir, 'config');
    workflowsDir = join(configDir, 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe.skip('Runtime Loading of Discovered Workflows', () => {
    it.skip('should load discovered workflows at runtime', async () => {
      // Given: discovered workflows in the filesystem
      const discoveredWorkflow = join(workflowsDir, 'runtime-discovered');
      mkdirSync(discoveredWorkflow);
      writeFileSync(
        join(discoveredWorkflow, 'index.ts'),
        `
import type { WorkflowPlugin } from '@emberai/agent-node';

const plugin: WorkflowPlugin = {
  id: 'runtime-discovered',
  name: 'Runtime Discovered Workflow',
  version: '1.0.0',
  setup: async (context) => {
    console.log('Runtime discovered workflow loaded');
  },
};

export default plugin;
`,
      );

      // When: runtime initializes
      // TODO: Initialize runtime with configDir
      // const runtime = await initializeRuntime({ configDir });

      // Then: discovered workflow should be loaded
      // expect(runtime.workflows).toContainEqual(
      //   expect.objectContaining({ id: 'runtime-discovered' }),
      // );
    });

    it.skip('should load workflows with entry points but no package.json', async () => {
      // Given: a simple workflow without package.json
      const simpleWorkflow = join(workflowsDir, 'simple-workflow');
      mkdirSync(simpleWorkflow);
      writeFileSync(
        join(simpleWorkflow, 'workflow.ts'),
        `
export default {
  id: 'simple-workflow',
  name: 'Simple Workflow',
  version: '1.0.0',
  setup: async () => {
    console.log('Simple workflow loaded');
  },
};
`,
      );

      // When: runtime initializes
      // TODO: Initialize runtime
      // const runtime = await initializeRuntime({ configDir });

      // Then: simple workflow should be loaded
      // expect(runtime.workflows).toContainEqual(
      //   expect.objectContaining({ id: 'simple-workflow' }),
      // );
    });

    it.skip('should respect registry precedence over discovered', async () => {
      // Given: both registry and discovered workflows with same ID
      const discoveredWorkflow = join(workflowsDir, 'conflicting-workflow');
      mkdirSync(discoveredWorkflow);
      writeFileSync(
        join(discoveredWorkflow, 'index.ts'),
        `
export default {
  id: 'conflicting-workflow',
  name: 'Discovered Version',
  version: '1.0.0',
};
`,
      );

      // Create registry with same workflow ID
      writeFileSync(
        join(configDir, 'workflow.json'),
        JSON.stringify({
          workflows: [
            {
              id: 'conflicting-workflow',
              from: './workflows/registry-version.ts',
              enabled: false,
            },
          ],
        }),
      );

      // When: runtime initializes
      // TODO: Initialize runtime
      // const runtime = await initializeRuntime({ configDir });

      // Then: registry version should be used
      // const workflow = runtime.workflows.find((w) => w.id === 'conflicting-workflow');
      // expect(workflow?.from).toBe('./workflows/registry-version.ts');
      // expect(workflow?.enabled).toBe(false);
    });
  });

  describe.skip('Hot Reload for Discovered Workflows', () => {
    it.skip('should detect newly added workflow directories', async () => {
      // Given: runtime initialized without workflows
      // TODO: Initialize runtime
      // const runtime = await initializeRuntime({ configDir });
      // expect(runtime.workflows.length).toBe(0);

      // When: new workflow directory is added
      const newWorkflow = join(workflowsDir, 'hot-added');
      mkdirSync(newWorkflow);
      writeFileSync(
        join(newWorkflow, 'index.ts'),
        `
export default {
  id: 'hot-added',
  name: 'Hot Added Workflow',
};
`,
      );

      // Trigger hot reload
      // await runtime.reload();

      // Then: new workflow should be detected
      // expect(runtime.workflows).toContainEqual(
      //   expect.objectContaining({ id: 'hot-added' }),
      // );
    });

    it.skip('should detect removed workflow directories', async () => {
      // Given: runtime with a discovered workflow
      const existingWorkflow = join(workflowsDir, 'to-be-removed');
      mkdirSync(existingWorkflow);
      writeFileSync(
        join(existingWorkflow, 'index.ts'),
        `
export default {
  id: 'to-be-removed',
  name: 'Will Be Removed',
};
`,
      );

      // TODO: Initialize runtime
      // const runtime = await initializeRuntime({ configDir });
      // expect(runtime.workflows).toContainEqual(
      //   expect.objectContaining({ id: 'to-be-removed' }),
      // );

      // When: workflow directory is removed
      rmSync(existingWorkflow, { recursive: true });

      // Trigger hot reload
      // await runtime.reload();

      // Then: workflow should be removed
      // expect(runtime.workflows).not.toContainEqual(
      //   expect.objectContaining({ id: 'to-be-removed' }),
      // );
    });

    it.skip('should reload when workflow module changes', async () => {
      // Given: runtime with a discovered workflow
      const reloadableWorkflow = join(workflowsDir, 'reloadable');
      mkdirSync(reloadableWorkflow);
      const workflowPath = join(reloadableWorkflow, 'index.ts');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'reloadable',
  name: 'Original Name',
  version: '1.0.0',
};
`,
      );

      // TODO: Initialize runtime
      // const runtime = await initializeRuntime({ configDir });
      // const originalWorkflow = runtime.workflows.find((w) => w.id === 'reloadable');
      // expect(originalWorkflow?.name).toBe('Original Name');

      // When: workflow module is modified
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'reloadable',
  name: 'Updated Name',
  version: '2.0.0',
};
`,
      );

      // Trigger hot reload
      // await runtime.reload();

      // Then: workflow should be reloaded with new content
      // const updatedWorkflow = runtime.workflows.find((w) => w.id === 'reloadable');
      // expect(updatedWorkflow?.name).toBe('Updated Name');
      // expect(updatedWorkflow?.version).toBe('2.0.0');
    });
  });

  describe.skip('Error Handling', () => {
    it.skip('should handle invalid workflow modules gracefully', async () => {
      // Given: a workflow with invalid syntax
      const invalidWorkflow = join(workflowsDir, 'invalid-syntax');
      mkdirSync(invalidWorkflow);
      writeFileSync(
        join(invalidWorkflow, 'index.ts'),
        `
// Invalid JavaScript syntax
export default {
  id: 'invalid',
  name: 'Invalid Workflow'
  // Missing comma
  version: '1.0.0'
};
`,
      );

      // When: runtime initializes
      // TODO: Initialize runtime - should not throw
      // const runtime = await initializeRuntime({ configDir });

      // Then: invalid workflow should be skipped
      // expect(runtime.workflows).not.toContainEqual(
      //   expect.objectContaining({ id: 'invalid' }),
      // );
      // expect(runtime.errors).toContain('Failed to load workflow: invalid-syntax');
    });

    it.skip('should handle workflows without default export', async () => {
      // Given: a workflow without default export
      const noExportWorkflow = join(workflowsDir, 'no-export');
      mkdirSync(noExportWorkflow);
      writeFileSync(
        join(noExportWorkflow, 'index.ts'),
        `
// No default export
export const namedExport = {
  id: 'no-export',
  name: 'No Default Export',
};
`,
      );

      // When: runtime initializes
      // TODO: Initialize runtime
      // const runtime = await initializeRuntime({ configDir });

      // Then: workflow should be skipped
      // expect(runtime.workflows).not.toContainEqual(
      //   expect.objectContaining({ id: 'no-export' }),
      // );
    });
  });

  /**
   * Implementation Notes:
   *
   * When implementing runtime discovery, the following changes are needed:
   *
   * 1. In runtime/init.ts:
   *    - Import discoverWorkflows from config/loaders/workflow-discovery.ts
   *    - After loading registry workflows, discover filesystem workflows
   *    - Merge discovered with registry using mergeWorkflows()
   *    - Pass merged workflows to WorkflowPluginLoader
   *
   * 2. In runtime/workflow-loader.ts:
   *    - Update to handle discovered workflow paths
   *    - Ensure jiti resolves from workflow directory
   *
   * 3. For hot reload support:
   *    - Watch the workflows directory for changes
   *    - Re-run discovery on filesystem changes
   *    - Clear require cache for changed modules
   *    - Reload affected workflows
   *
   * 4. Error handling:
   *    - Log but don't crash on invalid workflows
   *    - Provide clear error messages for debugging
   *    - Track which workflows failed to load
   */
});
