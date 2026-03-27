# agent-ember-lending

Thin `web-ag-ui` host app for the Ember lending Pi agent.

This package owns only the local Pi runtime bootstrap, AG-UI HTTP transport, and process wiring. The closed-source Ember lending behavior is loaded at runtime through `EMBER_LENDING_RUNTIME_MODULE`, which should resolve to a privately distributed package such as `@emberagi/ember-lending-runtime`.
