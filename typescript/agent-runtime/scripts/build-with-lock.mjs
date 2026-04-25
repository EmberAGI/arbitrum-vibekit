import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const lockDir = path.resolve(packageRoot, '..', '.build-locks', 'agent-runtime-build.sync-lock');
const lockRetryDelayMs = 250;
const maxLockAttempts = 1200;

const sleep = async (delayMs) => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const isRetryableLockError = (error) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error.code === 'EEXIST' ||
    error.code === 'ENOTEMPTY' ||
    error.code === 'EBUSY' ||
    error.code === 'EPERM');

async function acquireLock() {
  await mkdir(path.dirname(lockDir), { recursive: true });

  for (let attempt = 1; attempt <= maxLockAttempts; attempt += 1) {
    try {
      await mkdir(lockDir, { recursive: false });
      return;
    } catch (error) {
      if (!isRetryableLockError(error) || attempt === maxLockAttempts) {
        throw error;
      }

      await sleep(lockRetryDelayMs);
    }
  }
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

await acquireLock();

try {
  await runCommand('pnpm', ['build:deps']);
  await runCommand('pnpm', ['exec', 'tsc', '--project', 'tsconfig.json']);
  await runCommand('node', ['./scripts/sync-installed-artifacts.mjs']);
} finally {
  await rm(lockDir, { recursive: true, force: true });
}
