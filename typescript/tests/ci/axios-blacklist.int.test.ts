import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');

/**
 * axios 1.14.1 and 0.30.4 were identified as compromised releases and must never
 * be resolvable anywhere in this workspace. This guard fails the build if either
 * version reappears in the root pnpm override, the lockfile, or any workspace
 * package.json, so a future dependency bump cannot silently reintroduce them.
 */
const BLOCKED_AXIOS_VERSIONS = ['1.14.1', '0.30.4'];

describe('axios compromised-version blacklist', () => {
  it('pins axios via a root pnpm override to a safe, non-blocked version', async () => {
    const rootPackageJsonRaw = await readFile(path.join(workspaceRoot, 'package.json'), 'utf8');
    const rootPackageJson = JSON.parse(rootPackageJsonRaw) as {
      pnpm?: { overrides?: Record<string, string> };
    };

    const axiosOverride = rootPackageJson.pnpm?.overrides?.axios;
    expect(
      axiosOverride,
      'root package.json must declare a pnpm.overrides["axios"] pin so every dependency path resolves to the same, safe axios version',
    ).toBeTruthy();

    for (const blockedVersion of BLOCKED_AXIOS_VERSIONS) {
      expect(
        axiosOverride,
        `pnpm.overrides["axios"] must not be pinned to the compromised version ${blockedVersion}`,
      ).not.toBe(blockedVersion);
    }
  });

  it('does not resolve axios 1.14.1 or 0.30.4 anywhere in the lockfile', async () => {
    const lockfile = await readFile(path.join(workspaceRoot, 'pnpm-lock.yaml'), 'utf8');

    for (const blockedVersion of BLOCKED_AXIOS_VERSIONS) {
      // Lockfile package keys are indented and start with the exact package name,
      // e.g. "  axios@1.12.2:" or "  axios@1.12.2(debug@4.4.3):". Anchoring on
      // "axios@" right after leading whitespace avoids false positives on
      // unrelated packages such as "retry-axios@..." or "gaxios@...".
      const pattern = new RegExp(`^\\s*axios@${blockedVersion.replace(/\./g, '\\.')}\\b`, 'm');
      expect(
        pattern.test(lockfile),
        `pnpm-lock.yaml must not contain a resolved axios@${blockedVersion} entry`,
      ).toBe(false);
    }
  });

  it('does not declare axios 1.14.1 or 0.30.4 as an exact dependency range in any workspace package.json', async () => {
    const { glob } = await import('glob');
    const packageJsonPaths: string[] = await glob('**/package.json', {
      cwd: workspaceRoot,
      ignore: ['**/node_modules/**', '**/dist/**'],
      absolute: true,
    });

    for (const packageJsonPath of packageJsonPaths) {
      const raw = await readFile(packageJsonPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const dependencySections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

      for (const section of dependencySections) {
        const deps = parsed[section] as Record<string, string> | undefined;
        const declaredAxiosRange = deps?.axios;
        if (!declaredAxiosRange) continue;

        for (const blockedVersion of BLOCKED_AXIOS_VERSIONS) {
          expect(
            declaredAxiosRange,
            `${path.relative(workspaceRoot, packageJsonPath)} must not declare axios as exactly ${blockedVersion} in "${section}"`,
          ).not.toBe(blockedVersion);
        }
      }
    }
  });
});
