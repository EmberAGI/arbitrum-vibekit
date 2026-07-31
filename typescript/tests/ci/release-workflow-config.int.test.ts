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
  uses?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  name?: string;
  strategy?: {
    matrix?: unknown;
  };
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

  it('uses a current Node 24 runtime before installing the latest npm', async () => {
    const workflow = await readReleaseWorkflow();

    for (const job of [workflow.jobs?.validate, workflow.jobs?.release]) {
      const setupNode = job?.steps?.find((step) => step.name === 'Setup Node.js');
      const upgradeNpm = job?.steps?.find(
        (step) => step.name === 'Upgrade npm for OIDC trusted publishing',
      );

      expect(setupNode).toMatchObject({
        uses: 'actions/setup-node@v4',
        with: {
          'node-version': '24.x',
        },
      });
      expect(job?.steps?.indexOf(setupNode!)).toBeLessThan(job?.steps?.indexOf(upgradeNpm!) ?? -1);
    }
  });

  it('tests registry compatibility and contracts before validation and release', async () => {
    const workflow = await readReleaseWorkflow();
    const registryManifest = JSON.parse(
      await readFile(
        path.resolve(import.meta.dirname, '../../onchain-actions-plugins/registry/package.json'),
        'utf8',
      ),
    ) as { scripts?: Record<string, string> };

    const validateJob = workflow.jobs?.validate;
    const validateRegistryTest = validateJob?.steps?.find(
      (step) => step.name === 'Test registry',
    );
    const validateContractBuild = validateJob?.steps?.find(
      (step) => step.name === 'Build contracts',
    );
    const validateContractTest = validateJob?.steps?.find(
      (step) => step.name === 'Test contracts',
    );
    const validateRegistryPrepare = validateJob?.steps?.find(
      (step) => step.name === 'Prepare registry npm publish folder',
    );
    const validateContractsPrepare = validateJob?.steps?.find(
      (step) => step.name === 'Prepare contracts npm publish folder',
    );

    expect(validateRegistryTest).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'registry')",
      run: 'pnpm --filter @emberai/onchain-actions-registry test:ci',
    });
    expect(validateContractBuild).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'contracts')",
      run: 'pnpm --filter @emberai/onchain-actions-contracts build',
    });
    expect(validateContractTest).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'contracts')",
      run: 'pnpm --filter @emberai/onchain-actions-contracts test:ci',
    });
    expect(validateRegistryPrepare).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'registry')",
      run: 'node scripts/prepare-npm-publish.mjs --package onchain-actions-plugins/registry/package.json',
    });
    expect(validateContractsPrepare).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'contracts')",
      run: 'node scripts/prepare-npm-publish.mjs --package onchain-actions-plugins/contracts/package.json',
    });

    const releaseJob = workflow.jobs?.release;
    const releaseRegistryTest = releaseJob?.steps?.find(
      (step) => step.name === 'Test registry',
    );
    const releaseContractBuild = releaseJob?.steps?.find(
      (step) => step.name === 'Build contracts',
    );
    const releaseContractTest = releaseJob?.steps?.find(
      (step) => step.name === 'Test contracts',
    );
    const releaseRegistryPrepare = releaseJob?.steps?.find(
      (step) => step.name === 'Prepare registry npm publish folder',
    );
    const releaseContractsPrepare = releaseJob?.steps?.find(
      (step) => step.name === 'Prepare contracts npm publish folder',
    );

    expect(releaseRegistryTest).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'registry')",
      run: 'pnpm --filter @emberai/onchain-actions-registry test:ci',
    });
    expect(releaseContractBuild).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'contracts')",
      run: 'pnpm --filter @emberai/onchain-actions-contracts build',
    });
    expect(releaseContractTest).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'contracts')",
      run: 'pnpm --filter @emberai/onchain-actions-contracts test:ci',
    });
    expect(releaseRegistryPrepare).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'registry')",
      run: 'node scripts/prepare-npm-publish.mjs --package onchain-actions-plugins/registry/package.json',
    });
    expect(releaseContractsPrepare).toMatchObject({
      if: "contains(fromJson(needs.prepare.outputs.selected), 'contracts')",
      run: 'node scripts/prepare-npm-publish.mjs --package onchain-actions-plugins/contracts/package.json',
    });

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

  it('prepares the contracts publish directory before semantic-release reads it', async () => {
    const configPath = path.resolve(
      import.meta.dirname,
      '../../onchain-actions-plugins/contracts/release.config.mjs',
    );
    const configModule = (await import(`${pathToFileURL(configPath).href}?test=${Date.now()}`)) as {
      default: {
        plugins: Array<[string, Record<string, unknown>]>;
      };
    };
    const plugins = configModule.default.plugins;
    const prepareIndex = plugins.findIndex(([name]) => name === '@semantic-release/exec');
    const npmIndex = plugins.findIndex(([name]) => name === '@semantic-release/npm');

    expect(prepareIndex).toBeGreaterThan(-1);
    expect(prepareIndex).toBeLessThan(npmIndex);
    expect(plugins[prepareIndex]?.[1]).toMatchObject({
      prepareCmd:
        'node ../../scripts/prepare-npm-publish.mjs --package onchain-actions-plugins/contracts/package.json',
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

  it('publishes one coordinated local-package release graph', async () => {
    const workflow = await readReleaseWorkflow();
    const releaseJob = workflow.jobs?.release;
    const releaseStep = releaseJob?.steps?.find(
      (step) => step.name === 'Run multi-semantic-release',
    );

    expect(releaseJob?.strategy).toBeUndefined();
    expect(releaseJob?.name).toBe('Publish release packages');
    expect(JSON.stringify(releaseJob)).not.toContain('matrix.package');
    expect(releaseStep?.run).toBe(
      'pnpm release -- --packages "agent-node,registry,contracts" --summary-file release-summary.json',
    );
  });

  it('dry-runs the same coordinated local-package release graph', async () => {
    const workflow = await readReleaseWorkflow();
    const validateJob = workflow.jobs?.validate;
    const validateStep = validateJob?.steps?.find(
      (step) => step.name === 'Validate release (dry-run)',
    );

    expect(validateJob?.strategy).toBeUndefined();
    expect(validateStep?.run).toBe(
      'pnpm release -- --dry-run --packages "agent-node,registry,contracts" --summary-file release-summary-dry-run.json',
    );
  });
});
