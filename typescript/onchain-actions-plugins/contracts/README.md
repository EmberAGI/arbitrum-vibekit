# @emberai/onchain-actions-contracts

Neutral, runtime-validatable contracts shared by Ember onchain-action
providers, plugins, endpoints, and registry consumers.

## Install

```bash
pnpm add @emberai/onchain-actions-contracts zod@^3.25.76
```

Zod is a peer dependency. V1 requires Zod 3 so producers and consumers share
one runtime schema instance.

The package exposes four stable public subpaths:

- `@emberai/onchain-actions-contracts/core`
- `@emberai/onchain-actions-contracts/plugins`
- `@emberai/onchain-actions-contracts/endpoints`
- `@emberai/onchain-actions-contracts/external-data`

These subpaths are the supported import surface. The package is dependency-light
and has no registry, provider, network, or protocol runtime.

## Canonical token identity

`@emberai/onchain-actions-contracts/core` exports `CanonicalTokenIdentifierV1Schema`
and a pure chain-aware identity Interface that is the sole authority for token
identity comparison across the package:

```ts
import {
  canonicalTokenIdentityKey,
  classifyTokenChainFamily,
  normalizeCanonicalTokenIdentifier,
  tokenIdentitiesAreEquivalent,
} from '@emberai/onchain-actions-contracts/core';
```

| `chainId` | Family | Identity rule |
| --- | --- | --- |
| Legacy decimal Ember chain id (e.g. `42161`) | `evm` | Case-insensitive; canonicalizes to the deterministic EIP-55 checksum form. |
| Legacy `solana` literal | `solana` | Case-sensitive; distinct casings are distinct addresses. |
| CAIP-2 `eip155:*` | `evm` | Same as above, derived from the namespace. |
| CAIP-2 `solana:*` | `solana` | Same as above, derived from the namespace. |
| Any other chain id | `opaque` | Case-sensitive; never silently lowercased. |

Request uniqueness, result-order validation, and the `TokenPriceReader` host
capability all delegate to this Interface. Callers must not reimplement
address-case policy locally. `TokenPriceReader.readTokenPrices` takes
`CanonicalTokenIdentifierV1` values directly, not raw `TokenIdentifier` input.
`CanonicalTokenIdentifierV1` is a branded (nominal) type, not merely a
structural `{ chainId, address }` shape: a raw object literal does not
satisfy it, however well-formed its fields are. The only way to produce one
is to parse it through `CanonicalTokenIdentifierV1Schema` — directly or via
`normalizeCanonicalTokenIdentifier` — which is what makes this seam
unforgeable rather than a documentation-only convention.

### EIP-55 is the sole canonical evm representation

EIP-55 — not lowercase — is the one canonical evm domain representation.
`CanonicalTokenIdentifierV1Schema` requires a full `0x`-prefixed 20-byte
hexadecimal address, accepts either legacy all-lowercase input or an
already-checksummed EIP-55 address, rejects an invalid mixed-case checksum
outright, and always emits the deterministic EIP-55 checksum form. Every
identity operation in this Interface — normalization, canonical keying,
equality, and token-market request/envelope validation — consumes or derives
that same EIP-55 representation; there is no second, lowercase-keyed
convention anywhere behind it.

```ts
normalizeCanonicalTokenIdentifier({ chainId: '42161', address: '0xabc...' });
// => { chainId: '42161', address: '0xAbC...' } -- the EIP-55 checksum form

normalizeCanonicalTokenIdentifier({ chainId: '42161', address: '0xAbC...bad-checksum' });
// throws -- an invalid mixed-case checksum is rejected, never silently corrected
```

Because a lowercase and an EIP-55-checksummed spelling of the same address
canonicalize to the same key, submitting both in one token-market request is
a true duplicate and is rejected by `TokenMarketSnapshotRequestV1Schema`,
exactly like submitting the same address twice.

Lowercase is valid only as ingress a caller may submit; it is never canonical
output. A provider whose own wire Interface requires lowercase keeps that
projection inside its Adapter and normalizes back to the canonical EIP-55
form before crossing this package's public Interface — contracts, caches,
persistence, evidence, and public responses only ever carry EIP-55.

CAIP-2 matching follows the full CAIP-2 grammar, not just the namespace: a
namespace is syntactically lowercase-only (`EIP155:*`/`SOLANA:*` are invalid
CAIP-2 ids and stay `opaque`, not case-folded into `evm`/`solana`), and a
reference containing a colon, whitespace, or more than 32 characters is
likewise not valid CAIP-2 syntax and stays `opaque` rather than deriving
`evm`/`solana` semantics.

Every function in this Interface — `classifyTokenChainFamily`,
`normalizeCanonicalTokenIdentifier`, `canonicalTokenIdentityKey`, and
`tokenIdentitiesAreEquivalent` — validates its `chainId`/`address` input
through the same non-empty/trimmed invariant before dispatching on it, so
calling any of them directly with an empty, all-whitespace, or
leading/trailing-whitespace value throws instead of silently trimming or
otherwise producing a result.

`canonicalTokenIdentityKey` encodes the `(chainId, address)` pair as a
`JSON.stringify`-escaped tuple rather than delimiter concatenation, since
both a V1 chain id and a CAIP-2 chain id may themselves contain `:` — e.g.
`(eip155:1, 0xab)` and `(eip155, 1:0xab)` would otherwise collide.
