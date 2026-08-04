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
| Legacy decimal Ember chain id (e.g. `42161`) | `evm` | Case-insensitive; addresses normalize to lowercase. |
| Legacy `solana` literal | `solana` | Case-sensitive; distinct casings are distinct addresses. |
| CAIP-2 `eip155:*` | `evm` | Same as above, derived from the namespace. |
| CAIP-2 `solana:*` | `solana` | Same as above, derived from the namespace. |
| Any other chain id | `opaque` | Case-sensitive; never silently lowercased. |

Request uniqueness, result-order validation, and the `TokenPriceReader` host
capability all delegate to this Interface. Callers must not reimplement
address-case policy locally.
