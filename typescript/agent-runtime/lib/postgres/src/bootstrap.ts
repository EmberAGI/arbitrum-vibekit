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

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime';
const DEFAULT_START_COMMAND =
  'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17';

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
