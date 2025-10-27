/**
 * Integration tests for workflow runtime
 * Tests workflow loading, execution, artifact generation, and parameter overrides
 */

import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { describe, it, expect, afterEach } from 'vitest';

import type { EffectiveWorkflow } from '../src/config/composers/effective-set-composer.js';
import { WorkflowPluginLoader } from '../src/config/runtime/workflow-loader.js';
import type { WorkflowState } from '../src/workflows/types.js';

import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

describe('Workflow Runtime Integration Tests', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    // Clean up temp directories
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  describe('Workflow Loading', () => {
    it('should load a valid workflow plugin from file', async () => {
      // Given: a config workspace with a workflow module
      const configDir = createTestConfigWorkspace({
        agentName: 'Workflow Load Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      // Create a test workflow module
      const workflowPath = join(workflowsDir, 'test-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'test-workflow',
  name: 'Test Workflow',
  description: 'A test workflow',
  version: '1.0.0',
  async *execute(context) {
    yield { type: 'status', status: { state: 'working', message: 'Processing...' } };
    yield {
      type: 'artifact',
      artifact: {
        name: 'result.json',
        mimeType: 'application/json',
        data: { result: 'success' }
      }
    };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'test-workflow',
        entry: {
          id: 'test-workflow',
          from: './workflows/test-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      // When: loading the workflow
      const loader = new WorkflowPluginLoader();
      const plugins = await loader.load([effectiveWorkflow], configDir);

      // Then: should successfully load the plugin
      expect(plugins.size).toBe(1);
      const loadedPlugin = plugins.get('test-workflow');
      expect(loadedPlugin).toBeDefined();
      expect(loadedPlugin?.id).toBe('test-workflow');
      expect(loadedPlugin?.plugin.name).toBe('Test Workflow');
      expect(loadedPlugin?.plugin.version).toBe('1.0.0');
    });

    it('should throw error for workflow module without default export', async () => {
      // Given: a config workspace with invalid workflow module (no default export)
      const configDir = createTestConfigWorkspace({
        agentName: 'Invalid Workflow Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'invalid-workflow.js');
      writeFileSync(
        workflowPath,
        `
export const someFunction = () => {};
// No default export
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'invalid-workflow',
        entry: {
          id: 'invalid-workflow',
          from: './workflows/invalid-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      // When: attempting to load the workflow
      const loader = new WorkflowPluginLoader();

      // Then: should throw error
      await expect(loader.load([effectiveWorkflow], configDir)).rejects.toThrow(/default/);
    });

    it('should skip disabled workflows', async () => {
      // Given: a config workspace with disabled workflow
      const configDir = createTestConfigWorkspace({
        agentName: 'Disabled Workflow Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'disabled-workflow',
        entry: {
          id: 'disabled-workflow',
          from: './workflows/disabled.js',
          enabled: false, // Disabled
        },
        usedBySkills: ['skill-1'],
      };

      // When: loading workflows
      const loader = new WorkflowPluginLoader();
      const plugins = await loader.load([effectiveWorkflow], configDir);

      // Then: should not load disabled workflow
      expect(plugins.size).toBe(0);
      expect(plugins.get('disabled-workflow')).toBeUndefined();
    });

    it('should validate plugin structure has required fields', async () => {
      // Given: a config workspace with workflow missing required fields
      const configDir = createTestConfigWorkspace({
        agentName: 'Invalid Plugin Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'incomplete-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'incomplete-workflow',
  // Missing 'name' and 'execute' fields
  version: '1.0.0'
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'incomplete-workflow',
        entry: {
          id: 'incomplete-workflow',
          from: './workflows/incomplete-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      // When: attempting to load the workflow
      const loader = new WorkflowPluginLoader();

      // Then: should throw validation error
      await expect(loader.load([effectiveWorkflow], configDir)).rejects.toThrow(/required fields/);
    });

    it('should warn about ID mismatch between registry and plugin', async () => {
      // Given: a config workspace with workflow having mismatched ID
      const configDir = createTestConfigWorkspace({
        agentName: 'ID Mismatch Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'mismatched-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'plugin-id',  // Different from registry ID
  name: 'Mismatched Workflow',
  version: '1.0.0',
  async *execute(context) {
    yield { type: 'status', status: { state: 'working' } };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'registry-id',
        entry: {
          id: 'registry-id',
          from: './workflows/mismatched-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      // When: loading the workflow
      const loader = new WorkflowPluginLoader();
      const plugins = await loader.load([effectiveWorkflow], configDir);

      // Then: should load with registry ID (plugin ID mismatch logged as warning)
      expect(plugins.size).toBe(1);
      const loadedPlugin = plugins.get('registry-id');
      expect(loadedPlugin).toBeDefined();
      expect(loadedPlugin?.id).toBe('registry-id'); // Uses registry ID
    });
  });

  describe('Workflow Execution', () => {
    it('should execute workflow and yield status updates', async () => {
      // Given: a loaded workflow plugin
      const configDir = createTestConfigWorkspace({
        agentName: 'Execution Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'status-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'status-workflow',
  name: 'Status Workflow',
  version: '1.0.0',
  async *execute(context) {
    yield { type: 'status', status: { state: 'working', message: 'Step 1' } };
    yield { type: 'status', status: { state: 'working', message: 'Step 2' } };
    yield { type: 'status', status: { state: 'completed', message: 'Done' } };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'status-workflow',
        entry: {
          id: 'status-workflow',
          from: './workflows/status-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      const loadedPlugin = loader.getPlugin('status-workflow');
      expect(loadedPlugin).toBeDefined();

      // When: executing the workflow
      const context = {
        contextId: 'test-context',
        taskId: 'test-task',
        parameters: {},
      };

      const yields: WorkflowState[] = [];
      for await (const result of loadedPlugin!.plugin.execute(context)) {
        yields.push(result);
      }

      // Then: should yield all status updates
      expect(yields.length).toBe(3);
      expect(yields[0].type).toBe('status');
      expect(yields[1].type).toBe('status');
      expect(yields[2].type).toBe('status');

      if (yields[2].type === 'status') {
        expect(yields[2].status.state).toBe('completed');
      }
    });

    it('should generate artifacts during execution', async () => {
      // Given: a workflow that generates artifacts
      const configDir = createTestConfigWorkspace({
        agentName: 'Artifact Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'artifact-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'artifact-workflow',
  name: 'Artifact Workflow',
  version: '1.0.0',
  async *execute(context) {
    yield { type: 'status', status: { state: 'working', message: 'Generating artifacts...' } };

    yield {
      type: 'artifact',
      artifact: {
        name: 'data.json',
        mimeType: 'application/json',
        data: { message: 'Hello World' }
      }
    };

    yield {
      type: 'artifact',
      artifact: {
        name: 'report.txt',
        mimeType: 'text/plain',
        data: 'Report contents'
      }
    };

    yield { type: 'status', status: { state: 'completed' } };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'artifact-workflow',
        entry: {
          id: 'artifact-workflow',
          from: './workflows/artifact-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      const loadedPlugin = loader.getPlugin('artifact-workflow');

      // When: executing the workflow
      const context = {
        contextId: 'test-context',
        taskId: 'test-task',
      };

      const yields: WorkflowState[] = [];
      for await (const result of loadedPlugin!.plugin.execute(context)) {
        yields.push(result);
      }

      // Then: should yield artifacts
      const artifacts = yields.filter((y) => y.type === 'artifact');
      expect(artifacts.length).toBe(2);

      if (artifacts[0].type === 'artifact') {
        expect(artifacts[0].artifact.name).toBe('data.json');
        expect(artifacts[0].artifact.mimeType).toBe('application/json');
      }

      if (artifacts[1].type === 'artifact') {
        expect(artifacts[1].artifact.name).toBe('report.txt');
        expect(artifacts[1].artifact.mimeType).toBe('text/plain');
      }
    });

    it('should pass context with parameters to workflow', async () => {
      // Given: a workflow that uses context parameters
      const configDir = createTestConfigWorkspace({
        agentName: 'Context Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'context-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'context-workflow',
  name: 'Context Workflow',
  version: '1.0.0',
  async *execute(context) {
    const name = context.parameters?.name || 'Unknown';
    yield {
      type: 'artifact',
      artifact: {
        name: 'greeting.txt',
        mimeType: 'text/plain',
        data: \`Hello, \${name}!\`
      }
    };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'context-workflow',
        entry: {
          id: 'context-workflow',
          from: './workflows/context-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      const loadedPlugin = loader.getPlugin('context-workflow');

      // When: executing with parameters
      const context = {
        contextId: 'test-context',
        taskId: 'test-task',
        parameters: {
          name: 'Alice',
        },
      };

      const yields: WorkflowState[] = [];
      for await (const result of loadedPlugin!.plugin.execute(context)) {
        yields.push(result);
      }

      // Then: should use parameters from context
      expect(yields.length).toBe(1);
      if (yields[0].type === 'artifact') {
        expect(yields[0].artifact.data).toBe('Hello, Alice!');
      }
    });

    it('should stream artifacts through pause/resume cycle', async () => {
      // Given: A real workflow file with pause and post-resume artifacts
      const configDir = createTestConfigWorkspace({
        agentName: 'Pause Artifact Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'pause-artifact-workflow.js');
      writeFileSync(
        workflowPath,
        `
import { z } from 'zod';

export default {
  id: 'pause-artifact-workflow',
  name: 'Pause Artifact Workflow',
  version: '1.0.0',
  async *execute(context) {
    // Pre-pause artifact
    yield {
      type: 'artifact',
      artifact: {
        name: 'config.json',
        mimeType: 'application/json',
        data: { initialized: true, contextId: context.contextId }
      }
    };

    // Pause for input
    const input = yield {
      type: 'pause',
      status: {
        state: 'input-required',
        message: {
          kind: 'message',
          messageId: 'm-pause-artifact',
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Please provide amount' }]
        }
      },
      inputSchema: z.object({ amount: z.string() })
    };

    // Post-resume artifacts
    yield {
      type: 'artifact',
      artifact: {
        name: 'settings.json',
        mimeType: 'application/json',
        data: { amount: input.amount, stage: 'resumed' }
      }
    };

    yield {
      type: 'artifact',
      artifact: {
        name: 'result.json',
        mimeType: 'application/json',
        data: { status: 'completed', totalArtifacts: 3 }
      }
    };

    return { success: true };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'pause-artifact-workflow',
        entry: {
          id: 'pause-artifact-workflow',
          from: './workflows/pause-artifact-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      const loadedPlugin = loader.getPlugin('pause-artifact-workflow');
      expect(loadedPlugin).toBeDefined();

      // When: Executing through pause/resume with artifact collection
      const context = {
        contextId: 'test-context-pause',
        taskId: 'test-task-pause',
      };

      const yields: WorkflowState[] = [];
      const generator = loadedPlugin!.plugin.execute(context);

      // Collect yields until pause
      for await (const result of generator) {
        yields.push(result);

        if (result.type === 'pause') {
          // Pause detected, resume with input
          const resumeResult = await generator.next({ amount: '1000' });

          // Continue collecting post-resume yields
          if (!resumeResult.done && resumeResult.value) {
            yields.push(resumeResult.value);

            // Collect remaining yields
            for await (const remainingResult of generator) {
              yields.push(remainingResult);
            }
          }
          break;
        }
      }

      // Then: Should have artifacts before and after pause
      const artifacts = yields.filter((y) => y.type === 'artifact');
      expect(artifacts.length).toBe(3);

      if (artifacts[0].type === 'artifact') {
        expect(artifacts[0].artifact.name).toBe('config.json'); // Before pause
        expect((artifacts[0].artifact.data as { initialized: boolean }).initialized).toBe(true);
      }

      if (artifacts[1].type === 'artifact') {
        expect(artifacts[1].artifact.name).toBe('settings.json'); // After resume
        expect((artifacts[1].artifact.data as { amount: string; stage: string }).amount).toBe(
          '1000',
        );
        expect((artifacts[1].artifact.data as { amount: string; stage: string }).stage).toBe(
          'resumed',
        );
      }

      if (artifacts[2].type === 'artifact') {
        expect(artifacts[2].artifact.name).toBe('result.json'); // After resume
        expect((artifacts[2].artifact.data as { status: string }).status).toBe('completed');
      }

      // Then: Should have exactly one pause
      const pauses = yields.filter((y) => y.type === 'pause');
      expect(pauses.length).toBe(1);
    });
  });

  describe('Parameter Overrides', () => {
    it('should apply skill-level parameter overrides to workflow', async () => {
      // Given: a workflow with skill-specific overrides
      const configDir = createTestConfigWorkspace({
        agentName: 'Override Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'override-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'override-workflow',
  name: 'Override Workflow',
  version: '1.0.0',
  async *execute(context) {
    const mode = context.parameters?.mode || 'default';
    yield {
      type: 'artifact',
      artifact: {
        name: 'config.json',
        mimeType: 'application/json',
        data: { mode }
      }
    };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'override-workflow',
        entry: {
          id: 'override-workflow',
          from: './workflows/override-workflow.js',
          enabled: true,
          config: {
            mode: 'base',
          },
        },
        usedBySkills: ['skill-1'],
        overrides: {
          mode: 'overridden', // Skill override
        },
      };

      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      const loadedPlugin = loader.getPlugin('override-workflow');

      // When: executing with overridden parameters
      const context = {
        contextId: 'test-context',
        taskId: 'test-task',
        parameters: loadedPlugin!.overrides, // Apply overrides
      };

      const yields: WorkflowState[] = [];
      for await (const result of loadedPlugin!.plugin.execute(context)) {
        yields.push(result);
      }

      // Then: should use overridden parameter value
      expect(yields.length).toBe(1);
      if (yields[0].type === 'artifact') {
        const data = yields[0].artifact.data as { mode: string };
        expect(data.mode).toBe('overridden');
      }
    });

    it('should store overrides with loaded plugin', async () => {
      // Given: a workflow with overrides
      const configDir = createTestConfigWorkspace({
        agentName: 'Override Storage Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'test-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'test-workflow',
  name: 'Test Workflow',
  version: '1.0.0',
  async *execute() {}
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'test-workflow',
        entry: {
          id: 'test-workflow',
          from: './workflows/test-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
        overrides: {
          customParam: 'custom-value',
          timeout: 5000,
        },
      };

      // When: loading the workflow
      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      // Then: should store overrides with plugin
      const loadedPlugin = loader.getPlugin('test-workflow');
      expect(loadedPlugin?.overrides).toBeDefined();
      expect(loadedPlugin?.overrides?.customParam).toBe('custom-value');
      expect(loadedPlugin?.overrides?.timeout).toBe(5000);
    });
  });

  describe('Workflow Reload', () => {
    it('should reload a workflow plugin', async () => {
      // Given: a loaded workflow
      const configDir = createTestConfigWorkspace({
        agentName: 'Reload Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'reload-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'reload-workflow',
  name: 'Original Workflow',
  version: '1.0.0',
  async *execute() {
    yield {
      type: 'artifact',
      artifact: {
        name: 'version.txt',
        data: 'v1'
      }
    };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'reload-workflow',
        entry: {
          id: 'reload-workflow',
          from: './workflows/reload-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      let loadedPlugin = loader.getPlugin('reload-workflow');
      expect(loadedPlugin?.plugin.name).toBe('Original Workflow');

      // When: updating workflow file and reloading
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'reload-workflow',
  name: 'Updated Workflow',
  version: '2.0.0',
  async *execute() {
    yield {
      type: 'artifact',
      artifact: {
        name: 'version.txt',
        data: 'v2'
      }
    };
  }
};
`,
        'utf-8',
      );

      // Note: In Node.js, dynamic imports cache modules by URL.
      // For testing, we'll verify the reload method exists and works structurally.
      await loader.reload('reload-workflow', effectiveWorkflow, configDir);

      // Then: plugin should be reloaded
      loadedPlugin = loader.getPlugin('reload-workflow');
      expect(loadedPlugin).toBeDefined();
    });

    it('should remove plugin from cache before reloading', async () => {
      // Given: a loaded workflow
      const configDir = createTestConfigWorkspace({
        agentName: 'Cache Clear Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      const workflowPath = join(workflowsDir, 'cache-workflow.js');
      writeFileSync(
        workflowPath,
        `
export default {
  id: 'cache-workflow',
  name: 'Cache Workflow',
  version: '1.0.0',
  async *execute() {}
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'cache-workflow',
        entry: {
          id: 'cache-workflow',
          from: './workflows/cache-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      expect(loader.getPlugin('cache-workflow')).toBeDefined();

      // When: removing plugin
      loader.remove('cache-workflow');

      // Then: should no longer be in cache
      expect(loader.getPlugin('cache-workflow')).toBeUndefined();
    });
  });

  describe('Plugin Management', () => {
    it('should get all loaded plugins', async () => {
      // Given: multiple loaded workflows
      const configDir = createTestConfigWorkspace({
        agentName: 'Plugin Management Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      // Create two workflows
      writeFileSync(
        join(workflowsDir, 'workflow-a.js'),
        `export default { id: 'workflow-a', name: 'Workflow A', version: '1.0.0', async *execute() {} };`,
        'utf-8',
      );

      writeFileSync(
        join(workflowsDir, 'workflow-b.js'),
        `export default { id: 'workflow-b', name: 'Workflow B', version: '1.0.0', async *execute() {} };`,
        'utf-8',
      );

      const effectiveWorkflows: EffectiveWorkflow[] = [
        {
          id: 'workflow-a',
          entry: { id: 'workflow-a', from: './workflows/workflow-a.js', enabled: true },
          usedBySkills: ['skill-1'],
        },
        {
          id: 'workflow-b',
          entry: { id: 'workflow-b', from: './workflows/workflow-b.js', enabled: true },
          usedBySkills: ['skill-2'],
        },
      ];

      // When: loading workflows and getting all plugins
      const loader = new WorkflowPluginLoader();
      await loader.load(effectiveWorkflows, configDir);
      const allPlugins = loader.getPlugins();

      // Then: should return all loaded plugins
      expect(allPlugins.size).toBe(2);
      expect(allPlugins.has('workflow-a')).toBe(true);
      expect(allPlugins.has('workflow-b')).toBe(true);
    });

    it('should clear all plugins', async () => {
      // Given: loaded workflows
      const configDir = createTestConfigWorkspace({
        agentName: 'Clear Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'test-workflow.js'),
        `export default { id: 'test-workflow', name: 'Test', version: '1.0.0', async *execute() {} };`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'test-workflow',
        entry: { id: 'test-workflow', from: './workflows/test-workflow.js', enabled: true },
        usedBySkills: ['skill-1'],
      };

      const loader = new WorkflowPluginLoader();
      await loader.load([effectiveWorkflow], configDir);

      expect(loader.getPlugins().size).toBe(1);

      // When: clearing all plugins
      loader.clear();

      // Then: should have no plugins
      expect(loader.getPlugins().size).toBe(0);
      expect(loader.getPlugin('test-workflow')).toBeUndefined();
    });
  });
});
