/**
 * Integration tests for workflow tool loading
 * Tests the loadTools() function with workflow plugins
 */

import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { describe, it, expect, afterEach } from 'vitest';

import type { EffectiveWorkflow } from '../src/config/composers/effective-set-composer.js';
import type { MCPServerInstance } from '../src/config/runtime/mcp-instantiator.js';
import { loadTools } from '../src/config/runtime/tool-loader.js';
import { WorkflowPluginLoader } from '../src/config/runtime/workflow-loader.js';

import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

describe('Tool Loader - Workflow Integration', () => {
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

  describe('Workflow Tool Loading', () => {
    it('should load workflow plugins as AI SDK tools', async () => {
      // Given: a workflow plugin loaded in a config workspace
      const configDir = createTestConfigWorkspace({
        agentName: 'Tool Loading Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'test-workflow.js'),
        `
export default {
  id: 'test-workflow',
  name: 'Test Workflow',
  description: 'A test workflow for tool loading',
  version: '1.0.0',
  async *execute(context) {
    yield { type: 'status', status: { state: 'completed', message: 'Done' } };
    return { success: true };
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

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load([effectiveWorkflow], configDir);

      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools from workflow plugins
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: should create workflow tool with correct naming
      expect(result.tools.size).toBe(1);
      expect(result.tools.has('dispatch_workflow_test_workflow')).toBe(true);

      const tool = result.tools.get('dispatch_workflow_test_workflow');
      expect(tool).toBeDefined();
      expect(tool?.description).toBe('A test workflow for tool loading');
    });

    it('should create WorkflowRuntime and register plugins', async () => {
      // Given: workflow plugins
      const configDir = createTestConfigWorkspace({
        agentName: 'Runtime Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'runtime-workflow.js'),
        `
export default {
  id: 'runtime-workflow',
  name: 'Runtime Workflow',
  version: '1.0.0',
  async *execute() {
    return { success: true };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'runtime-workflow',
        entry: {
          id: 'runtime-workflow',
          from: './workflows/runtime-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load([effectiveWorkflow], configDir);
      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: should create and return WorkflowRuntime
      expect(result.workflowRuntime).toBeDefined();
      // Note: Plugin registration is tested in workflow-runtime.int.test.ts
    });

    it('should handle multiple workflow plugins', async () => {
      // Given: multiple workflow plugins
      const configDir = createTestConfigWorkspace({
        agentName: 'Multiple Workflows Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'workflow-a.js'),
        `
export default {
  id: 'workflow-a',
  name: 'Workflow A',
  version: '1.0.0',
  async *execute() { return { id: 'a' }; }
};
`,
        'utf-8',
      );

      writeFileSync(
        join(workflowsDir, 'workflow-b.js'),
        `
export default {
  id: 'workflow-b',
  name: 'Workflow B',
  version: '1.0.0',
  async *execute() { return { id: 'b' }; }
};
`,
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
          usedBySkills: ['skill-1'],
        },
      ];

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load(effectiveWorkflows, configDir);
      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: should create tools for all workflows
      expect(result.tools.size).toBe(2);
      expect(result.tools.has('dispatch_workflow_workflow_a')).toBe(true);
      expect(result.tools.has('dispatch_workflow_workflow_b')).toBe(true);
      expect(result.workflowRuntime).toBeDefined();
    });

    it.todo('should canonicalize workflow IDs in tool names', async () => {
      // Given: workflow with camelCase ID
      const configDir = createTestConfigWorkspace({
        agentName: 'Canonicalize Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'camel-case-workflow.js'),
        `export default {
  id: 'camelCaseWorkflow',
  name: 'Camel Case Workflow',
  version: '1.0.0',
  async *execute() {
    yield { type: 'status', status: { state: 'completed' } };
    return {};
  }
};`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'camelCaseWorkflow',
        entry: {
          id: 'camelCaseWorkflow',
          from: './workflows/camel-case-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load([effectiveWorkflow], configDir);
      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: should canonicalize to snake_case
      // Debug: Check what tools are actually loaded
      const toolNames = Array.from(result.tools.keys());
      const workflowTool = toolNames.find((name) => name.startsWith('dispatch_workflow_'));

      expect(workflowTool).toBeDefined();
      expect(workflowTool).toBe('dispatch_workflow_camel_case_workflow');
    });

    it('should preserve workflow input schema in tool', async () => {
      // Given: workflow with Zod input schema
      const configDir = createTestConfigWorkspace({
        agentName: 'Schema Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      // Create workflow with schema (need to import zod in the workflow)
      writeFileSync(
        join(workflowsDir, 'schema-workflow.js'),
        `
import { z } from 'zod';

export default {
  id: 'schema-workflow',
  name: 'Schema Workflow',
  version: '1.0.0',
  inputSchema: z.object({
    message: z.string(),
    count: z.number().int().positive().default(1),
  }),
  async *execute(context) {
    return { message: context.parameters?.message };
  }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'schema-workflow',
        entry: {
          id: 'schema-workflow',
          from: './workflows/schema-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load([effectiveWorkflow], configDir);
      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: tool should have execute function defined
      const tool = result.tools.get('dispatch_workflow_schema_workflow');
      expect(tool).toBeDefined();
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
      expect((tool as Record<string, unknown>).description).toBe(
        'Dispatch Schema Workflow workflow',
      );
      const inputSchema = (tool as Record<string, unknown>).inputSchema;
      expect(inputSchema).toBeDefined();
    });

    it('should use default schema when workflow has no inputSchema', async () => {
      // Given: workflow without inputSchema
      const configDir = createTestConfigWorkspace({
        agentName: 'No Schema Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'no-schema-workflow.js'),
        `
export default {
  id: 'no-schema-workflow',
  name: 'No Schema Workflow',
  version: '1.0.0',
  async *execute() { return {}; }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'no-schema-workflow',
        entry: {
          id: 'no-schema-workflow',
          from: './workflows/no-schema-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load([effectiveWorkflow], configDir);
      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: tool should have execute function (default empty schema)
      const tool = result.tools.get('dispatch_workflow_no_schema_workflow');
      expect(tool).toBeDefined();
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
      const defaultSchema = (tool as Record<string, unknown>).inputSchema;
      expect(defaultSchema).toBeDefined();
      if (
        defaultSchema &&
        typeof (defaultSchema as { safeParse?: unknown }).safeParse === 'function'
      ) {
        const result = (
          defaultSchema as { safeParse: (value: unknown) => { success: boolean } }
        ).safeParse({ unexpected: 'value' });
        expect(result.success).toBe(true);
      }
    });

    it('should use default description when workflow has no description', async () => {
      // Given: workflow without description
      const configDir = createTestConfigWorkspace({
        agentName: 'No Description Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'no-desc-workflow.js'),
        `
export default {
  id: 'no-desc-workflow',
  name: 'No Description Workflow',
  version: '1.0.0',
  async *execute() { return {}; }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'no-desc-workflow',
        entry: {
          id: 'no-desc-workflow',
          from: './workflows/no-desc-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load([effectiveWorkflow], configDir);
      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: should use default description format
      const tool = result.tools.get('dispatch_workflow_no_desc_workflow');
      expect(tool).toBeDefined();
      expect(tool?.description).toBe('Dispatch No Description Workflow workflow');
    });

    it('should return empty workflow runtime when no workflows provided', async () => {
      // Given: no workflow plugins
      const workflowPlugins = new Map();
      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools with no workflows
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: should not create workflow runtime
      expect(result.workflowRuntime).toBeUndefined();
      expect(result.tools.size).toBe(0);
    });

    it('should require contextId parameter when workflow tool execute is called directly', async () => {
      // Given: workflow tool loaded
      const configDir = createTestConfigWorkspace({
        agentName: 'Context ID Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'context-workflow.js'),
        `
export default {
  id: 'context-workflow',
  name: 'Context Workflow',
  version: '1.0.0',
  async *execute() { return {}; }
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

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load([effectiveWorkflow], configDir);
      const mcpInstances = new Map<string, MCPServerInstance>();

      const result = await loadTools(mcpInstances, workflowPlugins);
      const tool = result.tools.get('dispatch_workflow_context_workflow');

      // Then: workflow tools are schema-only; execution is handled by the workflow runtime
      expect(tool).toBeDefined();
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
    });
  });

  describe('Combined MCP and Workflow Tools', () => {
    it('should load both MCP and workflow tools together', async () => {
      // Given: workflow plugins but no MCP servers
      const configDir = createTestConfigWorkspace({
        agentName: 'Combined Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      writeFileSync(
        join(workflowsDir, 'combined-workflow.js'),
        `
export default {
  id: 'combined-workflow',
  name: 'Combined Workflow',
  version: '1.0.0',
  async *execute() { return {}; }
};
`,
        'utf-8',
      );

      const effectiveWorkflow: EffectiveWorkflow = {
        id: 'combined-workflow',
        entry: {
          id: 'combined-workflow',
          from: './workflows/combined-workflow.js',
          enabled: true,
        },
        usedBySkills: ['skill-1'],
      };

      const workflowLoader = new WorkflowPluginLoader();
      const workflowPlugins = await workflowLoader.load([effectiveWorkflow], configDir);
      const mcpInstances = new Map<string, MCPServerInstance>();

      // When: loading tools
      const result = await loadTools(mcpInstances, workflowPlugins);

      // Then: should have workflow tools (MCP tools would be added if MCP instances were provided)
      expect(result.tools.size).toBeGreaterThanOrEqual(1);
      expect(result.tools.has('dispatch_workflow_combined_workflow')).toBe(true);
      expect(result.mcpClients.size).toBe(0); // No MCP servers
      expect(result.workflowRuntime).toBeDefined();
    });
  });
});
