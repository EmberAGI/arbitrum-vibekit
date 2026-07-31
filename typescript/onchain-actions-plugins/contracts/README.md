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
