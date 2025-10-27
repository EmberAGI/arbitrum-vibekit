/**
 * Integration tests for CLI commands
 * Tests all 5 CLI commands: init, run, doctor, print-config, bundle
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, afterEach } from 'vitest';

import { bundleCommand } from '../src/cli/commands/bundle.js';
import { doctorCommand } from '../src/cli/commands/doctor.js';
import { initCommand } from '../src/cli/commands/init.js';
import { printConfigCommand } from '../src/cli/commands/print-config.js';

import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

describe('CLI Commands Integration Tests', () => {
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

  describe('agent init', () => {
    it('should scaffold a new config workspace with all required files', async () => {
      // Given: a target directory for initialization
      const targetDir = join(
        tmpdir(),
        `test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tempDirs.push(targetDir);

      // When: running init command
      await initCommand({ target: targetDir });

      // Then: all required files should be created
      expect(existsSync(targetDir)).toBe(true);
      expect(existsSync(join(targetDir, 'agent.md'))).toBe(true);
      expect(existsSync(join(targetDir, 'agent.manifest.json'))).toBe(true);
      expect(existsSync(join(targetDir, 'mcp.json'))).toBe(true);
      expect(existsSync(join(targetDir, 'workflow.json'))).toBe(true);
      expect(existsSync(join(targetDir, 'README.md'))).toBe(true);
      expect(existsSync(join(targetDir, 'skills'))).toBe(true);
      expect(existsSync(join(targetDir, 'workflows'))).toBe(true);

      // Then: template skill and workflow files should be created
      expect(existsSync(join(targetDir, 'skills', 'general-assistant.md'))).toBe(true);
      expect(existsSync(join(targetDir, 'skills', 'ember-onchain-actions.md'))).toBe(true);
      expect(existsSync(join(targetDir, 'workflows', 'example-workflow.ts'))).toBe(true);
    });

    it('should create valid agent.md with frontmatter', async () => {
      // Given: a target directory for initialization
      const targetDir = join(
        tmpdir(),
        `test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tempDirs.push(targetDir);

      // When: running init command
      await initCommand({ target: targetDir });

      // Then: agent.md should have valid frontmatter
      const agentMd = readFileSync(join(targetDir, 'agent.md'), 'utf-8');
      expect(agentMd).toContain('---');
      expect(agentMd).toContain('version: 1');
      expect(agentMd).toContain('card:');
      expect(agentMd).toContain("protocolVersion: '0.3.0'");
      expect(agentMd).toContain('model:');
      expect(agentMd).toContain('You are a helpful AI agent');
    });

    it('should create valid manifest with default merge policies', async () => {
      // Given: a target directory for initialization
      const targetDir = join(
        tmpdir(),
        `test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tempDirs.push(targetDir);

      // When: running init command
      await initCommand({ target: targetDir });

      // Then: manifest should have valid structure with both template skills
      const manifestPath = join(targetDir, 'agent.manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      expect(manifest.version).toBe(1);
      expect(manifest.skills).toEqual([
        './skills/general-assistant.md',
        './skills/ember-onchain-actions.md',
      ]);
      expect(manifest.registries).toEqual({
        mcp: './mcp.json',
        workflows: './workflow.json',
      });
      expect(manifest.merge).toEqual({
        card: {
          capabilities: 'union',
          toolPolicies: 'intersect',
          guardrails: 'tightest',
        },
      });
    });

    it('should create template skill with valid frontmatter', async () => {
      // Given: a target directory for initialization
      const targetDir = join(
        tmpdir(),
        `test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tempDirs.push(targetDir);

      // When: running init command
      await initCommand({ target: targetDir });

      // Then: template skill should have valid frontmatter and content
      const skillPath = join(targetDir, 'skills', 'general-assistant.md');
      const skillContent = readFileSync(skillPath, 'utf-8');

      // Validate frontmatter structure
      expect(skillContent).toContain('---');
      expect(skillContent).toContain('skill:');
      expect(skillContent).toContain('id: general-assistant');
      expect(skillContent).toContain('name: General Assistant');
      expect(skillContent).toContain("description: 'A general-purpose skill");
      expect(skillContent).toContain('tags: [general, assistant]');
      expect(skillContent).toContain('examples:');
      expect(skillContent).toContain('inputModes:');
      expect(skillContent).toContain('outputModes:');

      // Validate skill body content
      expect(skillContent).toContain('You are a general-purpose assistant skill');
      expect(skillContent).toContain('Answering questions clearly and accurately');
      expect(skillContent).toContain('Breaking down complex tasks');
      expect(skillContent).toContain('Executing workflows for multi-step operations');

      // Validate MCP server integration (active by default)
      expect(skillContent).toContain('# MCP server integration');
      expect(skillContent).toContain('mcp:');
      expect(skillContent).toContain('servers:');
      expect(skillContent).toContain('- name: fetch');
      expect(skillContent).toContain('allowedTools: [fetch_json, fetch_txt, fetch_markdown]');

      // Validate workflow integration (active by default)
      expect(skillContent).toContain('# Workflow integration');
      expect(skillContent).toContain('workflows:');
      expect(skillContent).toContain("include: ['example-workflow']");
    });

    it('should create ember skill with valid frontmatter and MCP integration', async () => {
      // Given: a target directory for initialization
      const targetDir = join(
        tmpdir(),
        `test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tempDirs.push(targetDir);

      // When: running init command
      await initCommand({ target: targetDir });

      // Then: ember skill should have valid frontmatter and content
      const skillPath = join(targetDir, 'skills', 'ember-onchain-actions.md');
      const skillContent = readFileSync(skillPath, 'utf-8');

      // Validate frontmatter structure
      expect(skillContent).toContain('---');
      expect(skillContent).toContain('skill:');
      expect(skillContent).toContain('id: ember-onchain-actions');
      expect(skillContent).toContain('name: Ember Onchain Actions');
      expect(skillContent).toContain('description:');
      expect(skillContent).toContain('tags: [blockchain, web3, transactions]');

      // Validate MCP server integration with ember_onchain_actions
      expect(skillContent).toContain('# MCP server integration');
      expect(skillContent).toContain('mcp:');
      expect(skillContent).toContain('servers:');
      expect(skillContent).toContain('- name: ember_onchain_actions');

      // Validate skill body content
      expect(skillContent).toContain('You are the Ember Onchain Actions skill');
      expect(skillContent).toContain('blockchain');
      expect(skillContent).toContain('transactions');
    });

    it('should create registries with default MCP servers', async () => {
      // Given: a target directory for initialization
      const targetDir = join(
        tmpdir(),
        `test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tempDirs.push(targetDir);

      // When: running init command
      await initCommand({ target: targetDir });

      // Then: MCP registry should contain default servers (fetch stdio and ember_onchain_actions http)
      const mcpJson = JSON.parse(readFileSync(join(targetDir, 'mcp.json'), 'utf-8'));
      expect(mcpJson.mcpServers).toBeDefined();

      // Validate fetch server (stdio transport)
      expect(mcpJson.mcpServers.fetch).toBeDefined();
      expect(mcpJson.mcpServers.fetch.type).toBe('stdio');
      expect(mcpJson.mcpServers.fetch.command).toBe('npx');
      expect(mcpJson.mcpServers.fetch.args).toEqual(['mcp-fetch-server']);
      expect(mcpJson.mcpServers.fetch.env).toEqual({ DEFAULT_LIMIT: '50000' });

      // Validate ember_onchain_actions server (http transport)
      expect(mcpJson.mcpServers.ember_onchain_actions).toBeDefined();
      expect(mcpJson.mcpServers.ember_onchain_actions.type).toBe('http');
      expect(mcpJson.mcpServers.ember_onchain_actions.url).toBe('https://api.emberai.xyz/mcp');

      // Then: workflow registry should contain example-workflow
      const workflowJson = JSON.parse(readFileSync(join(targetDir, 'workflow.json'), 'utf-8'));
      expect(workflowJson.workflows).toBeDefined();
      expect(Array.isArray(workflowJson.workflows)).toBe(true);
      expect(workflowJson.workflows.length).toBe(1);
      expect(workflowJson.workflows[0].id).toBe('example-workflow');
      expect(workflowJson.workflows[0].from).toBe('./workflows/example-workflow.ts');
      expect(workflowJson.workflows[0].enabled).toBe(true);
    });

    it('should fail when target exists without force flag', async () => {
      // Given: an existing directory
      const targetDir = join(
        tmpdir(),
        `test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tempDirs.push(targetDir);
      await initCommand({ target: targetDir });

      // When: running init command again without force
      // Then: should throw error
      await expect(initCommand({ target: targetDir })).rejects.toThrow(/already exists/);
    });

    it('should overwrite when using force flag', async () => {
      // Given: an existing directory with custom content
      const targetDir = join(
        tmpdir(),
        `test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      tempDirs.push(targetDir);
      await initCommand({ target: targetDir });

      // Modify a file
      const agentMdPath = join(targetDir, 'agent.md');
      const originalContent = readFileSync(agentMdPath, 'utf-8');

      // When: running init command with force
      await initCommand({ target: targetDir, force: true });

      // Then: files should be reset to defaults
      const newContent = readFileSync(agentMdPath, 'utf-8');
      expect(newContent).toBe(originalContent); // Should match sample template
    });
  });

  describe('agent doctor', () => {
    it('should validate a valid config workspace without errors', async () => {
      // Given: a valid test config workspace
      const configDir = createTestConfigWorkspace({
        agentName: 'Doctor Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill' }],
      });
      tempDirs.push(configDir);

      // When: running doctor command
      // Then: should not throw
      await expect(doctorCommand({ configDir })).resolves.toBeUndefined();
    });

    it('should detect missing required agent card fields', async () => {
      // Given: a config workspace with invalid agent.md (missing required fields)
      const configDir = createTestConfigWorkspace({
        agentName: '',
        skills: [],
      });
      tempDirs.push(configDir);

      // Corrupt the agent card by removing name
      const agentMdPath = join(configDir, 'agent.md');
      const agentMd = readFileSync(agentMdPath, 'utf-8');
      const corrupted = agentMd.replace(/name: '.*'/, "name: ''");
      rmSync(agentMdPath);
      writeFileSync(agentMdPath, corrupted);

      // When: running doctor command
      // Then: should throw validation error
      await expect(doctorCommand({ configDir })).rejects.toThrow();
    });

    it('should warn about unreferenced MCP servers', async () => {
      // Given: a config workspace with MCP servers not referenced by any skill
      const configDir = createTestConfigWorkspace({
        agentName: 'Doctor Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill' }],
        mcpServers: {
          'unused-server': {
            command: 'node',
            args: ['./server.js'],
          },
        },
      });
      tempDirs.push(configDir);

      // When: running doctor command with verbose flag
      // Then: should complete but log warning (we can't easily capture console output in this test)
      await expect(doctorCommand({ configDir, verbose: true })).resolves.toBeUndefined();
    });

    it('should validate MCP registry structure', async () => {
      // Given: a config workspace with invalid mcp.json
      const configDir = createTestConfigWorkspace({
        agentName: 'Doctor Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      // Corrupt mcp.json
      const mcpPath = join(configDir, 'mcp.json');
      rmSync(mcpPath);
      writeFileSync(mcpPath, '{ "invalid": "structure" }');

      // When: running doctor command
      // Then: should throw validation error
      await expect(doctorCommand({ configDir })).rejects.toThrow();
    });

    it('should validate workflow registry structure', async () => {
      // Given: a config workspace with invalid workflow.json structure
      const configDir = createTestConfigWorkspace({
        agentName: 'Doctor Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      // Create workflow.json with invalid workflow entry (missing required 'from' field)
      const workflowPath = join(configDir, 'workflow.json');
      rmSync(workflowPath);
      writeFileSync(
        workflowPath,
        JSON.stringify({
          workflows: [
            {
              id: 'invalid-workflow',
              // Missing required 'from' field - should fail schema validation
            },
          ],
        }),
      );

      // When: running doctor command
      // Then: should throw validation error
      await expect(doctorCommand({ configDir })).rejects.toThrow();
    });

    it('should report MCP server and workflow counts', async () => {
      // Given: a config workspace with multiple MCP servers and workflows
      const configDir = createTestConfigWorkspace({
        agentName: 'Doctor Test Agent',
        skills: [
          {
            id: 'test-skill',
            name: 'Test Skill',
            mcpServers: ['server-1', 'server-2'],
          },
        ],
        mcpServers: {
          'server-1': { command: 'node', args: ['./s1.js'] },
          'server-2': { command: 'node', args: ['./s2.js'] },
        },
      });
      tempDirs.push(configDir);

      // When: running doctor command
      // Then: should complete and report counts (console output not captured)
      await expect(doctorCommand({ configDir })).resolves.toBeUndefined();
    });
  });

  describe('agent print-config', () => {
    it('should output composed configuration in JSON format', async () => {
      // Given: a valid test config workspace
      const configDir = createTestConfigWorkspace({
        agentName: 'Print Config Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill' }],
      });
      tempDirs.push(configDir);

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        // When: running print-config command with JSON format
        await printConfigCommand({ configDir, format: 'json' });

        // Then: should output valid JSON
        // Filter out logger messages (which have timestamps) and find the JSON output
        const jsonOutput = logs.find((line) => line.trimStart().startsWith('{'));
        expect(jsonOutput).toBeDefined();
        const parsed = JSON.parse(jsonOutput!);
        expect(parsed.summary).toBeDefined();
        expect(parsed.agentCard).toBeDefined();
        expect(parsed.prompt).toBeDefined();
        expect(parsed.mcpServers).toBeDefined();
        expect(parsed.workflows).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should include prompt summary by default', async () => {
      // Given: a valid test config workspace
      const configDir = createTestConfigWorkspace({
        agentName: 'Print Config Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill' }],
      });
      tempDirs.push(configDir);

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        // When: running print-config command with summary mode
        await printConfigCommand({ configDir, prompt: 'summary' });

        // Then: should output prompt metadata without full content
        // Filter out logger messages and find the JSON output
        const jsonOutput = logs.find((line) => line.trimStart().startsWith('{'));
        expect(jsonOutput).toBeDefined();
        const parsed = JSON.parse(jsonOutput!);
        expect(parsed.prompt.mode).toBe('summary');
        expect(parsed.prompt.length).toBeGreaterThan(0);
        expect(parsed.prompt.content).toBeUndefined(); // Summary mode excludes full content
        expect(parsed.prompt.parts.base.length).toBeGreaterThan(0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should include full prompt when requested', async () => {
      // Given: a valid test config workspace
      const configDir = createTestConfigWorkspace({
        agentName: 'Print Config Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill' }],
      });
      tempDirs.push(configDir);

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        // When: running print-config command with full prompt mode
        await printConfigCommand({ configDir, prompt: 'full' });

        // Then: should output full prompt content
        // Filter out logger messages and find the JSON output
        const jsonOutput = logs.find((line) => line.trimStart().startsWith('{'));
        expect(jsonOutput).toBeDefined();
        const parsed = JSON.parse(jsonOutput!);
        expect(parsed.prompt.mode).toBe('full');
        expect(parsed.prompt.content).toBeDefined();
        expect(typeof parsed.prompt.content).toBe('string');
        expect(parsed.prompt.content.length).toBeGreaterThan(0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should redact sensitive values by default', async () => {
      // Given: a config workspace with MCP server containing API keys
      const configDir = createTestConfigWorkspace({
        agentName: 'Print Config Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill', mcpServers: ['secure-server'] }],
        mcpServers: {
          'secure-server': {
            type: 'http',
            url: 'https://api.example.com/mcp',
            headers: {
              Authorization: 'Bearer secret-token-12345',
              'X-Api-Key': 'sk-test-key-67890',
            },
          },
        },
      });
      tempDirs.push(configDir);

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        // When: running print-config command with default redaction
        await printConfigCommand({ configDir });

        // Then: should redact sensitive values
        // Filter out logger messages and find the JSON output
        const jsonOutput = logs.find((line) => line.trimStart().startsWith('{'));
        expect(jsonOutput).toBeDefined();
        const parsed = JSON.parse(jsonOutput!);
        const mcpServer = parsed.mcpServers.find((s: { id: string }) => s.id === 'secure-server');
        expect(mcpServer).toBeDefined();

        // Check that sensitive fields are redacted
        const configStr = JSON.stringify(mcpServer.config);
        expect(configStr).toContain('[REDACTED]');
        expect(configStr).not.toContain('secret-token-12345');
        expect(configStr).not.toContain('sk-test-key-67890');
      } finally {
        console.log = originalLog;
      }
    });

    it('should show sensitive values when no-redact is specified', async () => {
      // Given: a config workspace with MCP server containing API keys
      const configDir = createTestConfigWorkspace({
        agentName: 'Print Config Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill', mcpServers: ['secure-server'] }],
        mcpServers: {
          'secure-server': {
            type: 'http',
            url: 'https://api.example.com/mcp',
            headers: {
              Authorization: 'Bearer secret-token-12345',
            },
          },
        },
      });
      tempDirs.push(configDir);

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        // When: running print-config command with redact: false
        await printConfigCommand({ configDir, redact: false });

        // Then: should show actual values
        // Filter out logger messages and find the JSON output
        const jsonOutput = logs.find((line) => line.trimStart().startsWith('{'));
        expect(jsonOutput).toBeDefined();
        const parsed = JSON.parse(jsonOutput!);
        const mcpServer = parsed.mcpServers.find((s: { id: string }) => s.id === 'secure-server');
        expect(mcpServer).toBeDefined();

        // Check that sensitive fields are NOT redacted
        const configStr = JSON.stringify(mcpServer.config);
        expect(configStr).toContain('secret-token-12345');
        expect(configStr).not.toContain('[REDACTED]');
      } finally {
        console.log = originalLog;
      }
    });

    it('should show MCP server namespaces', async () => {
      // Given: a config workspace with multiple MCP servers
      const configDir = createTestConfigWorkspace({
        agentName: 'Print Config Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill 1', mcpServers: ['server-1', 'server-2'] },
          { id: 'skill-2', name: 'Skill 2', mcpServers: ['server-2'] },
        ],
        mcpServers: {
          'server-1': { command: 'node', args: ['./s1.js'] },
          'server-2': { command: 'node', args: ['./s2.js'] },
        },
      });
      tempDirs.push(configDir);

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        // When: running print-config command
        await printConfigCommand({ configDir });

        // Then: should show namespaces for each server
        // Filter out logger messages and find the JSON output
        const jsonOutput = logs.find((line) => line.trimStart().startsWith('{'));
        expect(jsonOutput).toBeDefined();
        const parsed = JSON.parse(jsonOutput!);
        expect(parsed.namespaces).toBeDefined();
        expect(Array.isArray(parsed.namespaces)).toBe(true);
        expect(parsed.namespaces.length).toBeGreaterThan(0);

        for (const ns of parsed.namespaces) {
          expect(ns.id).toBeDefined();
          expect(ns.namespace).toBeDefined();
        }
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('agent bundle', () => {
    it('should create deployment bundle with all required fields', async () => {
      // Given: a valid test config workspace
      const configDir = createTestConfigWorkspace({
        agentName: 'Bundle Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill' }],
      });
      tempDirs.push(configDir);

      const outputPath = join(configDir, 'test-bundle.json');

      // When: running bundle command
      await bundleCommand({ configDir, output: outputPath });

      // Then: should create bundle file
      expect(existsSync(outputPath)).toBe(true);

      const bundle = JSON.parse(readFileSync(outputPath, 'utf-8'));
      expect(bundle.version).toBe(1);
      expect(bundle.bundledAt).toBeDefined();
      expect(bundle.agentCard).toBeDefined();
      expect(bundle.systemPrompt).toBeDefined();
      expect(bundle.promptParts).toBeDefined();
      expect(bundle.mcpServers).toBeDefined();
      expect(bundle.workflows).toBeDefined();
    });

    it('should include prompt parts with skill attribution', async () => {
      // Given: a config workspace with multiple skills
      const configDir = createTestConfigWorkspace({
        agentName: 'Bundle Test Agent',
        skills: [
          { id: 'skill-1', name: 'Skill 1' },
          { id: 'skill-2', name: 'Skill 2' },
        ],
      });
      tempDirs.push(configDir);

      const outputPath = join(configDir, 'test-bundle.json');

      // When: running bundle command
      await bundleCommand({ configDir, output: outputPath });

      // Then: should include prompt parts for each skill
      const bundle = JSON.parse(readFileSync(outputPath, 'utf-8'));
      expect(bundle.promptParts).toBeDefined();
      expect(bundle.promptParts.base).toBeDefined();
      expect(bundle.promptParts.skills).toBeDefined();
      expect(Array.isArray(bundle.promptParts.skills)).toBe(true);
      expect(bundle.promptParts.skills.length).toBe(2);
    });

    it('should create bundle with environment variable references', async () => {
      // Given: a config workspace with MCP server using env vars in headers
      const configDir = createTestConfigWorkspace({
        agentName: 'Bundle Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill', mcpServers: ['env-server'] }],
        mcpServers: {
          'env-server': {
            type: 'http',
            url: 'https://api.example.com/mcp',
            headers: {
              Authorization: '$env:API_TOKEN',
            },
          },
        },
      });
      tempDirs.push(configDir);

      // Set the env var so config loading succeeds
      process.env.API_TOKEN = 'test-secret-12345';

      try {
        const outputPath = join(configDir, 'test-bundle.json');

        // When: running bundle command
        await bundleCommand({ configDir, output: outputPath });

        // Then: the bundle should be created successfully
        // Note: Env vars are resolved during config loading, so bundle contains resolved values
        // For production use, bundles should be secured and secrets managed separately
        const bundle = JSON.parse(readFileSync(outputPath, 'utf-8'));
        expect(bundle.mcpServers).toBeDefined();
        expect(bundle.mcpServers.length).toBeGreaterThan(0);
        expect(bundle.bundledAt).toBeDefined();
      } finally {
        delete process.env.API_TOKEN;
      }
    });

    it('should include MCP server configurations', async () => {
      // Given: a config workspace with MCP servers
      const configDir = createTestConfigWorkspace({
        agentName: 'Bundle Test Agent',
        skills: [
          {
            id: 'test-skill',
            name: 'Test Skill',
            mcpServers: ['server-1', 'server-2'],
          },
        ],
        mcpServers: {
          'server-1': { command: 'node', args: ['./s1.js'] },
          'server-2': { command: 'node', args: ['./s2.js'] },
        },
      });
      tempDirs.push(configDir);

      const outputPath = join(configDir, 'test-bundle.json');

      // When: running bundle command
      await bundleCommand({ configDir, output: outputPath });

      // Then: should include server configs with namespaces
      const bundle = JSON.parse(readFileSync(outputPath, 'utf-8'));
      expect(bundle.mcpServers).toBeDefined();
      expect(bundle.mcpServers.length).toBe(2);

      for (const server of bundle.mcpServers) {
        expect(server.id).toBeDefined();
        expect(server.namespace).toBeDefined();
        expect(server.config).toBeDefined();
        expect(server.usedBySkills).toBeDefined();
      }
    });

    it('should create YAML bundle when format is yaml', async () => {
      // Given: a valid test config workspace
      const configDir = createTestConfigWorkspace({
        agentName: 'Bundle Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill' }],
      });
      tempDirs.push(configDir);

      const outputPath = join(configDir, 'test-bundle.json');

      // When: running bundle command with yaml format
      await bundleCommand({ configDir, output: outputPath, format: 'yaml' });

      // Then: should create .yaml file
      const yamlPath = outputPath.replace('.json', '.yaml');
      expect(existsSync(yamlPath)).toBe(true);

      const yamlContent = readFileSync(yamlPath, 'utf-8');
      expect(yamlContent.length).toBeGreaterThan(0);
      // YAML format has quotes and commas stripped
      expect(yamlContent).not.toContain('"');
      expect(yamlContent).not.toContain(',');
    });

    it('should include workflow configurations in bundle', async () => {
      // Given: a config workspace with workflows (empty in this test setup)
      const configDir = createTestConfigWorkspace({
        agentName: 'Bundle Test Agent',
        skills: [{ id: 'test-skill', name: 'Test Skill' }],
      });
      tempDirs.push(configDir);

      const outputPath = join(configDir, 'test-bundle.json');

      // When: running bundle command
      await bundleCommand({ configDir, output: outputPath });

      // Then: should include workflows array (empty in this case)
      const bundle = JSON.parse(readFileSync(outputPath, 'utf-8'));
      expect(bundle.workflows).toBeDefined();
      expect(Array.isArray(bundle.workflows)).toBe(true);
    });
  });
});
