import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { copyArtifactDir } from './syncInstalledArtifacts.js';

describe('syncInstalledArtifacts', () => {
  it('copies into installed artifact directories without removing current declarations', async () => {
    const stat = vi.fn(() =>
      Promise.resolve({
        isDirectory: () => true,
      }),
    );
    const mkdir = vi.fn(() => Promise.resolve(undefined));
    const realpath = vi.fn((targetPath: string) => Promise.resolve(targetPath));
    const rm = vi.fn(() => Promise.resolve(undefined));
    const cp = vi.fn(() => Promise.resolve(undefined));

    await expect(
      copyArtifactDir({
        sourceRoot: '/source',
        relativeDir: 'dist',
        targetRoot: '/target',
        fileOps: {
          stat,
          mkdir,
          realpath,
          rm,
          cp,
        },
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined();

    expect(stat).toHaveBeenCalledWith('/source/dist');
    expect(mkdir).toHaveBeenCalledWith('/target/dist', { recursive: true });
    expect(mkdir).toHaveBeenCalledWith('/target/dist.sync-lock');
    expect(rm).not.toHaveBeenCalledWith('/target/dist', { recursive: true, force: true });
    expect(rm).toHaveBeenCalledWith('/target/dist.sync-lock', { recursive: true, force: true });
    expect(cp).toHaveBeenCalledTimes(1);
    expect(cp).toHaveBeenCalledWith('/source/dist', '/target/dist', {
      recursive: true,
      force: true,
      filter: expect.any(Function),
    });
  });

  it('retries snapshot copy when copy races with an existing target directory', async () => {
    const stat = vi.fn(() =>
      Promise.resolve({
        isDirectory: () => true,
      }),
    );
    const mkdir = vi.fn(() => Promise.resolve(undefined));
    const realpath = vi.fn((targetPath: string) => Promise.resolve(targetPath));
    const rm = vi.fn(() => Promise.resolve(undefined));
    const cp = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('target directory already exists'), { code: 'EEXIST' }),
      )
      .mockResolvedValue(undefined);

    await expect(
      copyArtifactDir({
        sourceRoot: '/source',
        relativeDir: 'dist',
        targetRoot: '/target',
        fileOps: {
          stat,
          mkdir,
          realpath,
          rm,
          cp,
        },
        maxReplaceAttempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined();

    expect(rm).not.toHaveBeenCalledWith('/target/dist', { recursive: true, force: true });
    expect(rm).toHaveBeenCalledWith('/target/dist.sync-lock', { recursive: true, force: true });
    expect(cp).toHaveBeenCalledTimes(2);
    expect(cp).toHaveBeenNthCalledWith(1, '/source/dist', '/target/dist', {
      recursive: true,
      force: true,
      filter: expect.any(Function),
    });
    expect(cp).toHaveBeenNthCalledWith(2, '/source/dist', '/target/dist', {
      recursive: true,
      force: true,
      filter: expect.any(Function),
    });
  });

  it('skips artifact sync when the installed snapshot resolves to the package source directory', async () => {
    const stat = vi.fn(() =>
      Promise.resolve({
        isDirectory: () => true,
      }),
    );
    const mkdir = vi.fn(() => Promise.resolve(undefined));
    const realpath = vi.fn((targetPath: string) => Promise.resolve(targetPath));
    const rm = vi.fn(() => Promise.resolve(undefined));
    const cp = vi.fn(() => Promise.resolve(undefined));

    await expect(
      copyArtifactDir({
        sourceRoot: '/workspace/agent-runtime',
        relativeDir: 'dist',
        targetRoot: '/workspace/agent-runtime',
        fileOps: {
          stat,
          mkdir,
          realpath,
          rm,
          cp,
        },
      }),
    ).resolves.toBeUndefined();

    expect(stat).toHaveBeenCalledWith('/workspace/agent-runtime/dist');
    expect(realpath).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
    expect(cp).not.toHaveBeenCalled();
  });

  it('skips artifact sync when a pnpm file snapshot resolves to the package source directory', async () => {
    const stat = vi.fn(() =>
      Promise.resolve({
        isDirectory: () => true,
      }),
    );
    const mkdir = vi.fn(() => Promise.resolve(undefined));
    const realpath = vi.fn((targetPath: string) =>
      Promise.resolve(
        targetPath.endsWith('/dist')
          ? '/workspace/node_modules/.pnpm/agent-runtime-pi@file+agent-runtime+lib+pi/node_modules/agent-runtime-pi/dist'
          : targetPath,
      ),
    );
    const rm = vi.fn(() => Promise.resolve(undefined));
    const cp = vi.fn(() => Promise.resolve(undefined));

    await expect(
      copyArtifactDir({
        sourceRoot: '/workspace/agent-runtime/lib/pi',
        relativeDir: 'dist',
        targetRoot:
          '/workspace/node_modules/.pnpm/agent-runtime-pi@file+agent-runtime+lib+pi/node_modules/agent-runtime-pi',
        fileOps: {
          stat,
          mkdir,
          realpath,
          rm,
          cp,
        },
      }),
    ).resolves.toBeUndefined();

    expect(mkdir).toHaveBeenCalledWith(
      '/workspace/node_modules/.pnpm/agent-runtime-pi@file+agent-runtime+lib+pi/node_modules/agent-runtime-pi/dist',
      { recursive: true },
    );
    expect(rm).not.toHaveBeenCalled();
    expect(cp).not.toHaveBeenCalled();
  });

  it('skips hardlinked files that already point at the source artifact', async () => {
    const stat = vi.fn((targetPath: string) => {
      if (targetPath === '/source/dist' || targetPath === '/target/dist') {
        return Promise.resolve({
          dev: targetPath === '/source/dist' ? 1 : 2,
          ino: targetPath === '/source/dist' ? 10 : 20,
          isDirectory: () => true,
        });
      }

      if (targetPath.endsWith('/syncInstalledArtifacts.d.ts')) {
        return Promise.resolve({
          dev: 3,
          ino: 30,
          isDirectory: () => false,
        });
      }

      if (targetPath === '/source/dist/new.js') {
        return Promise.resolve({
          dev: 3,
          ino: 31,
          isDirectory: () => false,
        });
      }

      return Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    });
    const mkdir = vi.fn(() => Promise.resolve(undefined));
    const realpath = vi.fn((targetPath: string) => Promise.resolve(targetPath));
    const rm = vi.fn(() => Promise.resolve(undefined));
    const cp = vi.fn(() => Promise.resolve(undefined));

    await expect(
      copyArtifactDir({
        sourceRoot: '/source',
        relativeDir: 'dist',
        targetRoot: '/target',
        fileOps: {
          stat,
          mkdir,
          realpath,
          rm,
          cp,
        },
      }),
    ).resolves.toBeUndefined();

    const options = cp.mock.calls[0]?.[2];

    expect(options).toEqual({
      recursive: true,
      force: true,
      filter: expect.any(Function),
    });
    await expect(
      options?.filter?.(
        '/source/dist/syncInstalledArtifacts.d.ts',
        '/target/dist/syncInstalledArtifacts.d.ts',
      ),
    ).resolves.toBe(false);
    await expect(options?.filter?.('/source/dist/new.js', '/target/dist/new.js')).resolves.toBe(
      true,
    );
  });

  it('waits for a per-target sync lock before syncing installed artifacts', async () => {
    let releaseAfterSecondLockAttempt: (() => void) | null = null;
    const secondLockAttemptObserved = new Promise<void>((resolve) => {
      releaseAfterSecondLockAttempt = resolve;
    });
    const stat = vi.fn(() =>
      Promise.resolve({
        isDirectory: () => true,
      }),
    );
    let lockAttempt = 0;
    const realpath = vi.fn((targetPath: string) => Promise.resolve(targetPath));
    const mkdir = vi.fn((targetPath: string, options?: { recursive?: boolean }) => {
      if (targetPath === '/target/dist') {
        expect(options).toEqual({ recursive: true });
        return Promise.resolve(undefined);
      }

      if (targetPath === '/target/dist.sync-lock') {
        lockAttempt += 1;
        if (lockAttempt === 1) {
          return Promise.resolve(undefined);
        }

        if (lockAttempt === 2) {
          releaseAfterSecondLockAttempt?.();
          return Promise.reject(Object.assign(new Error('lock busy'), { code: 'EEXIST' }));
        }

        return Promise.resolve(undefined);
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
          realpath,
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
          realpath,
          rm,
          cp,
          },
          retryDelayMs: 0,
        }),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    expect(mkdir).toHaveBeenCalledWith('/target/dist', { recursive: true });
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

  it('serializes the agent-runtime build before compiling and syncing artifacts', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const scriptSource = readFileSync(
      path.resolve(import.meta.dirname, '../scripts/build-with-lock.mjs'),
      'utf8',
    );

    expect(packageJson.scripts?.build).toBe('node ./scripts/build-with-lock.mjs');
    expect(packageJson.scripts).not.toHaveProperty('prebuild');
    expect(scriptSource).toContain('agent-runtime-build.sync-lock');
    expect(scriptSource).toContain("'pnpm', ['build:deps']");
    expect(scriptSource).toContain("'pnpm', ['exec', 'tsc', '--project', 'tsconfig.json']");
    expect(scriptSource).toContain("'node', ['./scripts/sync-installed-artifacts.mjs']");
  });
});
