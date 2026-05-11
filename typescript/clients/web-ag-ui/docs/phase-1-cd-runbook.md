# Phase 1 CD Runbook

This runbook defines the public-repo side of the `web-ag-ui` production CD
contract. The production workflow, deploy credentials, rendered app env files,
and private network credentials belong in a private CD control plane, not in
this public app repo.

## Source Refs

- Deploy `arbitrum-vibekit` from `next`.
- Deploy `ember-orchestration-v1-spec` from `main`.
- Record both exact commit SHAs with every release.
- Prefer a private CD workflow with `workflow_dispatch` and scheduled polling of
  those refs. Do not require the public repo to hold a token that can trigger
  production deploys.

## Production State

Keep these paths server-local and outside GitHub Actions secrets:

- `/opt/web-ag-ui/runtime/ows/portfolio-manager`
- `/opt/web-ag-ui/runtime/ows/ember-lending`
- `/opt/web-ag-ui/runtime/secrets/portfolio-manager-ows-passphrase`
- `/opt/web-ag-ui/runtime/secrets/portfolio-manager-oca-executor-ows-passphrase`
- `/opt/web-ag-ui/runtime/secrets/ember-lending-ows-passphrase`
- `/opt/web-ag-ui/runtime/auth`
- `/opt/web-ag-ui/runtime/traefik`

The OWS vault directories are mounted from server-local runtime state and must
not be written by CD. Runtime containers may need read/write access to the vault
directory for OWS lock/metadata updates. Passphrase files are mounted as Compose
secrets and read in the containers from `/run/secrets/...`.

## Required Volumes

The production overlay expects these existing Docker volumes:

- `web-ag-ui_agent_langgraph_api`
- `web-ag-ui_agent_clmm_langgraph_api`
- `web-ag-ui_agent_pendle_langgraph_api`
- `web-ag-ui_agent_gmx_allora_langgraph_api`
- `web-ag-ui_pi_runtime_postgres_data`

Do not run `docker compose down -v`, `docker volume prune`, or any equivalent
volume-deleting command in the deploy flow.

## Preflight

The private CD job should render the final Compose config and validate it before
recreating containers:

```bash
SHARED_EMBER_REPO_ROOT=/opt/web-ag-ui/deployments/ember-orchestration-v1-spec-<timestamp> \
docker compose \
  -f compose.yaml \
  -f compose.managed.yaml \
  -f compose.production.yaml \
  config --format json \
  | pnpm cd:validate-compose
```

The validator fails when:

- the Compose project name is not `web-ag-ui`
- internal service ports have any host publishing
- LangGraph `.langgraph_api` state is not backed by the expected named volumes
- PI runtime Postgres data is not backed by the expected named volume
- PM or lending wallet passphrases are not read from `/run/secrets/...`

## Deploy Shape

1. Fetch or archive the selected vibekit and spec source SHAs.
2. Stage timestamped release directories under `/opt/web-ag-ui/deployments`.
3. Render non-wallet app env files from the private CD environment.
4. Validate that server-local OWS vaults, secret files, Traefik state, auth
   state, and named volumes exist without printing sensitive values.
5. Back up LangGraph `.langgraph_api` volume contents before restarting
   LangGraph services.
6. Run `docker compose -p web-ag-ui ... up -d --build` with
   `compose.production.yaml`.
7. Record the active release path and both source SHAs.
8. Run health checks for web, Shared Ember, portfolio manager, Ember lending,
   LangGraph agents, and core persistence mounts.

Rollback should switch back to the previous timestamped release and rerun
`docker compose -p web-ag-ui ... up -d --build` without deleting volumes.

## Wallet Rotation

Wallet setup and rotation are manual server-local operations in phase 1:

1. Create or import fresh OWS wallets on the server.
2. Write/update the corresponding passphrase files under
   `/opt/web-ag-ui/runtime/secrets`.
3. Set owner and mode so only the deploy/runtime user can read them.
4. Update the non-secret wallet name/id env values in the private CD control
   plane.
5. Let CD validate the files exist and restart the services.

Never fund or reuse a signer that is known or suspected to be compromised.
