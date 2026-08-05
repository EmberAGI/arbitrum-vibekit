# Onchain Action Contracts

This context names the neutral concepts shared by onchain-action registries, plugins, hosts, and data-producing services without assigning their implementation to any one consumer.

## Language

**Contract kernel**:
The shared, dependency-neutral meaning that onchain-action producers and consumers agree to validate.
_Avoid_: Registry package, server DTOs, shared utilities

**Registry runtime**:
The behavior that discovers, configures, and exposes action and query plugins.
_Avoid_: Contract kernel, provider catalog

**Host capability**:
A function a portable plugin may request and its host must supply without making the plugin own that behavior.
_Avoid_: Server service, registry implementation

**Provider observation**:
One externally sourced value together with the source identity and the time the source observed it.
_Avoid_: Snapshot, receipt, current value

**Evidence**:
The provenance, freshness, warning, and result-state material that lets a consumer judge an external value.
_Avoid_: Metadata, diagnostics

**Snapshot**:
A versioned set of requested item results with derived completeness and a stable batch identity.
_Avoid_: Provider observation, cache entry

**Canonical token identity**:
The one chain-aware equivalence and keying rule for a token identifier, owned by the contract kernel and reused by every request-uniqueness, result-order, and host-capability check. For the `evm` family, ingress accepts either legacy all-lowercase or already-checksummed EIP-55 input and rejects an invalid mixed-case checksum; the canonical identity emitted and retained after ingress is always the EIP-55 checksum form, never lowercase. Domain Modules never keep comparing arbitrary case variants after canonicalization: equality, keying, and downstream comparison are exact over the canonical identity, not a second case-insensitive pass.
_Avoid_: Endpoint-local dedupe key, ad hoc string comparison, lowercase-keyed canonical convention

**Chain address family**:
The `evm`, `solana`, or `opaque` classification a chain id resolves to, which determines how its address is normalized to its one canonical identity at ingress: `evm` validates and canonicalizes to the deterministic EIP-55 checksum form, `solana` preserves exact Base58 case, and `opaque` preserves exact case unconditionally. The classification governs ingress normalization, not an ongoing case-insensitive comparison mode.
_Avoid_: Address-shape inference, per-plugin normalizer, case-insensitive comparison after canonicalization
