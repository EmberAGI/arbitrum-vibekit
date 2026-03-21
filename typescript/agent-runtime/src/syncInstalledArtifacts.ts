import type { Stats } from 'node:fs';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

type RetryableError = NodeJS.ErrnoException;

type FileOps = {
  cp: typeof cp;
  mkdir: typeof mkdir;
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
const DEFAULT_RETRY_DELAY_MS = 25;
const RETRYABLE_REPLACE_ERROR_CODES = new Set(['EBUSY', 'EEXIST', 'ENOENT', 'ENOTEMPTY', 'EPERM']);

const DEFAULT_FILE_OPS: FileOps = {
  cp,
  mkdir,
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

export async function copyArtifactDir({
  sourceRoot,
  relativeDir,
  targetRoot,
  fileOps = DEFAULT_FILE_OPS,
  maxReplaceAttempts = DEFAULT_MAX_REPLACE_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: CopyArtifactDirParams): Promise<void> {
  const sourceDir = path.join(sourceRoot, relativeDir);
  const sourceStats = await fileOps.stat(sourceDir);

  if (!sourceStats.isDirectory()) {
    return;
  }

  const targetDir = path.join(targetRoot, relativeDir);
  await fileOps.mkdir(path.dirname(targetDir), { recursive: true });

  for (let attempt = 1; attempt <= maxReplaceAttempts; attempt += 1) {
    try {
      await fileOps.rm(targetDir, { recursive: true, force: true });
      await fileOps.cp(sourceDir, targetDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableReplaceError(error) || attempt === maxReplaceAttempts) {
        throw error;
      }

      await sleep(retryDelayMs);
    }
  }
}
