/**
 * Integration tests for hot reload functionality
 * Tests file watching and minimal restart behavior
 */

import { writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { describe, it, expect, afterEach } from 'vitest';

import { ConfigWorkspaceWatcher, type FileChange } from '../src/config/runtime/watcher.js';

import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

describe('Hot Reload Integration Tests', () => {
  const tempDirs: string[] = [];
  const watchers: ConfigWorkspaceWatcher[] = [];

  afterEach(() => {
    // Stop all watchers
    for (const watcher of watchers) {
      watcher.stop();
    }
    watchers.length = 0;

    // Clean up temp directories
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  describe('File Watching', () => {
    it('should detect changes to agent.md', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Watch Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1' }],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // When: modifying agent.md
      const agentMdPath = join(configDir, 'agent.md');
      const originalContent = readFileSync(agentMdPath, 'utf-8');
      const modifiedContent = originalContent + '\n\nModified agent prompt.';

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(agentMdPath, modifiedContent, 'utf-8');

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should detect change with correct type
      expect(changes.length).toBeGreaterThan(0);
      const agentChange = changes.find((c) => c.type === 'agent');
      expect(agentChange).toBeDefined();
      expect(agentChange?.path).toBe(agentMdPath);
      expect(['change', 'rename']).toContain(agentChange?.event); // Accept both change and rename events
    });

    it('should detect changes to skills/*.md', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Watch Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1' }],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // When: modifying a skill file
      const skill1Path = join(configDir, 'skills', 'skill-1.md');
      const originalContent = readFileSync(skill1Path, 'utf-8');
      const modifiedContent = originalContent + '\n\nModified skill prompt.';

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(skill1Path, modifiedContent, 'utf-8');

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should detect change with skill type
      expect(changes.length).toBeGreaterThan(0);
      const skillChange = changes.find((c) => c.type === 'skill');
      expect(skillChange).toBeDefined();
      expect(skillChange?.path).toContain('skill-1.md');
      expect(['change', 'rename']).toContain(skillChange?.event); // Accept both change and rename events
    });

    it('should detect changes to mcp.json', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Watch Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // When: modifying mcp.json
      const mcpPath = join(configDir, 'mcp.json');

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(
        mcpPath,
        JSON.stringify({
          mcpServers: {
            'new-server': {
              command: 'node',
              args: ['./new.js'],
            },
          },
        }),
        'utf-8',
      );

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should detect change with mcp type
      expect(changes.length).toBeGreaterThan(0);
      const mcpChange = changes.find((c) => c.type === 'mcp');
      expect(mcpChange).toBeDefined();
      expect(mcpChange?.path).toBe(mcpPath);
      expect(['change', 'rename']).toContain(mcpChange?.event); // Accept both change and rename events
    });

    it('should detect changes to workflow.json', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Watch Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // When: modifying workflow.json
      const workflowPath = join(configDir, 'workflow.json');

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(
        workflowPath,
        JSON.stringify({
          workflows: [
            {
              id: 'new-workflow',
              from: './workflows/new.ts',
              enabled: true,
            },
          ],
        }),
        'utf-8',
      );

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should detect change with workflow type
      expect(changes.length).toBeGreaterThan(0);
      const workflowChange = changes.find((c) => c.type === 'workflow');
      expect(workflowChange).toBeDefined();
      expect(workflowChange?.path).toBe(workflowPath);
      expect(['change', 'rename']).toContain(workflowChange?.event); // Accept both change and rename events
    });

    it('should detect changes to agent.manifest.json', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Watch Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1' }],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // When: modifying manifest
      const manifestPath = join(configDir, 'agent.manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      manifest.version = 2; // Bump version

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should detect change with manifest type
      expect(changes.length).toBeGreaterThan(0);
      const manifestChange = changes.find((c) => c.type === 'manifest');
      expect(manifestChange).toBeDefined();
      expect(manifestChange?.path).toBe(manifestPath);
      expect(['change', 'rename']).toContain(manifestChange?.event); // Accept both change and rename events
    });
  });

  describe('Debouncing', () => {
    it('should debounce rapid successive changes to same file', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Debounce Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // When: making multiple rapid changes to agent.md
      const agentMdPath = join(configDir, 'agent.md');
      const originalContent = readFileSync(agentMdPath, 'utf-8');

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Make 5 rapid changes
      for (let i = 0; i < 5; i++) {
        writeFileSync(agentMdPath, originalContent + `\n\nChange ${i}`, 'utf-8');
        await new Promise((resolve) => setTimeout(resolve, 50)); // Less than debounce time
      }

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should only trigger once after debounce period
      const agentChanges = changes.filter((c) => c.type === 'agent');
      expect(agentChanges.length).toBe(1);
    });

    it('should handle changes to different files independently', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Multi-file Test Agent',
        skills: [{ id: 'skill-1', name: 'Skill 1' }],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // When: modifying multiple files
      const agentMdPath = join(configDir, 'agent.md');
      const skill1Path = join(configDir, 'skills', 'skill-1.md');

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Modify both files
      const agentContent = readFileSync(agentMdPath, 'utf-8');
      const skillContent = readFileSync(skill1Path, 'utf-8');

      writeFileSync(agentMdPath, agentContent + '\n\nModified agent.', 'utf-8');
      writeFileSync(skill1Path, skillContent + '\n\nModified skill.', 'utf-8');

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should detect changes for both files
      expect(changes.length).toBeGreaterThanOrEqual(2);

      const agentChange = changes.find((c) => c.type === 'agent');
      const skillChange = changes.find((c) => c.type === 'skill');

      expect(agentChange).toBeDefined();
      expect(skillChange).toBeDefined();
    });
  });

  describe('Watcher Lifecycle', () => {
    it('should stop watching when stop() is called', async () => {
      // Given: a config workspace with active watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Lifecycle Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // When: stopping the watcher
      watcher.stop();

      // And then modifying a file
      const agentMdPath = join(configDir, 'agent.md');
      const originalContent = readFileSync(agentMdPath, 'utf-8');
      writeFileSync(agentMdPath, originalContent + '\n\nModified after stop.', 'utf-8');

      // Wait for potential change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should not detect changes after stop
      expect(changes.length).toBe(0);
    });

    it('should clean up resources when stopped', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Cleanup Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, () => {
        // No-op handler
      });

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // When: stopping the watcher
      watcher.stop();

      // Then: should not throw errors (cleanup successful)
      // Multiple stops should be safe
      watcher.stop();
    });
  });

  describe('Change Type Classification', () => {
    it.skip('should correctly classify workflow module changes', async () => {
      // TODO: File watcher may not detect changes in dynamically created directories
      // This test creates the workflows directory after the watcher starts,
      // which may not be properly monitored. Needs investigation of watcher behavior.
      // Given: a config workspace with workflows directory
      const configDir = createTestConfigWorkspace({
        agentName: 'Workflow Module Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // When: creating a workflow module file
      const workflowsDir = join(configDir, 'workflows');
      const workflowModulePath = join(workflowsDir, 'test-workflow.ts');

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create workflows directory if it doesn't exist
      if (!existsSync(workflowsDir)) {
        mkdirSync(workflowsDir, { recursive: true });
      }

      writeFileSync(
        workflowModulePath,
        `
export default {
  id: 'test-workflow',
  name: 'Test Workflow',
  async *execute() {
    yield { type: 'status', status: { state: 'working' } };
  }
};
`,
        'utf-8',
      );

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: should detect change as workflow-module type
      expect(changes.length).toBeGreaterThan(0);
      const workflowModuleChange = changes.find((c) => c.type === 'workflow-module');
      expect(workflowModuleChange).toBeDefined();
      expect(workflowModuleChange?.path).toContain('test-workflow.ts');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in synchronous change handler gracefully', async () => {
      // Given: a config workspace with watcher that has failing sync handler
      const configDir = createTestConfigWorkspace({
        agentName: 'Error Handling Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      let errorThrown = false;

      // Use synchronous handler that throws
      watcher.start(configDir, () => {
        errorThrown = true;
        throw new Error('Handler failed');
      });

      // When: modifying a file
      const agentMdPath = join(configDir, 'agent.md');
      const originalContent = readFileSync(agentMdPath, 'utf-8');

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(agentMdPath, originalContent + '\n\nTrigger error.', 'utf-8');

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: watcher should continue working despite handler error
      expect(errorThrown).toBe(true);
      // Watcher should still be running (no crash)
    });

    it('should handle errors in async change handler gracefully', async () => {
      // Given: a config workspace with watcher that has failing async handler
      const configDir = createTestConfigWorkspace({
        agentName: 'Error Handling Test Agent',
        skills: [],
      });
      tempDirs.push(configDir);

      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      let errorThrown = false;

      // Use async handler that throws
      watcher.start(configDir, async () => {
        errorThrown = true;
        throw new Error('Handler failed');
      });

      // When: modifying a file
      const agentMdPath = join(configDir, 'agent.md');
      const originalContent = readFileSync(agentMdPath, 'utf-8');

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(agentMdPath, originalContent + '\n\nTrigger error.', 'utf-8');

      // Wait for debounce and change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: watcher should continue working despite handler error
      expect(errorThrown).toBe(true);
      // Watcher should still be running (no crash)
    });
  });

  describe('Hot Reload Strategy Per PRD', () => {
    it('should identify prompt-only changes (agent.md or skill.md)', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Hot Reload Strategy Test',
        skills: [{ id: 'skill-1', name: 'Skill 1' }],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // When: modifying agent.md (prompt only)
      const agentMdPath = join(configDir, 'agent.md');
      const originalContent = readFileSync(agentMdPath, 'utf-8');
      writeFileSync(agentMdPath, originalContent + '\n\nUpdated instructions.', 'utf-8');

      // Wait for change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: change type should be 'agent' indicating recompose only (no MCP restart)
      const agentChange = changes.find((c) => c.type === 'agent');
      expect(agentChange).toBeDefined();
      expect(agentChange?.type).toBe('agent');
    });

    it('should identify MCP registry changes requiring server restart', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'MCP Restart Test',
        skills: [],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // When: modifying mcp.json
      const mcpPath = join(configDir, 'mcp.json');
      writeFileSync(
        mcpPath,
        JSON.stringify({
          mcpServers: {
            'updated-server': {
              command: 'node',
              args: ['./updated.js'],
            },
          },
        }),
        'utf-8',
      );

      // Wait for change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: change type should be 'mcp' indicating server restart needed
      const mcpChange = changes.find((c) => c.type === 'mcp');
      expect(mcpChange).toBeDefined();
      expect(mcpChange?.type).toBe('mcp');
    });

    it('should identify workflow changes requiring plugin reload', async () => {
      // Given: a config workspace with watcher
      const configDir = createTestConfigWorkspace({
        agentName: 'Workflow Reload Test',
        skills: [],
      });
      tempDirs.push(configDir);

      const changes: FileChange[] = [];
      const watcher = new ConfigWorkspaceWatcher();
      watchers.push(watcher);

      watcher.start(configDir, (change) => {
        changes.push(change);
      });

      // Wait for watcher to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // When: modifying workflow.json
      const workflowPath = join(configDir, 'workflow.json');
      writeFileSync(
        workflowPath,
        JSON.stringify({
          workflows: [
            {
              id: 'updated-workflow',
              from: './workflows/updated.ts',
              enabled: true,
            },
          ],
        }),
        'utf-8',
      );

      // Wait for change detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then: change type should be 'workflow' indicating plugin reload needed
      const workflowChange = changes.find((c) => c.type === 'workflow');
      expect(workflowChange).toBeDefined();
      expect(workflowChange?.type).toBe('workflow');
    });
  });
});
