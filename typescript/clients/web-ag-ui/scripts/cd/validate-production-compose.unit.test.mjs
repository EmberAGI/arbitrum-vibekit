import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateProductionComposeConfig } from './validate-production-compose.mjs';

function validConfig(overrides = {}) {
  return {
    name: 'web-ag-ui',
    services: {
      web: {
        ports: [{ target: 3000, published: '3000', host_ip: '127.0.0.1' }],
      },
      agent: {
        ports: [{ target: 8123, published: '8123', host_ip: '127.0.0.1' }],
        volumes: [
          {
            type: 'volume',
            source: 'agent_langgraph_api',
            target: '/app/apps/agent/.langgraph_api',
          },
        ],
      },
      'agent-clmm': {
        ports: [{ target: 8124, published: '8124', host_ip: '127.0.0.1' }],
        volumes: [
          {
            type: 'volume',
            source: 'agent_clmm_langgraph_api',
            target: '/app/apps/agent-clmm/.langgraph_api',
          },
        ],
      },
      'agent-pendle': {
        ports: [{ target: 8125, published: '8125', host_ip: '127.0.0.1' }],
        volumes: [
          {
            type: 'volume',
            source: 'agent_pendle_langgraph_api',
            target: '/app/apps/agent-pendle/.langgraph_api',
          },
        ],
      },
      'agent-gmx-allora': {
        ports: [{ target: 8126, published: '8126', host_ip: '127.0.0.1' }],
        volumes: [
          {
            type: 'volume',
            source: 'agent_gmx_allora_langgraph_api',
            target: '/app/apps/agent-gmx-allora/.langgraph_api',
          },
        ],
      },
      'pi-runtime-postgres': {
        ports: [{ target: 5432, published: '55432', host_ip: '127.0.0.1' }],
        volumes: [
          {
            type: 'volume',
            source: 'pi_runtime_postgres_data',
            target: '/var/lib/postgresql/data',
          },
        ],
      },
      'agent-portfolio-manager': {
        ports: [{ target: 3420, published: '3420', host_ip: '127.0.0.1' }],
        environment: {
          PORTFOLIO_MANAGER_OWS_PASSPHRASE_FILE:
            '/run/secrets/portfolio_manager_ows_passphrase',
          PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_PASSPHRASE_FILE:
            '/run/secrets/portfolio_manager_oca_executor_ows_passphrase',
        },
      },
      'agent-ember-lending': {
        ports: [{ target: 3430, published: '3430', host_ip: '127.0.0.1' }],
        environment: {
          EMBER_LENDING_OWS_PASSPHRASE_FILE: '/run/secrets/ember_lending_ows_passphrase',
        },
      },
      'shared-ember': {
        ports: [{ target: 4010, published: '4010', host_ip: '127.0.0.1' }],
      },
      traefik: {
        ports: [
          { target: 80, published: '80', host_ip: '0.0.0.0' },
          { target: 443, published: '443', host_ip: '0.0.0.0' },
        ],
      },
    },
    volumes: {
      agent_langgraph_api: { external: true, name: 'web-ag-ui_agent_langgraph_api' },
      agent_clmm_langgraph_api: {
        external: true,
        name: 'web-ag-ui_agent_clmm_langgraph_api',
      },
      agent_pendle_langgraph_api: {
        external: true,
        name: 'web-ag-ui_agent_pendle_langgraph_api',
      },
      agent_gmx_allora_langgraph_api: {
        external: true,
        name: 'web-ag-ui_agent_gmx_allora_langgraph_api',
      },
      pi_runtime_postgres_data: {
        external: true,
        name: 'web-ag-ui_pi_runtime_postgres_data',
      },
    },
    ...overrides,
  };
}

test('accepts the production compose shape required by phase 1 CD', () => {
  assert.deepEqual(validateProductionComposeConfig(validConfig()), []);
});

test('fails when the compose project name is not fixed', () => {
  assert.match(validateProductionComposeConfig(validConfig({ name: 'web-ag-ui-20260507' })).join('\n'), /project name/i);
});

test('fails when an internal service port is publicly bound', () => {
  const config = validConfig();
  config.services['shared-ember'].ports = [{ target: 4010, published: '4010' }];

  assert.match(validateProductionComposeConfig(config).join('\n'), /shared-ember.*4010.*public/i);
});

test('fails when LangGraph state is not mounted from the expected named volume', () => {
  const config = validConfig();
  config.services['agent-clmm'].volumes = [
    {
      type: 'bind',
      source: './apps/agent-clmm/.langgraph_api',
      target: '/app/apps/agent-clmm/.langgraph_api',
    },
  ];

  assert.match(validateProductionComposeConfig(config).join('\n'), /agent-clmm.*agent_clmm_langgraph_api/i);
});

test('fails when Postgres data is not mounted from the expected named volume', () => {
  const config = validConfig();
  config.services['pi-runtime-postgres'].volumes = [];

  assert.match(validateProductionComposeConfig(config).join('\n'), /pi-runtime-postgres.*pi_runtime_postgres_data/i);
});

test('fails when wallet passphrases are not read from run secrets', () => {
  const config = validConfig();
  delete config.services['agent-portfolio-manager'].environment
    .PORTFOLIO_MANAGER_OWS_PASSPHRASE_FILE;

  assert.match(validateProductionComposeConfig(config).join('\n'), /portfolio-manager.*passphrase/i);
});
