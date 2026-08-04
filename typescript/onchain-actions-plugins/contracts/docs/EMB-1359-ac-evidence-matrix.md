# EMB-1359 — acceptance-criteria evidence matrix

Durable, issue-scoped evidence artifact for [EMB-1359](https://linear.app/emberai/issue/EMB-1359/make-canonical-token-identity-chain-aware)
(PR [#677](https://github.com/EmberAGI/arbitrum-vibekit/pull/677)). This
supersedes the aggregate-count/prose mutation claims Agent Review rejected as
unauditable for AC7 and AC19: those two mutations were re-applied and
re-reverted in this cycle with the exact failing/passing test names and
failure output preserved below. The remaining criteria are mapped to their
exact test names and boundary/tier so the whole 22-item acceptance trace is
independently checkable from this one file instead of PR-body narrative
scattered across five Agent Fixes rounds.

Reviewed commit range: `fbcba4b` (round 1) through `e69496c` (round 5, current
`HEAD`) on `agent/emb-1359-make-canonical-token-identity-chain-aware`. This
evidence cycle added only this file — `git diff --stat` against `e69496c` is
empty for every source/test file; the two mutation proofs below were applied
and reverted in-place and left no residual diff.

Package: `typescript/onchain-actions-plugins/contracts`. Module under test:
`src/core/canonicalTokenIdentity.ts`.

## Final-gate evidence for this cycle (HEAD `e69496c`)

| Command | Location | Result |
| --- | --- | --- |
| `pnpm run test:ci` (`tsdown && vitest run`) | `onchain-actions-plugins/contracts` | 9 files / **69 passed**, 0 failed |
| `pnpm run lint` | `onchain-actions-plugins/contracts` | clean |
| `tsc --noEmit --project onchain-actions-plugins/contracts/tsconfig.json` | `typescript/` | clean |
| `pnpm run test:ci` (`tsdown && vitest run`) | `onchain-actions-plugins/registry` | 4 files / **12 passed**, 0 failed |
| `pnpm run test:ci:root` (includes `tests/ci/spec-docs.int.test.ts`) | `typescript/` | 7 files / **36 passed**, 0 failed |

## AC7 — mutation proof: restore unconditional `address.toLowerCase()`

**Mutation applied** to `CanonicalTokenIdentifierV1Schema`'s transform in
`src/core/canonicalTokenIdentity.ts` (family dispatch, `isAddress` strict
checksum gate, and `getAddress` canonicalization all removed):

```ts
.transform((value) => {
  return { chainId: value.chainId, address: value.address.toLowerCase() };
});
```

**RED** — `pnpm run test:ci` (rebuilt + run against the mutated source):

```
Test Files  4 failed | 5 passed (9)
     Tests  18 failed | 51 passed (69)
```

Representative failures (public boundary, unit, and packed):

- `src/core/canonicalTokenIdentity.int.test.ts > ... > rejects an EVM address with an invalid mixed-case checksum instead of silently correcting or lowercasing it` — public boundary (`@emberai/onchain-actions-contracts/core`)
- `src/core/canonicalTokenIdentity.int.test.ts > ... > treats case-distinct Solana Base58 addresses as distinct while identical ones remain equal` — public boundary
- `src/core/canonicalTokenIdentity.unit.test.ts > CanonicalTokenIdentifierV1Schema > normalizes a valid evm address to EIP-55 on direct parse`:
  ```
  AssertionError: expected { chainId: '42161', … } to deeply equal { chainId: '42161', … }
  - "address": "0xAbc000000000000000000000000000000000000F",
  + "address": "0xabc000000000000000000000000000000000000f",
  ```
- `src/external-data/public.int.test.ts > ... > accepts case-distinct Solana token identities as unique while rejecting true duplicates` — request-uniqueness delegation
- `src/package-boundary.int.test.ts > packed @emberai/onchain-actions-contracts > loads every public ESM and CJS entrypoint and rejects internal paths` — packed ESM probe exits with `process.exit(24)`, the assertion `tokenIdentitiesAreEquivalent({chainId:"solana",address:"MixedCaseAddress"}, {chainId:"solana",address:"mixedcaseaddress"})` must be `false`; the mutation is a global unconditional lowercase (not EVM-scoped), so it collapses Solana case at the very first Solana check in the packed matrix, faithfully reproducing the original pre-ADR bug.

**Revert**: `src/core/canonicalTokenIdentity.ts` restored to `HEAD` exactly
(`git diff --stat` empty for the file).

**GREEN** — `pnpm run test:ci` after revert:

```
Test Files  9 passed (9)
     Tests  69 passed (69)
```

## AC19 — mutation proof: bypass checksum validation

AC19 covers two independent failure modes ("reintroduces unconditional EVM
lowercasing as canonical output **or** bypasses checksum validation"). AC7's
mutation above already witnesses the first ("unconditional EVM lowercasing"
is a strict subset of AC7's unconditional-lowercase mutation). This proof
covers the second, distinct mode: keep EIP-55 canonicalization and
family-dispatch intact, but drop the `isAddress(..., { strict: true })`
checksum gate so an invalid mixed-case checksum is silently re-checksummed
by `getAddress` instead of rejected.

**Mutation applied**:

```ts
.transform((value) => {
  if (classifyTokenChainFamily(value.chainId) !== 'evm') {
    return value;
  }
  // no isAddress(strict) gate
  return { chainId: value.chainId, address: getAddress(value.address) };
});
```

**RED** — `pnpm run test:ci`:

```
Test Files  4 failed | 5 passed (9)
     Tests  5 failed | 64 passed (69)
```

This is a materially different failure set from AC7's (5 tests vs. 18, all
EVM-checksum-specific), confirming the two mutations exercise distinct
invariants rather than one proof rubber-stamping both criteria:

- `src/core/canonicalTokenIdentity.int.test.ts > ... > rejects an EVM address with an invalid mixed-case checksum instead of silently correcting or lowercasing it`:
  `AssertionError: expected [Function] to throw an error`
- `src/core/canonicalTokenIdentity.unit.test.ts > normalizeCanonicalTokenIdentifier > rejects an evm address with an invalid mixed-case checksum instead of silently correcting it`:
  `AssertionError: expected [Function] to throw an error`
- `src/core/canonicalTokenIdentity.unit.test.ts > CanonicalTokenIdentifierV1Schema > is the single validation point every public identity operation runs through -- a direct parse rejects the same invalid mixed-case checksum`:
  `expect(result.success).toBe(false)` received `true`
- `src/external-data/public.int.test.ts > ... > validates an ordered token-market snapshot without stale values` — an unrelated fixture token (`chainId: '42161', address: 'token-0'`) now reaches `getAddress` unguarded and throws `InvalidAddressError` instead of failing schema validation cleanly, an uncaught-throw regression the strict gate was also preventing.
- `src/package-boundary.int.test.ts > packed @emberai/onchain-actions-contracts > loads every public ESM and CJS entrypoint and rejects internal paths` — packed ESM probe exits with `process.exit(82)`, the `evmChecksumThrew` assertion (`normalizeCanonicalTokenIdentifier` with `EVM_ADDRESS_INVALID_CHECKSUM` must throw).

**Revert**: `src/core/canonicalTokenIdentity.ts` restored to `HEAD` exactly
(`git diff --stat` empty for the file).

**GREEN** — `pnpm run test:ci` after revert:

```
Test Files  9 passed (9)
     Tests  69 passed (69)
```

## Full AC-to-test map

Tier legend: **public** = `src/core/canonicalTokenIdentity.int.test.ts` or
`src/external-data/public.int.test.ts`, importing only through the package's
own public subpaths (e.g. `@emberai/onchain-actions-contracts/core`);
**unit** = `src/core/canonicalTokenIdentity.unit.test.ts`, same-directory
source import; **packed** = `src/package-boundary.int.test.ts`, `npm pack` →
extract → ESM + CJS consumer probes against the built tarball; **registry** =
`onchain-actions-plugins/registry/src/contracts-compatibility.unit.test.ts`;
**ci-gate** = `typescript/tests/ci/spec-docs.int.test.ts`; **docs** = spec/ADR/
README/glossary prose, not a test.

| AC | Criterion (short) | Test(s) | Tier | Status |
| -- | -- | -- | -- | -- |
| 1 | One public `./core` Interface is the sole identity authority | `package-boundary.int.test.ts` entrypoint-shape checks (`core.classifyTokenChainFamily`, `normalizeCanonicalTokenIdentifier`, `canonicalTokenIdentityKey`, `tokenIdentitiesAreEquivalent` all exported); README §"Chain-aware canonical token identity" | packed + docs | Met (current 69/69 GREEN) |
| 2 | Request/envelope checks delegate; no endpoint-local lowercase remains | `src/endpoints/tokenMarket.ts` `RequestedTokensSchema`/envelope `superRefine` call `canonicalTokenIdentityKey`/`tokenIdentitiesAreEquivalent`; `src/internal/canonical-token.ts` deleted in `fbcba4b` and absent from `HEAD` | source inspection | Met |
| 3 | Public-boundary REDs prove the complete identity matrix | `canonicalTokenIdentity.int.test.ts` — EVM equivalence, Solana case-distinct/-identical, different-chain distinctness, opaque never-collapse cases | public | Met (historical mutation cycle: round 2 lowercase mutation, 9/57 failed at the time; re-verified this cycle via AC7 above) |
| 4 | Request schema accepts case-distinct Solana, rejects true duplicates | `public.int.test.ts > ... > accepts case-distinct Solana token identities as unique while rejecting true duplicates`; packed exit 25/26 | public + packed | Met |
| 5 | Envelope accepts ordered Solana results, rejects swap/mismatch, preserves 1:1 | `public.int.test.ts > ... > accepts correctly ordered case-sensitive Solana results and rejects a swapped order`; packed exit 50/51/52 | public + packed | Met |
| 6 | Packed ESM/CJS exercise the same matrix | `package-boundary.int.test.ts > ... > loads every public ESM and CJS entrypoint and rejects internal paths` (both probes) | packed | Met |
| 7 | Mutation restoring unconditional `address.toLowerCase()` fails public+packed tests | see "AC7 — mutation proof" above | public + unit + packed | **Met — reproduced this cycle** (18/69 failed, reverted, 69/69 GREEN) |
| 8 | External-data spec + README define chain-aware semantics, ownership, unknown-family behavior, enforcement point | `docs/specs/domains/external-data-evidence-contract.spec.html` `evidence-rule-canonical-identity`; `README.md` | docs | Met |
| 9 | Registry compatibility surface single-sourced from contracts | `contracts-compatibility.unit.test.ts > re-exports the contracts schema instance instead of defining a copy`; `> keeps the built compatibility adapter dependent on contracts` | registry | Met (12/12 GREEN this cycle) |
| 10 | No plugin-specific normalizer/provider/cache/network duplicate policy | Module boundary: only `src/core/canonicalTokenIdentity.ts` implements chain-family dispatch/canonicalization; `tokenMarket.ts`/`tokenPrice.ts` only call the shared functions | source inspection | Met |
| 11 | PR stays open; autonomous merge forbidden; operator gate documented | PR #677 `state: OPEN`; PR body "Operator review required before merge" (every round) | PR facts | Met |
| 12 | Only valid lowercase CAIP-2 `eip155:*`/`solana:*` get family semantics; invalid uppercase stays opaque | `unit.test.ts > classifyTokenChainFamily > requires a syntactically valid lowercase CAIP-2 namespace...`; `int.test.ts > ... > treats an invalid uppercase pseudo-CAIP-2 namespace as opaque...`; packed exit 40/41/42 (esm), 38/39 (cjs) | public + unit + packed | Met (historical mutation cycle: round 2 case-fold mutation, 3/57 failed at the time) |
| 13 | Canonical keying uses unambiguous tuple encoding, not colon concatenation | `unit.test.ts > canonicalTokenIdentityKey > encodes the (chainId, address) tuple unambiguously...`; `int.test.ts > ... > keys the (chainId, address) tuple unambiguously...`; packed exit 43 (esm), 40 (cjs) | public + unit + packed | Met (historical mutation cycle: round 2 colon-concatenation mutation, 4/57 failed at the time) |
| 14 | Every public op validates through the schema; direct invalid input can't create a key | `unit.test.ts > canonicalTokenIdentityKey > validates through the public schema...`, `> rejects untrimmed chainId/address...` (×2 describe blocks); `int.test.ts > ... > validates through the public schema...`, `> rejects a direct classifyTokenChainFamily call with whitespace-padded input...`; packed exit 44/48/70 (esm), 41/42/70 (cjs) | public + unit + packed | Met (RED added first for the `.trim()`→`.refine()` fix in round 1, confirmed failing against the old schema, then GREEN — see `.vibecode/.../scratchpad.md` Resolution) |
| 15 | ADR 0002 linked from spec index and in the validator's canonical path list | `typescript/tests/ci/spec-docs.int.test.ts` `specificationPaths` includes `docs/adr/0002-chain-aware-canonical-token-identity.spec.html` (line 11) | ci-gate | Met (36/36 GREEN this cycle, includes 3/3 spec-docs tests) |
| 16 | Full 20-byte EVM address, lowercase-or-EIP-55 ingress, invalid-checksum rejection, EIP-55 output | `unit.test.ts > normalizeCanonicalTokenIdentifier > normalizes a lowercase evm address...`, `> preserves an already-checksummed EIP-55 evm address exactly`, `> rejects an evm address with an invalid mixed-case checksum...`, `> rejects an evm address that is not a full 20-byte hexadecimal address`; packed exit 80/81/82 (esm), 80/81 (cjs) | public + unit + packed | Met |
| 17 | Normalize/key/equality/uniqueness/order/`TokenPriceReader` all consume the same EIP-55 representation | `unit.test.ts > canonicalTokenIdentityKey > combines the chain id and normalized (EIP-55 checksummed) address...`, `tokenIdentitiesAreEquivalent > treats a lowercase and its EIP-55 checksummed form as the same evm identity...`; `plugins/tokenPrice.ts` `TokenPriceReader.readTokenPrices(tokenUids: readonly CanonicalTokenIdentifierV1[])`; packed exit 83 (esm)/82 (cjs) — EVM lowercase/checksummed spelling pair rejected as a true request duplicate | unit + source + packed | Met |
| 18 | Public+packed RED/GREEN prove lowercase→EIP-55, EIP-55 preservation, invalid-checksum rejection, exact equality, zero-address convention, Solana/opaque case preservation | Union of AC16/AC17 tests plus `unit.test.ts > tokenIdentitiesAreEquivalent > preserves the existing V1 zero-address convention...`, `normalizeCanonicalTokenIdentifier > preserves address case for solana identities`, `> preserves address case for opaque chain families` | public + unit + packed | Met |
| 19 | Mutation reintroducing unconditional lowercasing or bypassing checksum validation fails public+packed tests | see "AC19 — mutation proof" above (checksum-bypass variant; AC7 above independently witnesses the unconditional-lowercasing variant) | public + unit + packed | **Met — reproduced this cycle** (5/69 failed on the checksum-bypass variant, reverted, 69/69 GREEN) |
| 20 | ADR 0002 + spec + README + glossary define EIP-55 as sole canonical EVM representation | `docs/adr/0002-...spec.html` Decision section; `external-data-evidence-contract.spec.html` `evidence-rule-canonical-identity`; `README.md` §"EIP-55 is the sole canonical evm representation"; `CONTEXT.md` "Canonical token identity" | docs | Met |
| 21 | `CONTEXT.md` states ingress-vs-canonical distinction; equality exact over canonical identity | `CONTEXT.md` "Canonical token identity" / "Chain address family" glossary entries (lines 31–37) | docs | Met |
| 22 | ADR 0002 + identity rule name graph persistence/projections explicitly | `docs/adr/0002-...spec.html` Decision/Consequences; `external-data-evidence-contract.spec.html` `evidence-rule-canonical-identity` (names "graph persistence and graph projections", "canonical graph properties, keys/indexes, reconciliation evidence, and reads") | docs | Met |

## Notes on historical (round 2) mutation cycles cited above

AC3/AC12/AC13/AC14's cited mutation-cycle counts (9/57, 3/57, 4/57 failed)
are from the round-2 Agent Fixes cycle recorded in the PR body and this
branch's `.vibecode/agent-emb-1359-make-canonical-token-identity-chain-aware/scratchpad.md`;
they were not independently re-run in this cycle because Agent Review did not
flag them as unauditable — only AC7 and AC19 were. The tests naming these
criteria are still exercised by the current `69/69` GREEN run recorded above,
so their current-tree pass/fail status is directly verified even though the
historical RED excerpt itself is cited rather than reproduced.
