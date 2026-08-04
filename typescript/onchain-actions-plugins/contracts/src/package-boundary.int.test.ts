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

import {
  EVM_ADDRESS_CHECKSUMMED,
  EVM_ADDRESS_INVALID_CHECKSUM,
  EVM_ADDRESS_LOWERCASE,
  SOLANA_ADDRESS_MIXED_CASE,
} from './core/canonicalTokenIdentity.testFixtures.js';

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
      // Fixture-validity proof: a case-transform pair is only a meaningful test
      // of Solana case-sensitivity if both members genuinely decode to a
      // 32-byte key -- lowercasing a Base58 string does not, in general,
      // preserve decoded byte length. Mirrors decodedBase58ByteLength from
      // ./core/canonicalTokenIdentity.testFixtures.ts.
      const base58ByteLength = (value) => {
        const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let numericValue = 0n;
        for (const character of value) {
          const digitValue = alphabet.indexOf(character);
          if (digitValue === -1) return null;
          numericValue = numericValue * 58n + BigInt(digitValue);
        }
        let leadingZeroBytes = 0;
        for (const character of value) { if (character !== "1") break; leadingZeroBytes++; }
        let magnitudeByteCount = 0;
        while (numericValue > 0n) { numericValue /= 256n; magnitudeByteCount++; }
        return leadingZeroBytes + magnitudeByteCount;
      };
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
      const expiredAvailable = {
        status: "available",
        subject: "token:arb",
        value: { price_usd: "1.25" },
        freshness: {
          ...prematureStale.freshness,
          received_at: "2026-07-30T13:00:00.000Z",
        },
        provenance: prematureStale.provenance,
      };
      if (genericResult.safeParse(expiredAvailable).success) process.exit(13);
      if (genericEnvelope.safeParse({
        schema_version: "1",
        snapshot_id: "expired-generic-snapshot",
        quote_currency: "USD",
        completeness: "complete",
        items: [expiredAvailable],
      }).success) process.exit(14);
      const token = {
        chainId: "42161",
        address: "0x0000000000000000000000000000000000000001",
      };
      const tokenAvailable = { ...expiredAvailable, subject: token };
      if (plugins.TokenPriceReadResultV1Schema.safeParse(tokenAvailable).success)
        process.exit(15);
      if (endpoints.TokenMarketSnapshotResultV1Schema.safeParse(tokenAvailable).success)
        process.exit(16);
      if (endpoints.TokenMarketSnapshotEnvelopeV1Schema.safeParse({
        schema_version: "1",
        snapshot_id: "expired-market-snapshot",
        quote_currency: "USD",
        completeness: "complete",
        requested_tokens: [token],
        items: [tokenAvailable],
      }).success) process.exit(17);
      if (evidence.FreshnessEvidenceV1Schema.safeParse({
        observed_at: "2026-07-30T12:00:00.000Z",
        received_at: "2026-07-30T12:00:01.000Z",
        fresh_until: "2026-07-30T12:05:00.000Z",
        observed_at_source: "receipt_fallback",
      }).success) process.exit(18);
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
      if (typeof core.classifyTokenChainFamily !== "function" ||
          typeof core.normalizeCanonicalTokenIdentifier !== "function" ||
          typeof core.canonicalTokenIdentityKey !== "function" ||
          typeof core.tokenIdentitiesAreEquivalent !== "function") process.exit(20);
      if (core.classifyTokenChainFamily("42161") !== "evm") process.exit(21);
      if (core.classifyTokenChainFamily("solana") !== "solana") process.exit(22);
      if (!core.tokenIdentitiesAreEquivalent(
        { chainId: "42161", address: "${EVM_ADDRESS_LOWERCASE}" },
        { chainId: "42161", address: "${EVM_ADDRESS_CHECKSUMMED}" },
      )) process.exit(23);
      if (core.tokenIdentitiesAreEquivalent(
        { chainId: "solana", address: "MixedCaseAddress" },
        { chainId: "solana", address: "mixedcaseaddress" },
      )) process.exit(24);
      // EIP-55 is the sole canonical evm representation: normalizing a
      // lowercase address returns the checksummed form, and an
      // already-checksummed address round-trips unchanged.
      if (core.normalizeCanonicalTokenIdentifier(
        { chainId: "42161", address: "${EVM_ADDRESS_LOWERCASE}" },
      ).address !== "${EVM_ADDRESS_CHECKSUMMED}") process.exit(80);
      if (core.normalizeCanonicalTokenIdentifier(
        { chainId: "42161", address: "${EVM_ADDRESS_CHECKSUMMED}" },
      ).address !== "${EVM_ADDRESS_CHECKSUMMED}") process.exit(81);
      // An invalid mixed-case checksum is rejected, not silently corrected
      // or lowercased.
      let evmChecksumThrew = false;
      try {
        core.normalizeCanonicalTokenIdentifier(
          { chainId: "42161", address: "${EVM_ADDRESS_INVALID_CHECKSUM}" },
        );
      } catch {
        evmChecksumThrew = true;
      }
      if (!evmChecksumThrew) process.exit(82);
      // Because both forms normalize to the same canonical (EIP-55) key, a
      // request naming the lowercase and checksummed spelling of the same
      // address is a true duplicate and must be rejected -- unlike the
      // Solana case below, where case-distinct addresses are genuinely
      // distinct tokens.
      if (endpoints.TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: "1",
        tokens: [
          { chainId: "42161", address: "${EVM_ADDRESS_LOWERCASE}" },
          { chainId: "42161", address: "${EVM_ADDRESS_CHECKSUMMED}" },
        ],
      }).success) process.exit(83);
      const solanaTokenMixedCase = { chainId: "solana", address: "${SOLANA_ADDRESS_MIXED_CASE}" };
      const solanaTokenLowerCased = { chainId: "solana", address: solanaTokenMixedCase.address.toLowerCase() };
      if (base58ByteLength(solanaTokenMixedCase.address) !== 32) process.exit(60);
      if (base58ByteLength(solanaTokenLowerCased.address) !== 32) process.exit(61);
      if (!endpoints.TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: "1",
        tokens: [solanaTokenMixedCase, solanaTokenLowerCased],
      }).success) process.exit(25);
      if (endpoints.TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: "1",
        tokens: [solanaTokenMixedCase, solanaTokenMixedCase],
      }).success) process.exit(26);
      if (core.classifyTokenChainFamily("EIP155:42161") !== "opaque") process.exit(40);
      if (core.classifyTokenChainFamily("SOLANA:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") !== "opaque")
        process.exit(41);
      if (core.tokenIdentitiesAreEquivalent(
        { chainId: "EIP155:42161", address: "0xABCDEF" },
        { chainId: "EIP155:42161", address: "0xabcdef" },
      )) process.exit(42);
      const collisionKeyA = core.canonicalTokenIdentityKey({ chainId: "eip155:1", address: "${EVM_ADDRESS_LOWERCASE}" });
      const collisionKeyB = core.canonicalTokenIdentityKey({ chainId: "eip155", address: "1:${EVM_ADDRESS_LOWERCASE}" });
      if (collisionKeyA === collisionKeyB) process.exit(43);
      let bypassThrew = false;
      try {
        core.canonicalTokenIdentityKey({ chainId: "", address: "0xabc" });
      } catch {
        bypassThrew = true;
      }
      if (!bypassThrew) process.exit(44);

      // Different chain ids with the same address must remain distinct identities.
      if (core.tokenIdentitiesAreEquivalent(
        { chainId: "42161", address: "${EVM_ADDRESS_LOWERCASE}" },
        { chainId: "1", address: "${EVM_ADDRESS_LOWERCASE}" },
      )) process.exit(45);

      // An opaque (non-EVM, non-Solana) chain family must never silently collapse case.
      if (core.tokenIdentitiesAreEquivalent(
        { chainId: "unknown-chain-family", address: "Case-Sensitive-ID" },
        { chainId: "unknown-chain-family", address: "case-sensitive-id" },
      )) process.exit(46);
      if (core.normalizeCanonicalTokenIdentifier(
        { chainId: "unknown-chain-family", address: "Case-Sensitive-ID" },
      ).address !== "Case-Sensitive-ID") process.exit(47);

      // Untrimmed input must be rejected, not silently trimmed into a valid key.
      let untrimmedThrew = false;
      try {
        core.canonicalTokenIdentityKey({ chainId: " 42161 ", address: "0xabcdef" });
      } catch {
        untrimmedThrew = true;
      }
      if (!untrimmedThrew) process.exit(48);

      // classifyTokenChainFamily is itself a public identity operation: it must
      // reject whitespace-padded/empty input instead of silently trimming it.
      let classifyUntrimmedThrew = false;
      try {
        core.classifyTokenChainFamily(" 42161 ");
      } catch {
        classifyUntrimmedThrew = true;
      }
      if (!classifyUntrimmedThrew) process.exit(70);

      // A malformed CAIP-2 reference (embedded colon, whitespace, or over 32
      // characters) stays opaque rather than deriving evm/solana semantics.
      if (core.classifyTokenChainFamily("eip155:1:extra") !== "opaque") process.exit(71);
      if (core.classifyTokenChainFamily("eip155:has space") !== "opaque") process.exit(72);
      if (core.classifyTokenChainFamily("solana:" + "a".repeat(33)) !== "opaque") process.exit(73);

      // Envelope ordering + cardinality, exercised with case-sensitive Solana results
      // to prove the packed artifact enforces both invariants together.
      const freshFreshness = prematureStale.freshness; // received_at <= fresh_until: valid for "available"
      const solanaResult = (address) => ({
        status: "available",
        subject: { chainId: "solana", address },
        value: { price_usd: "1.00" },
        freshness: freshFreshness,
        provenance: prematureStale.provenance,
      });
      const solanaAddressUpper = "${SOLANA_ADDRESS_MIXED_CASE}";
      const solanaAddressLower = solanaAddressUpper.toLowerCase();
      const wellOrderedEnvelope = {
        schema_version: "1",
        snapshot_id: "well-ordered-solana-snapshot",
        quote_currency: "USD",
        completeness: "complete",
        requested_tokens: [
          { chainId: "solana", address: solanaAddressUpper },
          { chainId: "solana", address: solanaAddressLower },
        ],
        items: [solanaResult(solanaAddressUpper), solanaResult(solanaAddressLower)],
      };
      if (!endpoints.TokenMarketSnapshotEnvelopeV1Schema.safeParse(wellOrderedEnvelope).success)
        process.exit(50);
      if (endpoints.TokenMarketSnapshotEnvelopeV1Schema.safeParse({
        ...wellOrderedEnvelope,
        snapshot_id: "swapped-solana-snapshot",
        items: [solanaResult(solanaAddressLower), solanaResult(solanaAddressUpper)],
      }).success) process.exit(51);
      if (endpoints.TokenMarketSnapshotEnvelopeV1Schema.safeParse({
        ...wellOrderedEnvelope,
        snapshot_id: "cardinality-mismatch-snapshot",
        items: [solanaResult(solanaAddressUpper)],
      }).success) process.exit(52);

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
      if (typeof core.classifyTokenChainFamily !== "function") process.exit(30);
      // Fixture-validity proof: mirrors decodedBase58ByteLength from
      // ./core/canonicalTokenIdentity.testFixtures.ts -- see the ESM probe above.
      const cjsBase58ByteLength = (value) => {
        const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let numericValue = 0n;
        for (const character of value) {
          const digitValue = alphabet.indexOf(character);
          if (digitValue === -1) return null;
          numericValue = numericValue * 58n + BigInt(digitValue);
        }
        let leadingZeroBytes = 0;
        for (const character of value) { if (character !== "1") break; leadingZeroBytes++; }
        let magnitudeByteCount = 0;
        while (numericValue > 0n) { numericValue /= 256n; magnitudeByteCount++; }
        return leadingZeroBytes + magnitudeByteCount;
      };

      // EVM: case variants on the same chain compare equal, and both
      // normalize to the deterministic EIP-55 checksum form.
      if (core.classifyTokenChainFamily("42161") !== "evm") process.exit(31);
      if (!core.tokenIdentitiesAreEquivalent(
        { chainId: "42161", address: "${EVM_ADDRESS_LOWERCASE}" },
        { chainId: "42161", address: "${EVM_ADDRESS_CHECKSUMMED}" },
      )) process.exit(32);
      if (core.normalizeCanonicalTokenIdentifier(
        { chainId: "42161", address: "${EVM_ADDRESS_LOWERCASE}" },
      ).address !== "${EVM_ADDRESS_CHECKSUMMED}") process.exit(80);
      let cjsEvmChecksumThrew = false;
      try {
        core.normalizeCanonicalTokenIdentifier(
          { chainId: "42161", address: "${EVM_ADDRESS_INVALID_CHECKSUM}" },
        );
      } catch {
        cjsEvmChecksumThrew = true;
      }
      if (!cjsEvmChecksumThrew) process.exit(81);

      // Solana: identical addresses equal, case-distinct addresses remain distinct.
      if (core.classifyTokenChainFamily("solana") !== "solana") process.exit(33);
      if (core.tokenIdentitiesAreEquivalent(
        { chainId: "solana", address: "MixedCaseAddress" },
        { chainId: "solana", address: "mixedcaseaddress" },
      )) process.exit(34);
      if (!core.tokenIdentitiesAreEquivalent(
        { chainId: "solana", address: "MixedCaseAddress" },
        { chainId: "solana", address: "MixedCaseAddress" },
      )) process.exit(35);

      // Different chain ids remain distinct even with the same address.
      if (core.tokenIdentitiesAreEquivalent(
        { chainId: "42161", address: "${EVM_ADDRESS_LOWERCASE}" },
        { chainId: "1", address: "${EVM_ADDRESS_LOWERCASE}" },
      )) process.exit(36);

      // Opaque/unknown chain families never silently collapse case.
      if (core.tokenIdentitiesAreEquivalent(
        { chainId: "unknown-chain-family", address: "Case-Sensitive-ID" },
        { chainId: "unknown-chain-family", address: "case-sensitive-id" },
      )) process.exit(37);

      // Uppercase pseudo-CAIP-2 ids are invalid CAIP-2 and stay opaque exact-case.
      if (core.classifyTokenChainFamily("EIP155:42161") !== "opaque") process.exit(38);
      if (core.tokenIdentitiesAreEquivalent(
        { chainId: "EIP155:42161", address: "0xABCDEF" },
        { chainId: "EIP155:42161", address: "0xabcdef" },
      )) process.exit(39);

      // Unambiguous (chainId, address) key encoding: a shared colon must not collide.
      const cjsCollisionKeyA = core.canonicalTokenIdentityKey({ chainId: "eip155:1", address: "${EVM_ADDRESS_LOWERCASE}" });
      const cjsCollisionKeyB = core.canonicalTokenIdentityKey({ chainId: "eip155", address: "1:${EVM_ADDRESS_LOWERCASE}" });
      if (cjsCollisionKeyA === cjsCollisionKeyB) process.exit(40);

      // Public schema validation cannot be bypassed with empty, all-whitespace, or
      // leading/trailing-whitespace-padded input.
      let cjsBypassThrew = false;
      try {
        core.canonicalTokenIdentityKey({ chainId: "   ", address: "0xabc" });
      } catch {
        cjsBypassThrew = true;
      }
      if (!cjsBypassThrew) process.exit(41);
      let cjsUntrimmedThrew = false;
      try {
        core.canonicalTokenIdentityKey({ chainId: " 42161 ", address: "0xabcdef" });
      } catch {
        cjsUntrimmedThrew = true;
      }
      if (!cjsUntrimmedThrew) process.exit(42);

      // classifyTokenChainFamily rejects whitespace-padded/empty input instead
      // of silently trimming it, mirroring the ESM matrix.
      let cjsClassifyUntrimmedThrew = false;
      try {
        core.classifyTokenChainFamily(" 42161 ");
      } catch {
        cjsClassifyUntrimmedThrew = true;
      }
      if (!cjsClassifyUntrimmedThrew) process.exit(70);

      // A malformed CAIP-2 reference stays opaque rather than deriving evm/solana semantics.
      if (core.classifyTokenChainFamily("eip155:1:extra") !== "opaque") process.exit(71);
      if (core.classifyTokenChainFamily("eip155:has space") !== "opaque") process.exit(72);
      if (core.classifyTokenChainFamily("solana:" + "a".repeat(33)) !== "opaque") process.exit(73);

      // Request uniqueness accepts case-distinct Solana identities, rejects true duplicates.
      const cjsSolanaMixedCase = { chainId: "solana", address: "${SOLANA_ADDRESS_MIXED_CASE}" };
      const cjsSolanaLowerCased = { chainId: "solana", address: cjsSolanaMixedCase.address.toLowerCase() };
      if (cjsBase58ByteLength(cjsSolanaMixedCase.address) !== 32) process.exit(60);
      if (cjsBase58ByteLength(cjsSolanaLowerCased.address) !== 32) process.exit(61);
      if (!endpoints.TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: "1",
        tokens: [cjsSolanaMixedCase, cjsSolanaLowerCased],
      }).success) process.exit(43);
      if (endpoints.TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: "1",
        tokens: [cjsSolanaMixedCase, cjsSolanaMixedCase],
      }).success) process.exit(44);

      // Unlike Solana, an evm lowercase/checksummed spelling pair is the same
      // canonical (EIP-55) identity, so the request schema must reject it as
      // a true duplicate.
      if (endpoints.TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: "1",
        tokens: [
          { chainId: "42161", address: "${EVM_ADDRESS_LOWERCASE}" },
          { chainId: "42161", address: "${EVM_ADDRESS_CHECKSUMMED}" },
        ],
      }).success) process.exit(82);

      // Envelope ordering + cardinality, mirroring the ESM matrix.
      const cjsFreshness = {
        observed_at: "2026-07-30T12:00:00.000Z",
        received_at: "2026-07-30T12:00:01.000Z",
        fresh_until: "2026-07-30T12:05:00.000Z",
        observed_at_source: "provider",
      };
      const cjsProvenance = {
        provider_id: "coingecko",
        capability: "token_usd_price",
        canonical_subject: "token:arb",
        source_class: "provider_api",
      };
      const cjsSolanaResult = (address) => ({
        status: "available",
        subject: { chainId: "solana", address },
        value: { price_usd: "1.00" },
        freshness: cjsFreshness,
        provenance: cjsProvenance,
      });
      const cjsWellOrderedEnvelope = {
        schema_version: "1",
        snapshot_id: "cjs-well-ordered-solana-snapshot",
        quote_currency: "USD",
        completeness: "complete",
        requested_tokens: [cjsSolanaMixedCase, cjsSolanaLowerCased],
        items: [
          cjsSolanaResult(cjsSolanaMixedCase.address),
          cjsSolanaResult(cjsSolanaLowerCased.address),
        ],
      };
      if (!endpoints.TokenMarketSnapshotEnvelopeV1Schema.safeParse(cjsWellOrderedEnvelope).success)
        process.exit(45);
      if (endpoints.TokenMarketSnapshotEnvelopeV1Schema.safeParse({
        ...cjsWellOrderedEnvelope,
        snapshot_id: "cjs-swapped-solana-snapshot",
        items: [
          cjsSolanaResult(cjsSolanaLowerCased.address),
          cjsSolanaResult(cjsSolanaMixedCase.address),
        ],
      }).success) process.exit(46);
      if (endpoints.TokenMarketSnapshotEnvelopeV1Schema.safeParse({
        ...cjsWellOrderedEnvelope,
        snapshot_id: "cjs-cardinality-mismatch-snapshot",
        items: [cjsSolanaResult(cjsSolanaMixedCase.address)],
      }).success) process.exit(47);
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
