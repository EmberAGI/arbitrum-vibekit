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
