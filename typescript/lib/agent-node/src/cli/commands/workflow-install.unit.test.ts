import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('child_process');
vi.mock('../output.js', () => ({
  cliOutput: {
    print: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { cliOutput } from '../output.js';

import { workflowInstallCommand } from './workflow-install.js';

// Helper to create mock child process
function createMockChildProcess(exitCode: number | null = 0, errorMsg?: string) {
  const mockProcess = new EventEmitter() as ChildProcess;
  mockProcess.stdout = new EventEmitter() as any;
  mockProcess.stderr = new EventEmitter() as any;

  // Simulate process behavior asynchronously
  process.nextTick(() => {
    if (errorMsg) {
      mockProcess.stderr?.emit('data', Buffer.from(errorMsg));
    }
    if (exitCode === null) {
      mockProcess.emit('error', new Error('Process spawn error'));
    } else {
      mockProcess.emit('close', exitCode);
    }
  });

  return mockProcess;
}

describe('workflow-install command', () => {
  let testDir: string;
  let configDir: string;
  let workflowsDir: string;
  const mockSpawn = vi.mocked(spawn);
  const mockCliOutput = vi.mocked(cliOutput);

  beforeEach(() => {
    vi.clearAllMocks();

    // Create temp directory for tests
    testDir = join(tmpdir(), `workflow-install-test-${Date.now()}`);
    configDir = join(testDir, 'config');
    workflowsDir = join(configDir, 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('workflowInstallCommand', () => {
    it('should throw error when specific workflow not found', async () => {
      // Given some workflow exists but not the requested one
      const existingWorkflow = join(workflowsDir, 'existing-workflow');
      mkdirSync(existingWorkflow);
      writeFileSync(join(existingWorkflow, 'package.json'), '{}');
      writeFileSync(join(existingWorkflow, 'index.ts'), 'export default {}');

      const workflowName = 'non-existent';

      // When trying to install
      const promise = workflowInstallCommand(workflowName, { configDir });

      // Then it throws with helpful error
      await expect(promise).rejects.toThrow(
        `Workflow "${workflowName}" not found or not installable`,
      );
      expect(mockCliOutput.error).toHaveBeenCalledWith(
        `Workflow "${workflowName}" not found or not installable`,
      );
      expect(mockCliOutput.info).toHaveBeenCalledWith(
        'Available installable workflows: existing-workflow',
      );
    });

    it('should list available workflows in error message', async () => {
      // Given some installable workflows exist
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'package.json'), '{}');
      writeFileSync(join(workflow2, 'index.js'), 'export default {}');

      // When trying to install non-existent workflow
      const promise = workflowInstallCommand('non-existent', { configDir });

      // Then it lists available workflows
      await expect(promise).rejects.toThrow();
      expect(mockCliOutput.info).toHaveBeenCalledWith(
        'Available installable workflows: workflow-1, workflow-2',
      );
    });

    it('should install all workflows when no name provided', async () => {
      // Given multiple installable workflows
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'package.json'), '{}');
      writeFileSync(join(workflow2, 'index.js'), 'export default {}');

      // Mock successful installs - need to create a new process for each call
      mockSpawn.mockImplementation(() => createMockChildProcess(0));

      // When installing all workflows
      await workflowInstallCommand(undefined, { configDir });

      // Then it installs both workflows
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.objectContaining({
          cwd: workflow1,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        }),
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.objectContaining({
          cwd: workflow2,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        }),
      );
      expect(mockCliOutput.success).toHaveBeenCalledWith('    ✓ workflow-1');
      expect(mockCliOutput.success).toHaveBeenCalledWith('    ✓ workflow-2');
    });

    it('should install all workflows when --all flag is used', async () => {
      // Given multiple workflows and --all flag
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      mockSpawn.mockImplementation(() => createMockChildProcess(0));

      // When installing with --all flag (even with a name)
      await workflowInstallCommand('workflow-1', { configDir, all: true });

      // Then it installs all workflows (ignores specific name)
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockCliOutput.success).toHaveBeenCalledWith('    ✓ workflow-1');
    });

    it('should install specific workflow by name', async () => {
      // Given multiple workflows
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'package.json'), '{}');
      writeFileSync(join(workflow2, 'index.js'), 'export default {}');

      mockSpawn.mockImplementation(() => createMockChildProcess(0));

      // When installing specific workflow
      await workflowInstallCommand('workflow-1', { configDir });

      // Then it only installs that workflow
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.objectContaining({
          cwd: workflow1,
        }),
      );
      expect(mockCliOutput.success).toHaveBeenCalledWith('    ✓ workflow-1');
      expect(mockCliOutput.success).not.toHaveBeenCalledWith('    ✓ workflow-2');
    });

    it('should respect --frozen-lockfile flag', async () => {
      // Given a workflow and frozen-lockfile flag
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      mockSpawn.mockImplementation(() => createMockChildProcess(0));

      // When installing with frozen-lockfile
      await workflowInstallCommand(undefined, { configDir, frozenLockfile: true });

      // Then it passes the flag to pnpm
      expect(mockSpawn).toHaveBeenCalledWith(
        'pnpm',
        ['install', '--frozen-lockfile'],
        expect.objectContaining({
          cwd: workflow1,
        }),
      );
    });

    it('should continue on error (does not stop at first failure)', async () => {
      // Given multiple workflows where first fails
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'package.json'), '{}');
      writeFileSync(join(workflow2, 'index.js'), 'export default {}');

      // First fails, second succeeds
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        return callCount === 1
          ? createMockChildProcess(1, 'install failed')
          : createMockChildProcess(0);
      });

      // When installing all workflows
      await workflowInstallCommand(undefined, { configDir });

      // Then it attempts both installations
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockCliOutput.error).toHaveBeenCalledWith(expect.stringContaining('✗ workflow-1'));
      expect(mockCliOutput.success).toHaveBeenCalledWith('    ✓ workflow-2');
    });

    it('should summarize results (success/failure counts)', async () => {
      // Given workflows with mixed results
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'package.json'), '{}');
      writeFileSync(join(workflow2, 'index.js'), 'export default {}');

      const workflow3 = join(workflowsDir, 'workflow-3');
      mkdirSync(workflow3);
      writeFileSync(join(workflow3, 'package.json'), '{}');
      writeFileSync(join(workflow3, 'workflow.ts'), 'export default {}');

      // Mixed results
      let callCount2 = 0;
      mockSpawn.mockImplementation(() => {
        callCount2++;
        if (callCount2 === 2) {
          return createMockChildProcess(1);
        }
        return createMockChildProcess(0);
      });

      // When installing all workflows
      await workflowInstallCommand(undefined, { configDir });

      // Then it shows summary
      expect(mockCliOutput.print).toHaveBeenCalledWith('');
      expect(mockCliOutput.print).toHaveBeenCalledWith('Summary: 2 succeeded, 1 failed');
    });

    it('should throw when all installations fail', async () => {
      // Given workflows that all fail
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'package.json'), '{}');
      writeFileSync(join(workflow2, 'index.js'), 'export default {}');

      // All fail
      mockSpawn.mockImplementation(() => createMockChildProcess(1));

      // When installing all workflows
      const promise = workflowInstallCommand(undefined, { configDir });

      // Then it throws error
      await expect(promise).rejects.toThrow('All workflow installations failed');
    });

    it('should succeed on partial success', async () => {
      // Given workflows with partial success
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'package.json'), '{}');
      writeFileSync(join(workflow2, 'index.js'), 'export default {}');

      // One succeeds, one fails
      let callCount3 = 0;
      mockSpawn.mockImplementation(() => {
        callCount3++;
        return callCount3 === 1 ? createMockChildProcess(0) : createMockChildProcess(1);
      });

      // When installing all workflows
      await workflowInstallCommand(undefined, { configDir });

      // Then it succeeds (does not throw)
      expect(mockCliOutput.print).toHaveBeenCalledWith('Summary: 1 succeeded, 1 failed');
    });

    it('should respect --quiet flag (suppresses output)', async () => {
      // Given a workflow and quiet flag
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      mockSpawn.mockImplementation(() => createMockChildProcess(0));

      // When installing with quiet flag
      await workflowInstallCommand(undefined, { configDir, quiet: true });

      // Then it suppresses output
      expect(mockCliOutput.info).not.toHaveBeenCalled();
      expect(mockCliOutput.print).not.toHaveBeenCalled();
      expect(mockCliOutput.success).not.toHaveBeenCalled();
    });

    it('should show errors even with --quiet flag', async () => {
      // Given a workflow that fails and quiet flag
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      mockSpawn.mockReturnValue(createMockChildProcess(1));

      // When installing with quiet flag
      const promise = workflowInstallCommand(undefined, { configDir, quiet: true });

      // Then it still shows critical errors
      await expect(promise).rejects.toThrow('All workflow installations failed');
      // But regular output is suppressed
      expect(mockCliOutput.info).not.toHaveBeenCalled();
      expect(mockCliOutput.print).not.toHaveBeenCalled();
    });

    it('should handle process spawn errors', async () => {
      // Given a workflow and spawn error
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      mockSpawn.mockImplementation(() => createMockChildProcess(null)); // null = spawn error

      // When installing - should throw because all failed
      const promise = workflowInstallCommand(undefined, { configDir });

      // Then it should throw (all installations failed)
      await expect(promise).rejects.toThrow('All workflow installations failed');

      // And it should log the error
      expect(mockCliOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('✗ workflow-1: Process spawn error'),
      );
    });

    it('should warn when no installable workflows found', async () => {
      // Given no workflows with package.json
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}'); // No package.json

      // When installing
      await workflowInstallCommand(undefined, { configDir });

      // Then it warns
      expect(mockCliOutput.warn).toHaveBeenCalledWith(
        'No installable workflows found (workflows with package.json)',
      );
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should handle empty workflows directory', async () => {
      // Given empty workflows directory

      // When installing
      await workflowInstallCommand(undefined, { configDir });

      // Then it warns
      expect(mockCliOutput.warn).toHaveBeenCalledWith(
        'No installable workflows found (workflows with package.json)',
      );
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });
});
