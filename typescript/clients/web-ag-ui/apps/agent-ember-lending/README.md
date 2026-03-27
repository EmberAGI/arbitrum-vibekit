# agent-ember-lending

Thin `web-ag-ui` host app for the Ember lending Pi agent.

This package owns only the local Pi runtime bootstrap, AG-UI HTTP transport, and process wiring. The closed-source Ember lending behavior is loaded at runtime through `EMBER_LENDING_RUNTIME_MODULE`, which should resolve to a privately distributed package such as `@emberagi/ember-lending-runtime`.

The private tarball is expected to land under `typescript/clients/web-ag-ui/vendor-private/ember-lending-runtime/`. That path is gitignored so the packaged runtime artifact stays out of the tracked Vibekit tree.

Runtime configuration is supplied separately through `EMBER_LENDING_RUNTIME_CONFIG_FILE` or `EMBER_LENDING_RUNTIME_CONFIG_JSON`. The recommended path is `apps/agent-ember-lending/.private/ember-lending-runtime.config.json`, which is also gitignored because it contains planner, signer, and delegation configuration for the closed Ember runtime.
