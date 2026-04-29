import type { Stats } from 'node:fs';
import { cp, mkdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';

type RetryableError = NodeJS.ErrnoException;

type FileOps = {
  cp: typeof cp;
  mkdir: typeof mkdir;
  realpath: (path: string) => Promise<string>;
  rm: typeof rm;
  stat: (path: string) => Promise<Stats>;
};

type CopyArtifactDirParams = {
  fileOps?: FileOps;
  maxReplaceAttempts?: number;
  relativeDir: string;
  retryDelayMs?: number;
  sourceRoot: string;
  targetRoot: string;
};

const DEFAULT_MAX_REPLACE_ATTEMPTS = 3;
const DEFAULT_MAX_LOCK_ATTEMPTS = 1200;
const DEFAULT_RETRY_DELAY_MS = 25;
const RETRYABLE_REPLACE_ERROR_CODES = new Set(['EBUSY', 'EEXIST', 'ENOENT', 'ENOTEMPTY', 'EPERM']);
const RETRYABLE_LOCK_ERROR_CODES = new Set(['EBUSY', 'EEXIST', 'ENOTEMPTY', 'EPERM']);

const DEFAULT_FILE_OPS: FileOps = {
  cp,
  mkdir,
  realpath,
  rm,
  stat,
};

const sleep = async (delayMs: number): Promise<void> => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const isRetryableReplaceError = (error: unknown): error is RetryableError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'string' &&
  RETRYABLE_REPLACE_ERROR_CODES.has((error as { code: string }).code);

const isRetryableLockError = (error: unknown): error is RetryableError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'string' &&
  RETRYABLE_LOCK_ERROR_CODES.has((error as { code: string }).code);

const isMissingPathError = (error: unknown): error is RetryableError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'ENOENT';

async function isSameFilesystemEntry(
  sourcePath: string,
  targetPath: string,
  fileOps: FileOps,
): Promise<boolean> {
  try {
    const [sourceStats, targetStats] = await Promise.all([
      fileOps.stat(sourcePath),
      fileOps.stat(targetPath),
    ]);

    return (
      typeof sourceStats.dev === 'number' &&
      typeof sourceStats.ino === 'number' &&
      sourceStats.dev === targetStats.dev &&
      sourceStats.ino === targetStats.ino
    );
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

async function withDirectoryLock(input: {
  fileOps: FileOps;
  lockDir: string;
  maxLockAttempts: number;
  retryDelayMs: number;
  run: () => Promise<void>;
}): Promise<void> {
  for (let attempt = 1; attempt <= input.maxLockAttempts; attempt += 1) {
    try {
      await input.fileOps.mkdir(input.lockDir);
      break;
    } catch (error) {
      if (!isRetryableLockError(error) || attempt === input.maxLockAttempts) {
        throw error;
      }

      await sleep(input.retryDelayMs);
    }
  }

  try {
    await input.run();
  } finally {
    await input.fileOps.rm(input.lockDir, { recursive: true, force: true });
  }
}

export async function copyArtifactDir({
  sourceRoot,
  relativeDir,
  targetRoot,
  fileOps = DEFAULT_FILE_OPS,
  maxReplaceAttempts = DEFAULT_MAX_REPLACE_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: CopyArtifactDirParams): Promise<void> {
  const sourceDir = path.resolve(sourceRoot, relativeDir);
  const sourceStats = await fileOps.stat(sourceDir);

  if (!sourceStats.isDirectory()) {
    return;
  }

  const targetDir = path.resolve(targetRoot, relativeDir);
  if (sourceDir === targetDir) {
    return;
  }

  await fileOps.mkdir(targetDir, { recursive: true });
  const [realSourceDir, realTargetDir] = await Promise.all([
    fileOps.realpath(sourceDir),
    fileOps.realpath(targetDir),
  ]);

  if (realSourceDir === realTargetDir) {
    return;
  }

  const lockDir = `${targetDir}.sync-lock`;

  await withDirectoryLock({
    fileOps,
    lockDir,
    maxLockAttempts: DEFAULT_MAX_LOCK_ATTEMPTS,
    retryDelayMs,
    run: async () => {
      for (let attempt = 1; attempt <= maxReplaceAttempts; attempt += 1) {
        try {
          await fileOps.cp(sourceDir, targetDir, {
            recursive: true,
            force: true,
            filter: async (sourcePath, targetPath) =>
              !(await isSameFilesystemEntry(sourcePath, targetPath, fileOps)),
          });
          return;
        } catch (error) {
          if (!isRetryableReplaceError(error) || attempt === maxReplaceAttempts) {
            throw error;
          }

          await sleep(retryDelayMs);
        }
      }
    },
  });
}
