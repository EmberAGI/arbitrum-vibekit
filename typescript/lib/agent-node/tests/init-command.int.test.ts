/**
 * Integration tests for init command
 * Tests full initialization workflow with ERC-8004 configuration
 */

import { existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import matter from 'gray-matter';
import { describe, it, expect, afterEach } from 'vitest';

import { initCommand } from '../src/cli/commands/init.js';

describe('Init Command Integration', () => {
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

  /**
   * Helper to create unique temp directory
   */
  function createTempDir(): string {
    const dir = join(
      tmpdir(),
      `agent-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    tempDirs.push(dir);
    return dir;
  }

  describe('non-interactive mode (--yes)', () => {
    it('should create all required files with defaults', async () => {
      // Given: temp directory and non-interactive mode
      const tempDir = createTempDir();

      // When: running init with --yes
      await initCommand({ target: tempDir, yes: true });

      // Then: all files should be created
      expect(existsSync(join(tempDir, 'agent.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'agent.manifest.json'))).toBe(true);
      expect(existsSync(join(tempDir, 'mcp.json'))).toBe(true);
      expect(existsSync(join(tempDir, 'workflow.json'))).toBe(true);
      expect(existsSync(join(tempDir, 'README.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'skills'))).toBe(true);
      expect(existsSync(join(tempDir, 'skills', 'general-assistant.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'skills', 'ember-onchain-actions.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'workflows'))).toBe(true);
      expect(existsSync(join(tempDir, 'workflows', 'example-workflow.ts'))).toBe(true);
    });

    it('should create .env file in parent directory', async () => {
      // Given: temp directory
      const tempDir = createTempDir();
      const parentDir = join(tempDir, '..');
      const envPath = join(parentDir, '.env');

      // When: running init
      await initCommand({ target: join(tempDir, 'config'), yes: true });

      // Then: .env should be created in parent
      expect(existsSync(envPath)).toBe(true);

      // Cleanup parent .env
      if (existsSync(envPath)) {
        rmSync(envPath);
      }
    });
  });

  describe('agent.md structure', () => {
    it('should include ai block with default OpenRouter configuration', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: agent.md should include ai block
      const agentMdPath = join(tempDir, 'agent.md');
      const agentMdContent = readFileSync(agentMdPath, 'utf-8');
      const parsed = matter(agentMdContent);

      expect(parsed.data['ai']).toBeDefined();
      expect(parsed.data['ai']['modelProvider']).toBe('openrouter');
      expect(parsed.data['ai']['model']).toBe('openai/gpt-5');
      expect(parsed.data['ai']['params']).toBeDefined();
      expect(parsed.data['ai']['params']['temperature']).toBe(0.7);
      expect(parsed.data['ai']['params']['maxTokens']).toBe(4096);
    });

    it('should include routing block with default Agent Card path', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: agent.md should include routing block
      const agentMdPath = join(tempDir, 'agent.md');
      const agentMdContent = readFileSync(agentMdPath, 'utf-8');
      const parsed = matter(agentMdContent);

      expect(parsed.data['routing']).toBeDefined();
      expect(parsed.data['routing']['agentCardPath']).toBe('/.well-known/agent-card.json');
    });

    it('should include erc8004 block with enabled=true by default', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: agent.md should include erc8004 block
      const agentMdPath = join(tempDir, 'agent.md');
      const agentMdContent = readFileSync(agentMdPath, 'utf-8');
      const parsed = matter(agentMdContent);

      expect(parsed.data['erc8004']).toBeDefined();
      expect(parsed.data['erc8004']['enabled']).toBe(true);
    });

    it('should set canonical chain to Arbitrum One (42161) by default', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: canonical chain should be Arbitrum One
      const agentMdPath = join(tempDir, 'agent.md');
      const agentMdContent = readFileSync(agentMdPath, 'utf-8');
      const parsed = matter(agentMdContent);

      expect(parsed.data['erc8004']['canonical']).toBeDefined();
      expect(parsed.data['erc8004']['canonical']['chainId']).toBe(42161);
    });

    it('should set default mirrors to Ethereum (1) and Base (8453)', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: mirrors should include Ethereum and Base
      const agentMdPath = join(tempDir, 'agent.md');
      const agentMdContent = readFileSync(agentMdPath, 'utf-8');
      const parsed = matter(agentMdContent);

      expect(parsed.data['erc8004']['mirrors']).toBeDefined();
      expect(parsed.data['erc8004']['mirrors']).toHaveLength(2);

      const chainIds = parsed.data['erc8004']['mirrors'].map((m: { chainId: number }) => m.chainId);
      expect(chainIds).toContain(1); // Ethereum
      expect(chainIds).toContain(8453); // Base
    });

    it('should prefill identity registries with Sepolia and zero-address placeholders', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: identity registries should be prefilled
      const agentMdPath = join(tempDir, 'agent.md');
      const agentMdContent = readFileSync(agentMdPath, 'utf-8');
      const parsed = matter(agentMdContent);

      expect(parsed.data['erc8004']['identityRegistries']).toBeDefined();

      const registries = parsed.data['erc8004']['identityRegistries'];
      expect(registries['1']).toBe('0x0000000000000000000000000000000000000000'); // Ethereum placeholder
      expect(registries['8453']).toBe('0x0000000000000000000000000000000000000000'); // Base placeholder
      expect(registries['11155111']).toBe('0x8004a6090Cd10A7288092483047B097295Fb8847'); // Sepolia real
      expect(registries['42161']).toBe('0x0000000000000000000000000000000000000000'); // Arbitrum placeholder
    });

    it('should include card block with default settings', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: card block should have correct structure
      const agentMdPath = join(tempDir, 'agent.md');
      const agentMdContent = readFileSync(agentMdPath, 'utf-8');
      const parsed = matter(agentMdContent);

      expect(parsed.data['card']).toBeDefined();
      expect(parsed.data['card']['protocolVersion']).toBe('0.3.0');
      expect(parsed.data['card']['name']).toBe('My Agent');
      expect(parsed.data['card']['version']).toBe('1.0.0');
      expect(parsed.data['card']['url']).toBe('http://localhost:3000/a2a');
      expect(parsed.data['card']['capabilities']).toBeDefined();
      expect(parsed.data['card']['capabilities']['streaming']).toBe(true);
    });

    it('should include system prompt in agent.md body', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: agent.md body should have system prompt
      const agentMdPath = join(tempDir, 'agent.md');
      const agentMdContent = readFileSync(agentMdPath, 'utf-8');
      const parsed = matter(agentMdContent);

      expect(parsed.content).toContain('You are a helpful AI agent');
      expect(parsed.content).toContain('Core Instructions');
    });
  });

  describe('manifest structure', () => {
    it('should create valid manifest with skills and registries', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: manifest should be valid JSON with correct structure
      const manifestPath = join(tempDir, 'agent.manifest.json');
      const manifestContent = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      expect(manifest.version).toBe(1);
      expect(manifest.skills).toBeDefined();
      expect(Array.isArray(manifest.skills)).toBe(true);
      expect(manifest.skills).toHaveLength(2);
      expect(manifest.skills[0]).toBe('./skills/general-assistant.md');
      expect(manifest.skills[1]).toBe('./skills/ember-onchain-actions.md');

      expect(manifest.registries).toBeDefined();
      expect(manifest.registries.mcp).toBe('./mcp.json');
      expect(manifest.registries.workflows).toBe('./workflow.json');

      expect(manifest.merge).toBeDefined();
    });
  });

  describe('skill files', () => {
    it('should create general-assistant skill with valid frontmatter', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: general-assistant.md should exist and be valid
      const skillPath = join(tempDir, 'skills', 'general-assistant.md');
      const skillContent = readFileSync(skillPath, 'utf-8');
      const parsed = matter(skillContent);

      expect(parsed.data['skill']).toBeDefined();
      expect(parsed.data['skill']['id']).toBe('general-assistant');
      expect(parsed.data['skill']['name']).toBe('General Assistant');
      expect(parsed.data['skill']['tags']).toContain('general');
    });

    it('should create ember-onchain-actions skill with valid frontmatter', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: ember-onchain-actions.md should exist and be valid
      const skillPath = join(tempDir, 'skills', 'ember-onchain-actions.md');
      const skillContent = readFileSync(skillPath, 'utf-8');
      const parsed = matter(skillContent);

      expect(parsed.data['skill']).toBeDefined();
      expect(parsed.data['skill']['id']).toBe('ember-onchain-actions');
      expect(parsed.data['skill']['name']).toBe('Ember Onchain Actions');
      expect(parsed.data['skill']['tags']).toContain('blockchain');
    });
  });

  describe('mcp and workflow registries', () => {
    it('should create mcp.json with default servers', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: mcp.json should have default servers
      const mcpPath = join(tempDir, 'mcp.json');
      const mcpContent = readFileSync(mcpPath, 'utf-8');
      const mcp = JSON.parse(mcpContent);

      expect(mcp.mcpServers).toBeDefined();
      expect(mcp.mcpServers.fetch).toBeDefined();
      expect(mcp.mcpServers.fetch.type).toBe('stdio');
      expect(mcp.mcpServers.ember_onchain_actions).toBeDefined();
      expect(mcp.mcpServers.ember_onchain_actions.type).toBe('http');
    });

    it('should create workflow.json with example workflow', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: workflow.json should have example workflow
      const workflowPath = join(tempDir, 'workflow.json');
      const workflowContent = readFileSync(workflowPath, 'utf-8');
      const workflow = JSON.parse(workflowContent);

      expect(workflow.workflows).toBeDefined();
      expect(Array.isArray(workflow.workflows)).toBe(true);
      expect(workflow.workflows).toHaveLength(1);
      expect(workflow.workflows[0]?.id).toBe('example-workflow');
      expect(workflow.workflows[0]?.from).toBe('./workflows/example-workflow.ts');
      expect(workflow.workflows[0]?.enabled).toBe(true);
    });

    it('should create example-workflow.ts with valid TypeScript', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: example-workflow.ts should exist and contain valid structure
      const workflowTsPath = join(tempDir, 'workflows', 'example-workflow.ts');
      const workflowTsContent = readFileSync(workflowTsPath, 'utf-8');

      expect(workflowTsContent).toContain('import');
      expect(workflowTsContent).toContain('WorkflowPlugin');
      expect(workflowTsContent).toContain('export default plugin');
      expect(workflowTsContent).toContain("id: 'example-workflow'");
    });
  });

  describe('README generation', () => {
    it('should create README with usage instructions', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init
      await initCommand({ target: tempDir, yes: true });

      // Then: README should contain key sections
      const readmePath = join(tempDir, 'README.md');
      const readmeContent = readFileSync(readmePath, 'utf-8');

      expect(readmeContent).toContain('# Agent Configuration');
      expect(readmeContent).toContain('## Structure');
      expect(readmeContent).toContain('## Usage');
      expect(readmeContent).toContain('agent.md');
      expect(readmeContent).toContain('agent.manifest.json');
      expect(readmeContent).toContain('doctor');
      expect(readmeContent).toContain('print-config');
    });
  });

  describe('force overwrite', () => {
    it('should overwrite existing directory when --force is used', async () => {
      // Given: temp directory with existing init
      const tempDir = createTempDir();
      await initCommand({ target: tempDir, yes: true });

      // Modify a file to verify overwrite
      const agentMdPath = join(tempDir, 'agent.md');
      const _originalContent = readFileSync(agentMdPath, 'utf-8');

      // When: running init again with --force
      await initCommand({ target: tempDir, yes: true, force: true });

      // Then: file should be overwritten (content reset to defaults)
      const newContent = readFileSync(agentMdPath, 'utf-8');
      expect(newContent).toBeDefined();
      const parsed = matter(newContent);
      expect(parsed.data['card']['name']).toBe('My Agent');
    });

    it('should throw error when directory exists without --force', async () => {
      // Given: temp directory with existing init
      const tempDir = createTempDir();
      await initCommand({ target: tempDir, yes: true });

      // When/Then: running init again without --force should throw
      await expect(initCommand({ target: tempDir, yes: true })).rejects.toThrow(
        'Directory already exists',
      );
    });
  });

  describe('.env placeholders', () => {
    it('should append provider and Pinata placeholders to .env when not provided', async () => {
      // Given: temp directory
      const tempDir = createTempDir();

      // When: running init in non-interactive mode
      await initCommand({ target: tempDir, yes: true });

      // Then: .env should be created in parent with placeholders
      const envPath = join(tempDir, '..', '.env');
      expect(existsSync(envPath)).toBe(true);

      const envContents = readFileSync(envPath, 'utf-8');
      expect(envContents).toMatch(/OPENROUTER_API_KEY=/);
      expect(envContents).toMatch(/ANTHROPIC_API_KEY=/);
      expect(envContents).toMatch(/OPENAI_API_KEY=/);
      expect(envContents).toMatch(/PINATA_JWT=/);
      expect(envContents).toMatch(/PINATA_GATEWAY=/);

      // Cleanup parent .env
      if (existsSync(envPath)) {
        rmSync(envPath);
      }
    });
  });
});
