import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
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
let packedFiles: string[];

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

  await execFileAsync('npm', ['pack', '--json', '--pack-destination', packDirectory], {
    cwd: packageRoot,
  });
  const [tarballFilename, ...extraTarballs] = (await readdir(packDirectory)).filter((filename) =>
    filename.endsWith('.tgz'),
  );

  if (!tarballFilename || extraTarballs.length > 0) {
    throw new Error('npm pack did not produce exactly one tarball');
  }

  const tarballPath = path.join(packDirectory, tarballFilename);

  await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractDirectory]);
  packedFiles = await readdir(path.join(extractDirectory, 'package'), { recursive: true });
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
    expect(packedFiles).toEqual(
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
    expect(packedFiles.some((filePath) => filePath.startsWith('src/'))).toBe(false);
    expect(packedFiles.some((filePath) => filePath.endsWith('.tsbuildinfo'))).toBe(false);
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
      const emptyToken = { chainId: "", address: "" };
      if (endpoints.TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: "1",
        tokens: [emptyToken],
      }).success) process.exit(4);
      if (plugins.TokenPriceReadResultV1Schema.safeParse({
        status: "not_found",
        subject: emptyToken,
        reason: "not_found",
      }).success) process.exit(5);
      const token = {
        chainId: "42161",
        address: "0x0000000000000000000000000000000000000001",
      };
      const expiredFreshness = {
        observed_at: "2026-07-30T12:00:00.000Z",
        received_at: "2026-07-30T13:00:00.000Z",
        fresh_until: "2026-07-30T12:05:00.000Z",
        observed_at_source: "provider",
      };
      const provenance = {
        provider_id: "coingecko",
        capability: "token_usd_price",
        canonical_subject: "eip155:42161/erc20:0x0000000000000000000000000000000000000001",
        source_class: "provider_api",
      };
      const tokenAvailable = {
        status: "available",
        subject: token,
        value: { price_usd: "1.25" },
        freshness: expiredFreshness,
        provenance,
      };
      const genericResult = evidence.createDataResultV1Schema(
        (await import("zod")).z.string(),
        (await import("zod")).z.object({ price_usd: (await import("zod")).z.string() }).strict(),
      );
      if (genericResult.safeParse({ ...tokenAvailable, subject: "token:arb" }).success)
        process.exit(6);
      if (plugins.TokenPriceReadResultV1Schema.safeParse(tokenAvailable).success)
        process.exit(7);
      if (endpoints.TokenMarketSnapshotResultV1Schema.safeParse(tokenAvailable).success)
        process.exit(8);
      if (evidence.FreshnessEvidenceV1Schema.safeParse({
        ...expiredFreshness,
        fresh_until: "2026-07-30T13:05:00.000Z",
        observed_at_source: "receipt_fallback",
      }).success) process.exit(9);
      if (endpoints.TokenMarketSnapshotEnvelopeV1Schema.safeParse({
        schema_version: "1",
        snapshot_id: "expired-packed-snapshot",
        quote_currency: "USD",
        completeness: "complete",
        requested_tokens: [token],
        items: [tokenAvailable],
      }).success) process.exit(10);
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
