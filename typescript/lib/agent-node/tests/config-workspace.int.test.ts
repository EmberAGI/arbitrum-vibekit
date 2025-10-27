/**
 * Integration tests for config workspace pipeline
 * Tests full load → compose → validate flow with multi-skill composition
 */

import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

import { describe, it, expect, afterEach } from 'vitest';

import { loadAgentConfig } from '../src/config/orchestrator.js';

import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

describe('Config Workspace Pipeline Integration Tests', () => {
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

  describe('Multi-Skill Composition', () => {
    it('should compose prompt from agent base + multiple skills in manifest order', async () => {
      // Given: a config workspace with agent base and 3 skills
      const configDir = createTestConfigWorkspace({
        agentName: 'Multi-Skill Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill One' },
          { id: 'skill-2', name: 'Skill Two' },
          { id: 'skill-3', name: 'Skill Three' },
        ],
      });
      tempDirs.push(configDir);

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: prompt should contain base + all skills in order
      expect(config.prompt.content).toContain('You are a test agent');
      expect(config.prompt.content).toContain('Test skill content for Skill One');
      expect(config.prompt.content).toContain('Test skill content for Skill Two');
      expect(config.prompt.content).toContain('Test skill content for Skill Three');

      // Verify order by checking positions
      const basePos = config.prompt.content.indexOf('You are a test agent');
      const skill1Pos = config.prompt.content.indexOf('Test skill content for Skill One');
      const skill2Pos = config.prompt.content.indexOf('Test skill content for Skill Two');
      const skill3Pos = config.prompt.content.indexOf('Test skill content for Skill Three');

      expect(basePos).toBeLessThan(skill1Pos);
      expect(skill1Pos).toBeLessThan(skill2Pos);
      expect(skill2Pos).toBeLessThan(skill3Pos);
    });

    it('should include all skills in agent card', async () => {
      // Given: a config workspace with multiple skills
      const configDir = createTestConfigWorkspace({
        agentName: 'Multi-Skill Test Agent',
        skills: [
          { id: 'skill-alpha', name: 'Skill Alpha' },
          { id: 'skill-beta', name: 'Skill Beta' },
        ],
      });
      tempDirs.push(configDir);

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: agent card should include all skills
      expect(config.card.skills).toBeDefined();
      expect(config.card.skills?.length).toBe(2);

      const skillIds = config.card.skills?.map((s) => s.id) ?? [];
      expect(skillIds).toContain('skill-alpha');
      expect(skillIds).toContain('skill-beta');
    });
  });

  describe('MCP Server Selection and Scoping', () => {
    it('should include only MCP servers selected by skills', async () => {
      // Given: a config workspace with 3 MCP servers but only 2 selected by skills
      const configDir = createTestConfigWorkspace({
        agentName: 'MCP Selection Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill 1', mcpServers: ['server-a', 'server-b'] },
          { id: 'skill-2', name: 'Skill 2', mcpServers: ['server-b'] },
        ],
        mcpServers: {
          'server-a': { command: 'node', args: ['./a.js'] },
          'server-b': { command: 'node', args: ['./b.js'] },
          'server-c': { command: 'node', args: ['./c.js'] },
        },
      });
      tempDirs.push(configDir);

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: only selected servers should be in effective set
      expect(config.mcpServers.length).toBe(2);
      const serverIds = config.mcpServers.map((s) => s.id);
      expect(serverIds).toContain('server-a');
      expect(serverIds).toContain('server-b');
      expect(serverIds).not.toContain('server-c');
    });

    it('should deduplicate MCP servers selected by multiple skills', async () => {
      // Given: a config workspace where multiple skills select the same MCP server
      const configDir = createTestConfigWorkspace({
        agentName: 'MCP Dedup Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill 1', mcpServers: ['shared-server'] },
          { id: 'skill-2', name: 'Skill 2', mcpServers: ['shared-server'] },
          { id: 'skill-3', name: 'Skill 3', mcpServers: ['shared-server'] },
        ],
        mcpServers: {
          'shared-server': { command: 'node', args: ['./shared.js'] },
        },
      });
      tempDirs.push(configDir);

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: should have only one instance of the server
      expect(config.mcpServers.length).toBe(1);
      expect(config.mcpServers[0].id).toBe('shared-server');

      // But should track all skills that use it
      expect(config.mcpServers[0].usedBySkills).toEqual(['skill-1', 'skill-2', 'skill-3']);
    });

    it('should assign namespace to each MCP server', async () => {
      // Given: a config workspace with MCP servers
      const configDir = createTestConfigWorkspace({
        agentName: 'MCP Namespace Test Agent',
        skills: [
          {
            id: 'skill-1',
            name: 'Skill 1',
            mcpServers: ['files-server', 'search-server'],
          },
        ],
        mcpServers: {
          'files-server': { command: 'node', args: ['./files.js'] },
          'search-server': { command: 'node', args: ['./search.js'] },
        },
      });
      tempDirs.push(configDir);

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: each server should have a namespace
      expect(config.mcpServers.length).toBe(2);
      for (const server of config.mcpServers) {
        expect(server.namespace).toBeDefined();
        expect(typeof server.namespace).toBe('string');
        expect(server.namespace.length).toBeGreaterThan(0);
        // Namespace should follow naming convention (lowercase, underscores)
        expect(server.namespace).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });

    it('should handle HTTP MCP transport configuration', async () => {
      // Given: a config workspace with HTTP MCP server
      const configDir = createTestConfigWorkspace({
        agentName: 'HTTP MCP Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1', mcpServers: ['http-server'] }],
        mcpServers: {
          'http-server': {
            type: 'http',
            url: 'https://api.example.com/mcp',
            headers: {
              Authorization: 'Bearer test-token',
            },
          },
        },
      });
      tempDirs.push(configDir);

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: should preserve HTTP transport config
      expect(config.mcpServers.length).toBe(1);
      const server = config.mcpServers[0];
      expect(server.id).toBe('http-server');
      expect(server.config).toBeDefined();

      // Check flat transport structure (per mcp.schema.ts lines 21-25)
      const configData = server.config as {
        type?: string;
        url?: string;
        headers?: Record<string, string>;
      };
      expect(configData.type).toBe('http');
      expect(configData.url).toBe('https://api.example.com/mcp');
      expect(configData.headers).toBeDefined();
      expect(configData.headers?.Authorization).toBe('Bearer test-token');
    });

    it('should scope tools per skill when allowedTools is specified', async () => {
      // Given: a config workspace with skill-specific tool scoping
      const configDir = createTestConfigWorkspace({
        agentName: 'Tool Scoping Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill 1', mcpServers: ['files'] },
          { id: 'skill-2', name: 'Skill 2', mcpServers: ['files'] },
        ],
      });
      tempDirs.push(configDir);

      // Manually add allowedTools to skill frontmatter
      const skill1Path = join(configDir, 'skills', 'skill-1.md');
      writeFileSync(
        skill1Path,
        `---
skill:
  id: skill-1
  name: Skill 1
  description: 'Test skill'
  tags: [test]

mcp:
  servers:
    - name: files
      allowedTools: [read_file, list_directory]
---

Skill 1 content.
`,
        'utf-8',
      );

      const skill2Path = join(configDir, 'skills', 'skill-2.md');
      writeFileSync(
        skill2Path,
        `---
skill:
  id: skill-2
  name: Skill 2
  description: 'Test skill'
  tags: [test]

mcp:
  servers:
    - name: files
      allowedTools: [write_file]
---

Skill 2 content.
`,
        'utf-8',
      );

      // Add files server to MCP registry
      const mcpPath = join(configDir, 'mcp.json');
      writeFileSync(
        mcpPath,
        JSON.stringify({
          mcpServers: {
            files: {
              command: 'node',
              args: ['./files.js'],
            },
          },
        }),
        'utf-8',
      );

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: MCP server should track allowed tools
      expect(config.mcpServers.length).toBe(1);
      const filesServer = config.mcpServers[0];
      expect(filesServer.id).toBe('files');

      // The effective set composer unions the allowed tools from both skills
      expect(filesServer.allowedTools).toBeDefined();
      expect(filesServer.allowedTools?.length).toBeGreaterThan(0);
    });
  });

  describe('Conflict Detection', () => {
    it.skip('should detect duplicate MCP server IDs with different configurations', async () => {
      // TODO: Per-skill MCP config overrides not implemented yet (PRD line 66)
      // Schema doesn't support 'config' field in SkillMCPServerSelectionSchema
      // This test documents the future requirement for conflict detection
      // Given: a config workspace where two skills reference the same MCP server ID but with different URLs
      const configDir = createTestConfigWorkspace({
        agentName: 'Conflict Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill 1', mcpServers: ['shared-api'] },
          { id: 'skill-2', name: 'Skill 2', mcpServers: ['shared-api'] },
        ],
      });
      tempDirs.push(configDir);

      // Create skill-1 with one MCP server config
      const skill1Path = join(configDir, 'skills', 'skill-1.md');
      writeFileSync(
        skill1Path,
        `---
skill:
  id: skill-1
  name: Skill 1
  description: 'Test skill'
  tags: [test]

mcp:
  servers:
    - name: shared-api
      config:
        url: https://api-v1.example.com
---

Skill 1 content.
`,
        'utf-8',
      );

      // Create skill-2 with different config for same server
      const skill2Path = join(configDir, 'skills', 'skill-2.md');
      writeFileSync(
        skill2Path,
        `---
skill:
  id: skill-2
  name: Skill 2
  description: 'Test skill'
  tags: [test]

mcp:
  servers:
    - name: shared-api
      config:
        url: https://api-v2.example.com
---

Skill 2 content.
`,
        'utf-8',
      );

      // Add base server definition to registry
      const mcpPath = join(configDir, 'mcp.json');
      writeFileSync(
        mcpPath,
        JSON.stringify({
          mcpServers: {
            'shared-api': {
              command: 'node',
              args: ['./api.js'],
            },
          },
        }),
        'utf-8',
      );

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config with conflicting server configs
      // Then: should throw error about conflicting configurations
      await expect(loadAgentConfig(manifestPath)).rejects.toThrow(/conflict/i);
    });

    it.skip('should detect conflicting runtime args for same MCP server', async () => {
      // TODO: Per-skill MCP config overrides not implemented yet (PRD line 66)
      // Schema doesn't support 'config' field in SkillMCPServerSelectionSchema
      // This test documents the future requirement for conflict detection
      // Given: a config workspace where skills have conflicting MCP server configs
      const configDir = createTestConfigWorkspace({
        agentName: 'Runtime Conflict Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill 1', mcpServers: ['configurable'] },
          { id: 'skill-2', name: 'Skill 2', mcpServers: ['configurable'] },
        ],
      });
      tempDirs.push(configDir);

      // Add conflicting overrides to skills
      const skill1Path = join(configDir, 'skills', 'skill-1.md');
      writeFileSync(
        skill1Path,
        `---
skill:
  id: skill-1
  name: Skill 1
  description: 'Test skill'
  tags: [test]

mcp:
  servers:
    - name: configurable
      config:
        mode: fast
---

Skill 1 content.
`,
        'utf-8',
      );

      const skill2Path = join(configDir, 'skills', 'skill-2.md');
      writeFileSync(
        skill2Path,
        `---
skill:
  id: skill-2
  name: Skill 2
  description: 'Test skill'
  tags: [test]

mcp:
  servers:
    - name: configurable
      config:
        mode: slow
---

Skill 2 content.
`,
        'utf-8',
      );

      // Add server to MCP registry
      const mcpPath = join(configDir, 'mcp.json');
      writeFileSync(
        mcpPath,
        JSON.stringify({
          mcpServers: {
            configurable: {
              command: 'node',
              args: ['./server.js'],
            },
          },
        }),
        'utf-8',
      );

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      // Then: should throw error for conflicting configs
      await expect(loadAgentConfig(manifestPath)).rejects.toThrow(/conflict/i);
    });
  });

  describe('Environment Variable Resolution', () => {
    it('should resolve $env: references in MCP server config', async () => {
      // Given: a config workspace with env var references
      const configDir = createTestConfigWorkspace({
        agentName: 'Env Resolution Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1', mcpServers: ['env-server'] }],
        mcpServers: {
          'env-server': {
            type: 'http',
            url: 'https://api.example.com/mcp',
            headers: {
              Authorization: '$env:TEST_API_TOKEN',
            },
          },
        },
      });
      tempDirs.push(configDir);

      // Set environment variable
      process.env.TEST_API_TOKEN = 'test-token-12345';

      const manifestPath = join(configDir, 'agent.manifest.json');

      try {
        // When: loading agent config
        const config = await loadAgentConfig(manifestPath);

        // Then: should resolve env var
        expect(config.mcpServers.length).toBe(1);
        const server = config.mcpServers[0];

        // The env var should be resolved in the config
        const configData = server.config as {
          type: 'http';
          url: string;
          headers?: { Authorization?: string };
        };
        expect(configData.headers?.Authorization).toBe('test-token-12345');
      } finally {
        delete process.env.TEST_API_TOKEN;
      }
    });

    it('should throw error for missing required environment variables', async () => {
      // Given: a config workspace with unset env var reference
      const configDir = createTestConfigWorkspace({
        agentName: 'Missing Env Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1', mcpServers: ['env-server'] }],
        mcpServers: {
          'env-server': {
            type: 'http',
            url: 'https://api.example.com/mcp',
            headers: {
              Authorization: '$env:MISSING_VAR',
            },
          },
        },
      });
      tempDirs.push(configDir);

      // Ensure variable is not set
      delete process.env.MISSING_VAR;

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      // Then: should throw error for missing variable (expect either variable name or env reference pattern)
      await expect(loadAgentConfig(manifestPath)).rejects.toThrow(/MISSING_VAR|\$env:/);
    });
  });

  describe('Workflow Composition', () => {
    it('should include workflows selected by skills', async () => {
      // Given: a config workspace with workflow registry
      const configDir = createTestConfigWorkspace({
        agentName: 'Workflow Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1' }],
      });
      tempDirs.push(configDir);

      // Add workflow to registry
      const workflowPath = join(configDir, 'workflow.json');
      writeFileSync(
        workflowPath,
        JSON.stringify({
          workflows: [
            {
              id: 'test-workflow',
              from: './workflows/test.ts',
              enabled: true,
            },
          ],
        }),
        'utf-8',
      );

      // Update skill to include workflow
      const skill1Path = join(configDir, 'skills', 'skill-1.md');
      writeFileSync(
        skill1Path,
        `---
skill:
  id: skill-1
  name: Skill 1
  description: 'Test skill'
  tags: [test]

workflows:
  include: ['test-workflow']
---

Skill 1 content.
`,
        'utf-8',
      );

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: should include selected workflow
      expect(config.workflows.length).toBe(1);
      expect(config.workflows[0].id).toBe('test-workflow');
      expect(config.workflows[0].usedBySkills).toContain('skill-1');
    });

    it('should deduplicate workflows selected by multiple skills', async () => {
      // Given: a config workspace where multiple skills select the same workflow
      const configDir = createTestConfigWorkspace({
        agentName: 'Workflow Dedup Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill 1' },
          { id: 'skill-2', name: 'Skill 2' },
        ],
      });
      tempDirs.push(configDir);

      // Add workflow to registry
      const workflowPath = join(configDir, 'workflow.json');
      writeFileSync(
        workflowPath,
        JSON.stringify({
          workflows: [
            {
              id: 'shared-workflow',
              from: './workflows/shared.ts',
              enabled: true,
            },
          ],
        }),
        'utf-8',
      );

      // Update both skills to include workflow
      const skill1Path = join(configDir, 'skills', 'skill-1.md');
      writeFileSync(
        skill1Path,
        `---
skill:
  id: skill-1
  name: Skill 1
  description: 'Test skill'
  tags: [test]

workflows:
  include: ['shared-workflow']
---

Skill 1 content.
`,
        'utf-8',
      );

      const skill2Path = join(configDir, 'skills', 'skill-2.md');
      writeFileSync(
        skill2Path,
        `---
skill:
  id: skill-2
  name: Skill 2
  description: 'Test skill'
  tags: [test]

workflows:
  include: ['shared-workflow']
---

Skill 2 content.
`,
        'utf-8',
      );

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: should have only one instance of the workflow
      expect(config.workflows.length).toBe(1);
      expect(config.workflows[0].id).toBe('shared-workflow');

      // But should track all skills that use it
      expect(config.workflows[0].usedBySkills).toEqual(['skill-1', 'skill-2']);
    });
  });

  describe('Card Merge Policies', () => {
    it('should apply union merge for capabilities', async () => {
      // Given: a config workspace with agent and skill capabilities
      const configDir = createTestConfigWorkspace({
        agentName: 'Union Merge Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1' }],
      });
      tempDirs.push(configDir);

      // Update agent.md to add custom capabilities
      const agentMdPath = join(configDir, 'agent.md');
      const agentMd = `---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Union Merge Test Agent'
  description: 'Test agent'
  url: 'http://localhost:3000/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Test Provider'
    url: 'https://example.com'
  defaultInputModes: ['text/plain']
  defaultOutputModes: ['application/json']

model:
  provider: openrouter
  name: anthropic/claude-sonnet-4.5
---

Base agent prompt.
`;
      writeFileSync(agentMdPath, agentMd, 'utf-8');

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config with union merge policy
      const config = await loadAgentConfig(manifestPath);

      // Then: capabilities should be preserved
      expect(config.card.capabilities).toBeDefined();
      expect(config.card.capabilities.streaming).toBe(true);
      expect(config.card.capabilities.pushNotifications).toBe(false);
    });
  });

  describe('Full Pipeline Validation', () => {
    it('should successfully load, compose, and validate a complete workspace', async () => {
      // Given: a complete config workspace with all features
      const configDir = createTestConfigWorkspace({
        agentName: 'Complete Test Agent',
        agentUrl: 'http://localhost:3000/a2a',
        skills: [
          { id: 'skill-alpha', name: 'Skill Alpha', mcpServers: ['server-1'] },
          { id: 'skill-beta', name: 'Skill Beta', mcpServers: ['server-2'] },
        ],
        mcpServers: {
          'server-1': { command: 'node', args: ['./s1.js'] },
          'server-2': { command: 'node', args: ['./s2.js'] },
        },
      });
      tempDirs.push(configDir);

      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: all components should be properly composed
      expect(config.prompt).toBeDefined();
      expect(config.prompt.content.length).toBeGreaterThan(0);
      expect(config.card).toBeDefined();
      expect(config.card.name).toBe('Complete Test Agent');
      expect(config.card.protocolVersion).toBe('0.3.0');
      expect(config.mcpServers.length).toBe(2);
      expect(config.workflows).toBeDefined();
    });
  });
});
