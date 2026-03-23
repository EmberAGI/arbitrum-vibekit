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
    expect(rm).toHaveBeenCalledTimes(2);
    expect(rm).toHaveBeenNthCalledWith(1, '/target/dist', { recursive: true, force: true });
    expect(rm).toHaveBeenNthCalledWith(2, '/target/dist', { recursive: true, force: true });
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

    expect(rm).toHaveBeenCalledTimes(2);
    expect(cp).toHaveBeenCalledTimes(2);
    expect(cp).toHaveBeenNthCalledWith(1, '/source/dist', '/target/dist', { recursive: true, force: true });
    expect(cp).toHaveBeenNthCalledWith(2, '/source/dist', '/target/dist', { recursive: true, force: true });
  });

  it('syncs postgres dist artifacts into installed agent-runtime snapshots', () => {
    const scriptSource = readFileSync(
      path.resolve(import.meta.dirname, '../scripts/sync-installed-artifacts.mjs'),
      'utf8',
    );

    expect(scriptSource.includes("path.join('lib', 'postgres', 'dist')")).toBe(true);
  });
});
