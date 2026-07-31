import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, '../..');

let temporaryRoot: string | undefined;

afterEach(async () => {
  if (temporaryRoot) {
    await rm(temporaryRoot, { force: true, recursive: true });
    temporaryRoot = undefined;
  }
});

describe('prepare-npm-publish', () => {
  it('replaces registry workspace dependencies with publishable package versions', async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), 'prepare-npm-publish-'));
    const fixtureWorkspace = path.join(temporaryRoot, 'typescript');
    const fixtureScriptDirectory = path.join(fixtureWorkspace, 'scripts');
    const registryDirectory = path.join(fixtureWorkspace, 'onchain-actions-plugins/registry');
    const contractsDirectory = path.join(fixtureWorkspace, 'onchain-actions-plugins/contracts');

    await Promise.all([
      mkdir(fixtureScriptDirectory, { recursive: true }),
      mkdir(registryDirectory, { recursive: true }),
      mkdir(contractsDirectory, { recursive: true }),
    ]);
    await symlink(
      path.join(workspaceRoot, 'node_modules'),
      path.join(fixtureWorkspace, 'node_modules'),
      'dir',
    );
    await writeFile(
      path.join(fixtureScriptDirectory, 'prepare-npm-publish.mjs'),
      await readFile(path.join(workspaceRoot, 'scripts/prepare-npm-publish.mjs')),
    );
    await writeFile(path.join(fixtureWorkspace, 'pnpm-workspace.yaml'), 'catalog: {}\n');
    await writeFile(
      path.join(registryDirectory, 'package.json'),
      JSON.stringify({
        name: '@emberai/onchain-actions-registry',
        version: '0.0.0',
        dependencies: {
          '@emberai/onchain-actions-contracts': 'workspace:^',
        },
      }),
    );
    await writeFile(
      path.join(contractsDirectory, 'package.json'),
      JSON.stringify({
        name: '@emberai/onchain-actions-contracts',
        version: '1.2.3',
      }),
    );

    await execFileAsync(
      process.execPath,
      ['scripts/prepare-npm-publish.mjs', '--package', 'registry'],
      { cwd: fixtureWorkspace },
    );

    const prepared = JSON.parse(
      await readFile(path.join(registryDirectory, '.npm-publish/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    expect(prepared.dependencies['@emberai/onchain-actions-contracts']).toBe('^1.2.3');
  });
});
