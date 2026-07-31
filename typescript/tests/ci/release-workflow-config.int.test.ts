import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

type WorkflowTrigger = {
  branches?: string[];
  paths?: string[];
};

type WorkflowStep = {
  if?: string;
  name?: string;
  run?: string;
};

type WorkflowJob = {
  steps?: WorkflowStep[];
};

type WorkflowConfig = {
  on?: {
    pull_request?: WorkflowTrigger;
    push?: WorkflowTrigger;
    workflow_dispatch?: Record<string, unknown>;
  };
  jobs?: {
    prepare?: WorkflowJob;
    release?: WorkflowJob;
    validate?: WorkflowJob;
  };
};

async function readReleaseWorkflow(): Promise<WorkflowConfig> {
  const workflowPath = path.resolve(import.meta.dirname, '../../../.github/workflows/release.yml');
  const workflowContent = await readFile(workflowPath, 'utf8');

  return yaml.load(workflowContent) as WorkflowConfig;
}

describe('release workflow trusted-branch configuration', () => {
  it('runs on trusted branch pushes without top-level push path gating', async () => {
    const workflow = await readReleaseWorkflow();

    expect(workflow.on?.workflow_dispatch).toBeDefined();
    expect(workflow.on?.push?.branches).toEqual(['main', 'next']);
    expect(workflow.on?.push?.paths).toBeUndefined();
    expect(workflow.on?.pull_request?.paths).toContain(
      'typescript/onchain-actions-plugins/registry/**',
    );
    expect(workflow.on?.pull_request?.paths).toContain(
      'typescript/onchain-actions-plugins/contracts/**',
    );
  });

  it('keeps the prepare job lightweight by avoiding dependency installation', async () => {
    const workflow = await readReleaseWorkflow();
    const stepNames = workflow.jobs?.prepare?.steps?.map((step) => step.name) ?? [];

    expect(stepNames).not.toContain('Setup pnpm');
    expect(stepNames).not.toContain('Install dependencies');
  });

  it('tests registry compatibility and contracts in both release jobs', async () => {
    const workflow = await readReleaseWorkflow();
    const registryManifest = JSON.parse(
      await readFile(
        path.resolve(import.meta.dirname, '../../onchain-actions-plugins/registry/package.json'),
        'utf8',
      ),
    ) as { scripts?: Record<string, string> };

    for (const job of [workflow.jobs?.validate, workflow.jobs?.release]) {
      const registryTest = job?.steps?.find((step) => step.name === 'Test registry');
      const contractBuild = job?.steps?.find((step) => step.name === 'Build contracts');
      const contractTest = job?.steps?.find((step) => step.name === 'Test contracts');
      const prepare = job?.steps?.find((step) => step.name === 'Prepare npm publish folder');

      expect(registryTest).toMatchObject({
        if: "matrix.package.id == 'registry'",
        run: 'pnpm --filter @emberai/onchain-actions-registry test:ci',
      });
      expect(contractBuild).toMatchObject({
        if: "matrix.package.id == 'contracts'",
        run: 'pnpm --filter @emberai/onchain-actions-contracts build',
      });
      expect(contractTest).toMatchObject({
        if: "matrix.package.id == 'contracts'",
        run: 'pnpm --filter @emberai/onchain-actions-contracts test:ci',
      });
      expect(prepare?.if).toBe(
        "matrix.package.id == 'registry' || matrix.package.id == 'contracts'",
      );
      expect(prepare?.run).toContain('matrix.package.packageJson');
    }

    expect(registryManifest.scripts?.['test:ci']).toBe(
      'tsdown && vitest run --config vitest.config.ts',
    );
  });

  it('configures contracts for stable and next provenance-backed publication', async () => {
    const configPath = path.resolve(
      import.meta.dirname,
      '../../onchain-actions-plugins/contracts/release.config.mjs',
    );
    const configModule = (await import(`${pathToFileURL(configPath).href}?test=${Date.now()}`)) as {
      default: {
        branches: unknown;
        tagFormat: string;
        plugins: Array<[string, Record<string, unknown>]>;
      };
    };
    const config = configModule.default;
    const npmPlugin = config.plugins.find(([name]) => name === '@semantic-release/npm');

    expect(config.branches).toEqual([
      'main',
      {
        channel: 'next',
        name: 'next',
        prerelease: 'next',
      },
    ]);
    expect(config.tagFormat).toBe('@emberai/onchain-actions-contracts@${version}');
    expect(npmPlugin?.[1]).toMatchObject({
      pkgRoot: '.npm-publish',
      provenance: true,
    });
  });

  it('refreshes the registry publish manifest after local dependency versions resolve', async () => {
    const configPath = path.resolve(
      import.meta.dirname,
      '../../onchain-actions-plugins/registry/release.config.mjs',
    );
    const configModule = (await import(`${pathToFileURL(configPath).href}?test=${Date.now()}`)) as {
      default: {
        plugins: Array<[string, Record<string, unknown>]>;
      };
    };
    const plugins = configModule.default.plugins;
    const refreshIndex = plugins.findIndex(([name]) => name === '@semantic-release/exec');
    const npmIndex = plugins.findIndex(([name]) => name === '@semantic-release/npm');

    expect(refreshIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeLessThan(npmIndex);
    expect(plugins[refreshIndex]?.[1]).toMatchObject({
      prepareCmd:
        'node ../../scripts/prepare-npm-publish.mjs --package onchain-actions-plugins/registry/package.json',
    });
  });
});
