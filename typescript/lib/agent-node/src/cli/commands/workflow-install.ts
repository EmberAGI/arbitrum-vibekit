/**
 * CLI Command: agent workflow install
 * Install dependencies for workflow packages
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';

import { getInstallableWorkflows } from '../../config/loaders/workflow-discovery.js';
import { resolveConfigDirectory } from '../../config/runtime/config-dir.js';
import { cliOutput } from '../output.js';

export interface WorkflowInstallOptions {
  configDir?: string;
  all?: boolean;
  frozenLockfile?: boolean;
  quiet?: boolean;
}

interface InstallResult {
  workflowId: string;
  success: boolean;
  error?: string;
}

const moduleRequire = createRequire(import.meta.url);
const pnpmExePackagePath = moduleRequire.resolve('@pnpm/exe/package.json');
const pnpmExePackageDir = dirname(pnpmExePackagePath);
const pnpmExeRequire = createRequire(resolve(pnpmExePackageDir, 'package.json'));

function resolveBundledPnpmBinary(): string {
  const platform =
    process.platform === 'win32'
      ? 'win'
      : process.platform === 'darwin'
        ? 'macos'
        : process.platform;
  const arch = platform === 'win' && process.arch === 'ia32' ? 'x86' : process.arch;
  const packageName = `@pnpm/${platform}-${arch}`;

  try {
    const optionalPackageJsonPath = pnpmExeRequire.resolve(`${packageName}/package.json`);
    const optionalPackageDir = dirname(optionalPackageJsonPath);
    const optionalPackageJson = pnpmExeRequire(optionalPackageJsonPath) as {
      bin?: string | Record<string, string>;
    };
    const binaryRelativePath =
      typeof optionalPackageJson.bin === 'string'
        ? optionalPackageJson.bin
        : (optionalPackageJson.bin?.['pnpm'] ?? (platform === 'win' ? 'pnpm.exe' : 'pnpm'));

    return resolve(optionalPackageDir, binaryRelativePath);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Bundled pnpm binary not available for platform ${platform}-${arch}: ${details}`,
    );
  }
}

const BUNDLED_PNPM_BINARY = resolveBundledPnpmBinary();

/**
 * Install dependencies for a single workflow
 * @param workflowPath - Absolute path to workflow directory
 * @param frozenLockfile - Use frozen lockfile
 * @returns Promise that resolves when install completes
 */
function installWorkflowDependencies(
  workflowPath: string,
  frozenLockfile: boolean,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = ['install', '--ignore-workspace'];
    if (frozenLockfile) {
      args.push('--frozen-lockfile');
    }

    const child = spawn(BUNDLED_PNPM_BINARY, args, {
      cwd: workflowPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    child.on('error', (error: Error) => {
      reject(error);
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`pnpm install exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

/**
 * Install dependencies for one or all workflows
 * @param workflowName - Optional specific workflow name
 * @param options - Install options
 */
export async function workflowInstallCommand(
  workflowName: string | undefined,
  options: WorkflowInstallOptions,
): Promise<void> {
  const { configDir } = resolveConfigDirectory(options.configDir);
  const workflowsDir = resolve(configDir, 'workflows');

  // Discover installable workflows
  const installable = getInstallableWorkflows(workflowsDir);

  if (installable.length === 0) {
    cliOutput.warn('No installable workflows found (workflows with package.json)');
    return;
  }

  // Filter to specific workflow if name provided
  let toInstall = installable;
  if (workflowName && !options.all) {
    toInstall = installable.filter((w) => w.id === workflowName);
    if (toInstall.length === 0) {
      const error = new Error(`Workflow "${workflowName}" not found or not installable`);
      cliOutput.error(error.message);
      cliOutput.info(`Available installable workflows: ${installable.map((w) => w.id).join(', ')}`);
      throw error;
    }
  }

  if (!options.quiet) {
    cliOutput.info(`Installing dependencies for ${toInstall.length} workflow(s)...`);
  }

  // Install each workflow
  const results: InstallResult[] = [];
  for (const workflow of toInstall) {
    if (!options.quiet) {
      cliOutput.print(`  Installing ${workflow.id}...`);
    }

    try {
      await installWorkflowDependencies(workflow.absolutePath, options.frozenLockfile ?? false);
      results.push({
        workflowId: workflow.id,
        success: true,
      });
      if (!options.quiet) {
        cliOutput.success(`    ✓ ${workflow.id}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({
        workflowId: workflow.id,
        success: false,
        error: errorMessage,
      });
      if (!options.quiet) {
        cliOutput.error(`    ✗ ${workflow.id}: ${errorMessage}`);
      }
    }
  }

  // Print summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  if (!options.quiet) {
    cliOutput.print('');
    cliOutput.print(`Summary: ${successful} succeeded, ${failed} failed`);
  }

  // Throw error if all failed
  if (failed === results.length) {
    throw new Error('All workflow installations failed');
  }
  // Partial success or all success - return normally
}
