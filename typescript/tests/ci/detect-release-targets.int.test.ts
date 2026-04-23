import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const detectReleaseTargetsScript = path.resolve(
  import.meta.dirname,
  '../../scripts/detect-release-targets.mjs',
);

async function initGitRepository(repoRoot: string) {
  await execFileAsync('git', ['init', '--initial-branch=main'], {
    cwd: repoRoot,
  });
  await execFileAsync('git', ['config', 'user.name', 'Codex'], {
    cwd: repoRoot,
  });
  await execFileAsync('git', ['config', 'user.email', 'codex@example.com'], {
    cwd: repoRoot,
  });
}

async function commitAll(repoRoot: string, message: string) {
  await execFileAsync('git', ['add', '.'], {
    cwd: repoRoot,
  });
  await execFileAsync('git', ['commit', '-m', message], {
    cwd: repoRoot,
  });
}

async function writeReleaseWorkspace(repoRoot: string) {
  const workspaceRoot = path.join(repoRoot, 'typescript');

  await mkdir(path.join(workspaceRoot, 'lib/agent-node/src'), { recursive: true });
  await mkdir(path.join(workspaceRoot, 'onchain-actions-plugins/registry/src'), {
    recursive: true,
  });

  await writeFile(
    path.join(workspaceRoot, 'lib/agent-node/package.json'),
    JSON.stringify({
      name: '@emberai/agent-node',
      version: '0.0.0',
    }),
  );
  await writeFile(
    path.join(workspaceRoot, 'onchain-actions-plugins/registry/package.json'),
    JSON.stringify({
      name: '@emberai/onchain-actions-registry',
      version: '0.0.0',
    }),
  );
  await writeFile(
    path.join(workspaceRoot, 'lib/agent-node/src/index.ts'),
    "export const agentNode = 'stable';\n",
  );
  await writeFile(
    path.join(workspaceRoot, 'onchain-actions-plugins/registry/src/index.ts'),
    "export const registryVersion = 'stable';\n",
  );

  return workspaceRoot;
}

async function runDetectReleaseTargets(workspaceRoot: string, extraEnv: NodeJS.ProcessEnv = {}) {
  const { stdout } = await execFileAsync(
    'node',
    [detectReleaseTargetsScript, '--output', 'release-targets.json'],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
    },
  );

  return JSON.parse(stdout) as {
    matrix: Array<{ id: string; packageName: string }>;
    selected: string[];
  };
}

describe('detect-release-targets', () => {
  it('uses the latest stable tag on main even when a newer prerelease tag exists', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'detect-release-targets-main-'));

    try {
      const workspaceRoot = await writeReleaseWorkspace(repoRoot);

      await initGitRepository(repoRoot);
      await commitAll(repoRoot, 'initial release state');

      await execFileAsync('git', ['tag', '@emberai/agent-node@1.0.0'], {
        cwd: repoRoot,
      });
      await execFileAsync('git', ['tag', '@emberai/onchain-actions-registry@1.2.3'], {
        cwd: repoRoot,
      });

      await writeFile(
        path.join(workspaceRoot, 'onchain-actions-plugins/registry/src/index.ts'),
        "export const registryVersion = 'next';\n",
      );
      await commitAll(repoRoot, 'registry prerelease change');

      await execFileAsync('git', ['tag', '@emberai/onchain-actions-registry@1.2.4-next.1'], {
        cwd: repoRoot,
      });

      const result = await runDetectReleaseTargets(workspaceRoot, {
        RELEASE_SIMULATE_BRANCH: 'main',
      });

      expect(result.selected).toEqual(['registry']);
      expect(result.matrix).toHaveLength(1);
      expect(result.matrix[0]).toMatchObject({
        id: 'registry',
        packageName: '@emberai/onchain-actions-registry',
      });
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it('returns no release targets when only the release workflow file changes', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'detect-release-targets-noop-'));

    try {
      const workspaceRoot = await writeReleaseWorkspace(repoRoot);

      await initGitRepository(repoRoot);
      await commitAll(repoRoot, 'initial release state');

      await execFileAsync('git', ['tag', '@emberai/agent-node@1.0.0'], {
        cwd: repoRoot,
      });
      await execFileAsync('git', ['tag', '@emberai/onchain-actions-registry@1.2.3'], {
        cwd: repoRoot,
      });

      await mkdir(path.join(repoRoot, '.github/workflows'), { recursive: true });
      await writeFile(
        path.join(repoRoot, '.github/workflows/release.yml'),
        'name: Release Packages\n',
      );
      await commitAll(repoRoot, 'workflow-only change');

      const result = await runDetectReleaseTargets(workspaceRoot, {
        RELEASE_SIMULATE_BRANCH: 'main',
      });

      expect(result.selected).toEqual([]);
      expect(result.matrix).toEqual([]);
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it('uses the latest prerelease tag on next for prerelease publishing', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'detect-release-targets-next-'));

    try {
      const workspaceRoot = await writeReleaseWorkspace(repoRoot);

      await initGitRepository(repoRoot);
      await commitAll(repoRoot, 'initial release state');

      await execFileAsync('git', ['tag', '@emberai/agent-node@1.0.0'], {
        cwd: repoRoot,
      });
      await execFileAsync('git', ['tag', '@emberai/onchain-actions-registry@1.2.3'], {
        cwd: repoRoot,
      });

      await writeFile(
        path.join(workspaceRoot, 'onchain-actions-plugins/registry/src/index.ts'),
        "export const registryVersion = 'next-1';\n",
      );
      await commitAll(repoRoot, 'registry prerelease base');

      await execFileAsync('git', ['tag', '@emberai/onchain-actions-registry@1.2.4-next.1'], {
        cwd: repoRoot,
      });

      await writeFile(
        path.join(workspaceRoot, 'onchain-actions-plugins/registry/src/index.ts'),
        "export const registryVersion = 'next-2';\n",
      );
      await commitAll(repoRoot, 'registry prerelease follow-up');

      const result = await runDetectReleaseTargets(workspaceRoot, {
        RELEASE_SIMULATE_BRANCH: 'next',
      });

      expect(result.selected).toEqual(['registry']);
      expect(result.matrix).toHaveLength(1);
      expect(result.matrix[0]).toMatchObject({
        id: 'registry',
        packageName: '@emberai/onchain-actions-registry',
      });
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});
