import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { Client } from 'pg';

import { buildCreatePiRuntimeSchemaSql } from './schema.js';

export type PostgresBootstrapPlan =
  | {
      mode: 'external';
      databaseUrl: string;
      startCommand: null;
    }
  | {
      mode: 'local-docker';
      databaseUrl: string;
      startCommand: string;
    };

export type EnsurePiRuntimePostgresReadyOptions = {
  env?: {
    DATABASE_URL?: string;
  };
  executeCommand?: (command: string) => Promise<number>;
  waitForDatabase?: (databaseUrl: string) => Promise<void>;
  applySchema?: (databaseUrl: string, statements: readonly string[]) => Promise<void>;
  schemaStatements?: readonly string[];
};

export type EnsuredPiRuntimePostgres = {
  bootstrapPlan: PostgresBootstrapPlan;
  databaseUrl: string;
  startedLocalDocker: boolean;
};

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime';
const DEFAULT_CONTAINER_NAME = 'pi-runtime-postgres';
const DEFAULT_START_COMMAND =
  `docker run --name ${DEFAULT_CONTAINER_NAME} -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17`;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_POLL_MS = 250;

const exec = promisify(execCallback);

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

async function executeShellCommand(command: string): Promise<number> {
  try {
    await exec(command);
    return 0;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number') {
      return error.code;
    }
    return 1;
  }
}

async function waitForDatabaseConnection(databaseUrl: string): Promise<void> {
  const deadline = Date.now() + DEFAULT_WAIT_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    const client = new Client({
      connectionString: databaseUrl,
    });

    try {
      await client.connect();
      await client.query('select 1');
      return;
    } catch (error) {
      lastError = error;
      await sleep(DEFAULT_WAIT_POLL_MS);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for database: ${databaseUrl}`);
}

async function applyPiRuntimeSchema(databaseUrl: string, statements: readonly string[]): Promise<void> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ensureLocalDockerPostgres(
  bootstrapPlan: Extract<PostgresBootstrapPlan, { mode: 'local-docker' }>,
  executeCommand: (command: string) => Promise<number>,
): Promise<void> {
  const dockerInfoExitCode = await executeCommand('docker info > /dev/null 2>&1');
  if (dockerInfoExitCode !== 0) {
    throw new Error(
      'Local Pi runtime Postgres bootstrap requires a running Docker daemon or an explicit DATABASE_URL.',
    );
  }

  const startExitCode = await executeCommand(`docker start ${DEFAULT_CONTAINER_NAME}`);
  if (startExitCode === 0) {
    return;
  }

  const runExitCode = await executeCommand(bootstrapPlan.startCommand);
  if (runExitCode !== 0) {
    throw new Error(`Unable to bootstrap local Postgres with: ${bootstrapPlan.startCommand}`);
  }
}

export function resolvePostgresBootstrapPlan(env: {
  DATABASE_URL?: string;
}): PostgresBootstrapPlan {
  if (env.DATABASE_URL) {
    return {
      mode: 'external',
      databaseUrl: env.DATABASE_URL,
      startCommand: null,
    };
  }

  return {
    mode: 'local-docker',
    databaseUrl: DEFAULT_DATABASE_URL,
    startCommand: DEFAULT_START_COMMAND,
  };
}

export async function ensurePiRuntimePostgresReady(
  options: EnsurePiRuntimePostgresReadyOptions = {},
): Promise<EnsuredPiRuntimePostgres> {
  const bootstrapPlan = resolvePostgresBootstrapPlan(options.env ?? { DATABASE_URL: process.env.DATABASE_URL });
  const waitForDatabase = options.waitForDatabase ?? waitForDatabaseConnection;
  const applySchema = options.applySchema ?? applyPiRuntimeSchema;
  const executeCommand = options.executeCommand ?? executeShellCommand;
  const schemaStatements = options.schemaStatements ?? buildCreatePiRuntimeSchemaSql();

  let startedLocalDocker = false;

  try {
    await waitForDatabase(bootstrapPlan.databaseUrl);
  } catch (error) {
    if (bootstrapPlan.mode !== 'local-docker') {
      throw error;
    }

    await ensureLocalDockerPostgres(bootstrapPlan, executeCommand);
    startedLocalDocker = true;
    await waitForDatabase(bootstrapPlan.databaseUrl);
  }

  await applySchema(bootstrapPlan.databaseUrl, schemaStatements);

  return {
    bootstrapPlan,
    databaseUrl: bootstrapPlan.databaseUrl,
    startedLocalDocker,
  };
}
