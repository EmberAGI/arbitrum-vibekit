#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { stdin } from 'node:process';

const EXPECTED_PROJECT_NAME = 'web-ag-ui';
const INTERNAL_PORTS = new Map([
  ['web', new Set(['3000'])],
  ['agent', new Set(['8123'])],
  ['agent-clmm', new Set(['8124'])],
  ['agent-pendle', new Set(['8125'])],
  ['agent-gmx-allora', new Set(['8126'])],
  ['shared-ember', new Set(['4010'])],
  ['agent-portfolio-manager', new Set(['3420'])],
  ['agent-ember-lending', new Set(['3430'])],
  ['pi-runtime-postgres', new Set(['55432', '5432'])],
]);

const REQUIRED_VOLUME_MOUNTS = [
  {
    service: 'agent',
    target: '/app/apps/agent/.langgraph_api',
    source: 'agent_langgraph_api',
  },
  {
    service: 'agent-clmm',
    target: '/app/apps/agent-clmm/.langgraph_api',
    source: 'agent_clmm_langgraph_api',
  },
  {
    service: 'agent-pendle',
    target: '/app/apps/agent-pendle/.langgraph_api',
    source: 'agent_pendle_langgraph_api',
  },
  {
    service: 'agent-gmx-allora',
    target: '/app/apps/agent-gmx-allora/.langgraph_api',
    source: 'agent_gmx_allora_langgraph_api',
  },
  {
    service: 'pi-runtime-postgres',
    target: '/var/lib/postgresql/data',
    source: 'pi_runtime_postgres_data',
  },
];

const REQUIRED_EXTERNAL_VOLUMES = new Map([
  ['agent_langgraph_api', 'web-ag-ui_agent_langgraph_api'],
  ['agent_clmm_langgraph_api', 'web-ag-ui_agent_clmm_langgraph_api'],
  ['agent_pendle_langgraph_api', 'web-ag-ui_agent_pendle_langgraph_api'],
  ['agent_gmx_allora_langgraph_api', 'web-ag-ui_agent_gmx_allora_langgraph_api'],
  ['pi_runtime_postgres_data', 'web-ag-ui_pi_runtime_postgres_data'],
]);

const REQUIRED_SECRET_ENV = [
  {
    service: 'agent-portfolio-manager',
    envVar: 'PORTFOLIO_MANAGER_OWS_PASSPHRASE_FILE',
    value: '/run/secrets/portfolio_manager_ows_passphrase',
  },
  {
    service: 'agent-portfolio-manager',
    envVar: 'PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_PASSPHRASE_FILE',
    value: '/run/secrets/portfolio_manager_oca_executor_ows_passphrase',
  },
  {
    service: 'agent-ember-lending',
    envVar: 'EMBER_LENDING_OWS_PASSPHRASE_FILE',
    value: '/run/secrets/ember_lending_ows_passphrase',
  },
];

function asObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function normalizePort(port) {
  if (typeof port === 'string') {
    const segments = port.split(':');
    const target = segments.at(-1)?.split('/')[0] ?? '';
    const published = segments.length > 1 ? segments.at(-2) ?? target : target;
    const hostIp = segments.length > 2 ? segments.slice(0, -2).join(':') : undefined;

    return {
      target,
      published,
      hostIp,
    };
  }

  const record = asObject(port);

  return {
    target: String(record.target ?? ''),
    published: String(record.published ?? record.mode ?? ''),
    hostIp: typeof record.host_ip === 'string' ? record.host_ip : undefined,
  };
}

function normalizeVolume(volume) {
  if (typeof volume === 'string') {
    const [source = '', target = ''] = volume.split(':');

    return {
      source,
      target,
      type: source.startsWith('.') || source.startsWith('/') ? 'bind' : 'volume',
    };
  }

  const record = asObject(volume);

  return {
    source: String(record.source ?? ''),
    target: String(record.target ?? ''),
    type: String(record.type ?? ''),
  };
}

function readEnvironment(service) {
  const environment = asObject(service.environment);
  if (Array.isArray(service.environment)) {
    return Object.fromEntries(
      service.environment
        .map((entry) => String(entry).split('='))
        .filter(([name]) => name.length > 0)
        .map(([name, ...value]) => [name, value.join('=')]),
    );
  }

  return environment;
}

function validateProjectName(config, errors) {
  const projectName = typeof config.name === 'string' ? config.name : process.env.COMPOSE_PROJECT_NAME;
  if (projectName !== EXPECTED_PROJECT_NAME) {
    errors.push(
      `Compose project name must be fixed to "${EXPECTED_PROJECT_NAME}", got "${projectName ?? 'unset'}".`,
    );
  }
}

function validateInternalPorts(services, errors) {
  for (const [serviceName, internalPorts] of INTERNAL_PORTS.entries()) {
    const service = asObject(services[serviceName]);
    for (const port of Array.isArray(service.ports) ? service.ports : []) {
      const normalized = normalizePort(port);
      if (internalPorts.has(normalized.published) || internalPorts.has(normalized.target)) {
        errors.push(
          `${serviceName} publishes internal port ${normalized.published}; remove host publishing and keep it on the Compose network.`,
        );
      }
    }
  }
}

function validateVolumeMounts(config, services, errors) {
  for (const required of REQUIRED_VOLUME_MOUNTS) {
    const service = asObject(services[required.service]);
    const volumes = (Array.isArray(service.volumes) ? service.volumes : []).map(normalizeVolume);
    const mount = volumes.find((volume) => volume.target === required.target);
    if (!mount || mount.type !== 'volume' || mount.source !== required.source) {
      errors.push(
        `${required.service} must mount ${required.target} from named volume ${required.source}.`,
      );
    }
  }

  const volumes = asObject(config.volumes);
  for (const [volumeName, externalName] of REQUIRED_EXTERNAL_VOLUMES.entries()) {
    const volume = asObject(volumes[volumeName]);
    if (volume.external !== true || volume.name !== externalName) {
      errors.push(`${volumeName} must be an external volume named ${externalName}.`);
    }
  }
}

function validateWalletSecretFiles(services, errors) {
  for (const required of REQUIRED_SECRET_ENV) {
    const service = asObject(services[required.service]);
    const environment = readEnvironment(service);
    if (environment[required.envVar] !== required.value) {
      errors.push(`${required.service} must set ${required.envVar} to ${required.value}.`);
    }
  }
}

export function validateProductionComposeConfig(config) {
  const errors = [];
  const services = asObject(config.services);

  validateProjectName(asObject(config), errors);
  validateInternalPorts(services, errors);
  validateVolumeMounts(asObject(config), services, errors);
  validateWalletSecretFiles(services, errors);

  return errors;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const pathArg = process.argv[2];
  const raw = pathArg ? readFileSync(pathArg, 'utf8') : await readStdin();
  const errors = validateProductionComposeConfig(JSON.parse(raw));

  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log('production compose preflight passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
