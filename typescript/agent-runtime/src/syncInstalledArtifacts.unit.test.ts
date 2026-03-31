import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { copyArtifactDir } from './syncInstalledArtifacts.js';

describe('syncInstalledArtifacts', () => {
  it('retries snapshot replacement when cleanup briefly reports ENOTEMPTY', async () => {
    const stat = vi.fn(() => Promise.resolve({
      isDirectory: () => true,
    }));
    const mkdir = vi.fn(() => Promise.resolve(undefined));
    const rm = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('directory still settling'), { code: 'ENOTEMPTY' }))
      .mockResolvedValue(undefined);
    const cp = vi.fn(() => Promise.resolve(undefined));

    await expect(
      copyArtifactDir({
        sourceRoot: '/source',
        relativeDir: 'dist',
        targetRoot: '/target',
        fileOps: {
          stat,
          mkdir,
          rm,
          cp,
        },
        maxReplaceAttempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined();

    expect(stat).toHaveBeenCalledWith('/source/dist');
    expect(mkdir).toHaveBeenCalledWith('/target', { recursive: true });
    expect(rm).toHaveBeenCalledTimes(3);
    expect(rm).toHaveBeenNthCalledWith(1, '/target/dist', { recursive: true, force: true });
    expect(rm).toHaveBeenNthCalledWith(2, '/target/dist', { recursive: true, force: true });
    expect(rm).toHaveBeenNthCalledWith(3, '/target/dist.sync-lock', {
      recursive: true,
      force: true,
    });
    expect(cp).toHaveBeenCalledTimes(1);
    expect(cp).toHaveBeenCalledWith('/source/dist', '/target/dist', { recursive: true, force: true });
  });

  it('retries snapshot replacement when copy races with an existing target directory', async () => {
    const stat = vi.fn(() => Promise.resolve({
      isDirectory: () => true,
    }));
    const mkdir = vi.fn(() => Promise.resolve(undefined));
    const rm = vi.fn(() => Promise.resolve(undefined));
    const cp = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('target directory already exists'), { code: 'EEXIST' }))
      .mockResolvedValue(undefined);

    await expect(
      copyArtifactDir({
        sourceRoot: '/source',
        relativeDir: 'dist',
        targetRoot: '/target',
        fileOps: {
          stat,
          mkdir,
          rm,
          cp,
        },
        maxReplaceAttempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined();

    expect(rm).toHaveBeenCalledTimes(3);
    expect(cp).toHaveBeenCalledTimes(2);
    expect(rm).toHaveBeenNthCalledWith(3, '/target/dist.sync-lock', {
      recursive: true,
      force: true,
    });
    expect(cp).toHaveBeenNthCalledWith(1, '/source/dist', '/target/dist', { recursive: true, force: true });
    expect(cp).toHaveBeenNthCalledWith(2, '/source/dist', '/target/dist', { recursive: true, force: true });
  });

  it('waits for a per-target sync lock before replacing installed artifacts', async () => {
    let releaseAfterSecondLockAttempt: (() => void) | null = null;
    const secondLockAttemptObserved = new Promise<void>((resolve) => {
      releaseAfterSecondLockAttempt = resolve;
    });
    const stat = vi.fn(() => Promise.resolve({
      isDirectory: () => true,
    }));
    let lockAttempt = 0;
    const mkdir = vi.fn(async (targetPath: string, options?: { recursive?: boolean }) => {
      if (targetPath === '/target') {
        expect(options).toEqual({ recursive: true });
        return;
      }

      if (targetPath === '/target/dist.sync-lock') {
        lockAttempt += 1;
        if (lockAttempt === 1) {
          return;
        }

        if (lockAttempt === 2) {
          releaseAfterSecondLockAttempt?.();
          throw Object.assign(new Error('lock busy'), { code: 'EEXIST' });
        }

        return;
      }

      throw new Error(`Unexpected mkdir path: ${targetPath}`);
    });
    const rm = vi.fn(() => Promise.resolve(undefined));
    let copyAttempt = 0;
    const cp = vi.fn(async () => {
      copyAttempt += 1;
      if (copyAttempt === 1) {
        await secondLockAttemptObserved;
      }
    });

    await expect(
      Promise.all([
        copyArtifactDir({
          sourceRoot: '/source',
          relativeDir: 'dist',
          targetRoot: '/target',
          fileOps: {
            stat,
            mkdir,
            rm,
            cp,
          },
          retryDelayMs: 0,
        }),
        copyArtifactDir({
          sourceRoot: '/source',
          relativeDir: 'dist',
          targetRoot: '/target',
          fileOps: {
            stat,
            mkdir,
            rm,
            cp,
          },
          retryDelayMs: 0,
        }),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    expect(mkdir).toHaveBeenCalledWith('/target', { recursive: true });
    expect(mkdir).toHaveBeenCalledWith('/target/dist.sync-lock');
    expect(rm).toHaveBeenCalledWith('/target/dist.sync-lock', { recursive: true, force: true });
    expect(cp).toHaveBeenCalledTimes(2);
  });

  it('syncs postgres dist artifacts into installed agent-runtime snapshots', () => {
    const scriptSource = readFileSync(
      path.resolve(import.meta.dirname, '../scripts/sync-installed-artifacts.mjs'),
      'utf8',
    );

    expect(scriptSource.includes("path.join('lib', 'postgres', 'dist')")).toBe(true);
  });
});
