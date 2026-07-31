import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '../..');

let temporaryRoot: string;
let consumerRoot: string;
let packedFiles: Array<{ path: string }>;

beforeAll(async () => {
  temporaryRoot = await mkdtemp(path.join(tmpdir(), 'onchain-actions-contracts-pack-'));
  const packDirectory = path.join(temporaryRoot, 'pack');
  const extractDirectory = path.join(temporaryRoot, 'extract');
  consumerRoot = path.join(temporaryRoot, 'consumer');
  const packageScope = path.join(consumerRoot, 'node_modules/@emberai');

  await Promise.all([
    mkdir(packDirectory, { recursive: true }),
    mkdir(extractDirectory, { recursive: true }),
    mkdir(packageScope, { recursive: true }),
  ]);

  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--json', '--pack-destination', packDirectory],
    { cwd: packageRoot },
  );
  const packResult = JSON.parse(stdout) as Array<{
    filename: string;
    files: Array<{ path: string }>;
  }>;
  const [packed] = packResult;

  if (!packed) {
    throw new Error('npm pack returned no package');
  }

  packedFiles = packed.files;
  const tarballPath = path.join(packDirectory, packed.filename);

  await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractDirectory]);
  await rename(
    path.join(extractDirectory, 'package'),
    path.join(packageScope, 'onchain-actions-contracts'),
  );
  await symlink(
    await realpath(path.join(packageRoot, 'node_modules/zod')),
    path.join(consumerRoot, 'node_modules/zod'),
    'dir',
  );
  await writeFile(
    path.join(consumerRoot, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
}, 30_000);

afterAll(async () => {
  if (temporaryRoot) {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

describe('packed @emberai/onchain-actions-contracts', () => {
  it('publishes only supported artifacts for all four subpaths', () => {
    const paths = packedFiles.map((file) => file.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        'dist/core/index.mjs',
        'dist/core/index.cjs',
        'dist/core/index.d.mts',
        'dist/core/index.d.cts',
        'dist/plugins/index.mjs',
        'dist/endpoints/index.mjs',
        'dist/external-data/index.mjs',
        'package.json',
        'README.md',
      ]),
    );
    expect(paths.some((filePath) => filePath.startsWith('src/'))).toBe(false);
    expect(paths.some((filePath) => filePath.endsWith('.tsbuildinfo'))).toBe(false);
  });

  it('loads every public ESM and CJS entrypoint and rejects internal paths', async () => {
    const esmProbe = `
      const core = await import("@emberai/onchain-actions-contracts/core");
      const plugins = await import("@emberai/onchain-actions-contracts/plugins");
      const endpoints = await import("@emberai/onchain-actions-contracts/endpoints");
      const evidence = await import("@emberai/onchain-actions-contracts/external-data");
      if (!core.TokenIdentifierSchema || !plugins.TokenPriceReadResultV1Schema ||
          !endpoints.TokenMarketSnapshotEnvelopeV1Schema ||
          !evidence.FreshnessEvidenceV1Schema) process.exit(2);
      const { z } = await import("zod");
      const genericResult = evidence.createDataResultV1Schema(
        z.string().min(1),
        z.object({ price_usd: z.string() }).strict(),
      );
      const prematureStale = {
        status: "stale",
        subject: "token:arb",
        reason: "stale_observation",
        last_known_value: { price_usd: "1.10" },
        freshness: {
          observed_at: "2026-07-30T12:00:00.000Z",
          received_at: "2026-07-30T12:00:01.000Z",
          fresh_until: "2026-07-30T12:05:00.000Z",
          observed_at_source: "provider",
        },
        provenance: {
          provider_id: "coingecko",
          capability: "token_usd_price",
          canonical_subject: "token:arb",
          source_class: "provider_api",
        },
      };
      if (genericResult.safeParse(prematureStale).success) process.exit(11);
      const genericEnvelope = evidence.createSnapshotEnvelopeV1Schema(
        z.string().min(1),
        z.object({ price_usd: z.string() }).strict(),
      );
      if (genericEnvelope.safeParse({
        schema_version: "1",
        snapshot_id: "premature-stale-snapshot",
        quote_currency: "USD",
        completeness: "unavailable",
        items: [prematureStale],
      }).success) process.exit(12);
      try {
        await import("@emberai/onchain-actions-contracts/dist/internal/fresh-data.js");
        process.exit(3);
      } catch (error) {
        if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
      }
    `;
    const cjsProbe = `
      const core = require("@emberai/onchain-actions-contracts/core");
      const plugins = require("@emberai/onchain-actions-contracts/plugins");
      const endpoints = require("@emberai/onchain-actions-contracts/endpoints");
      const evidence = require("@emberai/onchain-actions-contracts/external-data");
      if (!core.TokenIdentifierSchema || !plugins.TokenPriceReadResultV1Schema ||
          !endpoints.TokenMarketSnapshotEnvelopeV1Schema ||
          !evidence.FreshnessEvidenceV1Schema) process.exit(2);
    `;

    await expect(
      execFileAsync(process.execPath, ['--input-type=module', '-e', esmProbe], {
        cwd: consumerRoot,
      }),
    ).resolves.toMatchObject({ stderr: '' });
    await expect(
      execFileAsync(process.execPath, ['-e', cjsProbe], {
        cwd: consumerRoot,
      }),
    ).resolves.toMatchObject({ stderr: '' });
  });

  it('type-checks a plugin with an injected TokenPriceReader from the tarball', async () => {
    const consumerSource = `
      import { TokenIdentifierSchema } from "@emberai/onchain-actions-contracts/core";
      import {
        type TokenPriceReader,
        TokenPriceReadResultV1Schema,
      } from "@emberai/onchain-actions-contracts/plugins";
      import { TokenMarketSnapshotRequestV1Schema } from "@emberai/onchain-actions-contracts/endpoints";
      import { FreshnessEvidenceV1Schema } from "@emberai/onchain-actions-contracts/external-data";

      const reader: TokenPriceReader = {
        async readTokenPrices(tokens) {
          return tokens.map((subject) => ({
            status: "not_found" as const,
            subject,
            reason: "not_found" as const,
          }));
        },
      };

      void reader;
      void TokenIdentifierSchema;
      void TokenPriceReadResultV1Schema;
      void TokenMarketSnapshotRequestV1Schema;
      void FreshnessEvidenceV1Schema;
    `;
    const sourcePath = path.join(consumerRoot, 'consumer.ts');

    await writeFile(sourcePath, consumerSource);
    await expect(
      execFileAsync(
        path.join(workspaceRoot, 'node_modules/.bin/tsc'),
        [
          '--noEmit',
          '--strict',
          '--skipLibCheck',
          '--target',
          'ES2022',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          sourcePath,
        ],
        { cwd: consumerRoot },
      ),
    ).resolves.toMatchObject({ stderr: '' });

    const packedPackageJson = JSON.parse(
      await readFile(
        path.join(consumerRoot, 'node_modules/@emberai/onchain-actions-contracts/package.json'),
        'utf8',
      ),
    ) as { peerDependencies?: Record<string, string> };

    expect(packedPackageJson.peerDependencies).toEqual({
      zod: '^3.25.76',
    });
  });
});
