import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDotEnvFile, startManagedSharedEmberHarness, startWorkspaceAgentServer } from './support/runtimePrep.js';
import {
  applyProcessEnvironmentOverrides,
  buildWalletQaEnvironmentOverrides,
  readOwsWalletRecords,
  resolveManagedWalletIds,
  resolveWalletQaWebServerPlan,
  resolveWalletQaWorkspace,
} from './support/walletQaStack.js';

type StartedProcessService = {
  label: string;
  baseUrl: string;
  reused: boolean;
  close: () => Promise<void>;
};

type DatabaseStatus = {
  label: string;
  databaseUrl: string;
  reachable: boolean;
  bootstrappedWithDocker: boolean;
  message: string;
};

type HttpDependencyStatus = {
  label: string;
  baseUrl: string;
  reachable: boolean;
  message: string;
};

type DockerPostgresPlan = {
  containerName: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
};

const DEFAULT_SHARED_EMBER_DATABASE_URL = 'postgresql://ember:ember@127.0.0.1:55433/ember';
const DEFAULT_PI_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime';
const DEFAULT_ONCHAIN_ACTIONS_PORT = 50051;
const DEFAULT_SHARED_EMBER_PORT = 4010;
const DEFAULT_WEB_PORT = 3000;
const HOST = '127.0.0.1';
const HEALTH_TIMEOUT_MS = 90_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readString(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readInteger(value: string | undefined): number | null {
  const normalized = readString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseCliArgs(argv: string[]) {
  const flags = new Set(argv.filter((flag) => flag !== '--'));
  const unknown = [...flags].filter((flag) => flag !== '--check' && flag !== '--help');
  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
  }

  return {
    checkOnly: flags.has('--check'),
    help: flags.has('--help'),
  };
}

function currentWebAgUiRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function currentVibekitRoot(webAgUiRoot: string): string {
  return path.resolve(webAgUiRoot, '..', '..', '..');
}

async function isTcpReachable(host: string, port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1_000);

    socket.once('connect', () => {
      clearTimeout(timeout);
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function waitForTcpReady(host: string, port: number, timeoutMs: number, label: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isTcpReachable(host, port)) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`${label} did not become reachable on ${host}:${port} within ${timeoutMs}ms.`);
}

async function waitForHttpReady(
  url: string,
  timeoutMs: number,
  label: string,
  acceptStatus: (status: number) => boolean,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (acceptStatus(response.status)) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await sleep(250);
  }

  throw new Error(`${label} did not become ready at ${url} within ${timeoutMs}ms.`);
}

async function portIsAvailable(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, HOST, () => {
      server.close(() => resolve(true));
    });
  });
}

async function reserveFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve a free port.')));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function resolveLaunchPort(input: {
  label: string;
  preferredPort: number;
  explicitPort: boolean;
  reusableHealthUrl?: string;
}): Promise<{ port: number; reused: boolean }> {
  if (await portIsAvailable(input.preferredPort)) {
    return {
      port: input.preferredPort,
      reused: false,
    };
  }

  if (input.reusableHealthUrl) {
    try {
      await waitForHttpReady(
        input.reusableHealthUrl,
        3_000,
        `${input.label} reuse probe`,
        (status) => status >= 200 && status < 500,
      );
      return {
        port: input.preferredPort,
        reused: true,
      };
    } catch {
      // Fall through to explicit-port failure or free-port fallback.
    }
  }

  if (input.explicitPort) {
    throw new Error(`${input.label} port ${input.preferredPort} is already in use.`);
  }

  return {
    port: await reserveFreePort(),
    reused: false,
  };
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options.cwd,
      env: options.env ?? process.env,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function dockerIsReachable(): Promise<boolean> {
  try {
    const result = await runCommand('docker', ['info']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function resolveDockerPostgresPlan(databaseUrl: string): DockerPostgresPlan | null {
  const parsed = new URL(databaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    return null;
  }

  if (parsed.port === '55432' && parsed.pathname === '/pi_runtime') {
    return {
      containerName: 'pi-runtime-postgres',
      port: 55432,
      databaseName: 'pi_runtime',
      username: parsed.username || 'postgres',
      password: parsed.password || 'postgres',
    };
  }

  if (parsed.port === '55433' && parsed.pathname === '/ember') {
    return {
      containerName: 'shared-ember-postgres',
      port: 55433,
      databaseName: 'ember',
      username: parsed.username || 'ember',
      password: parsed.password || 'ember',
    };
  }

  return null;
}

async function bootstrapDockerPostgres(plan: DockerPostgresPlan) {
  const startResult = await runCommand('docker', ['start', plan.containerName]);
  if (startResult.exitCode === 0) {
    return;
  }

  const runResult = await runCommand('docker', [
    'run',
    '--name',
    plan.containerName,
    '-e',
    `POSTGRES_USER=${plan.username}`,
    '-e',
    `POSTGRES_PASSWORD=${plan.password}`,
    '-e',
    `POSTGRES_DB=${plan.databaseName}`,
    '-p',
    `${plan.port}:5432`,
    '-d',
    'postgres:17',
  ]);

  if (runResult.exitCode !== 0) {
    throw new Error(
      `Failed to start Docker Postgres container ${plan.containerName}: ${runResult.stderr || runResult.stdout}`,
    );
  }
}

async function ensureDatabaseReady(input: {
  label: string;
  cluster: 'pi-runtime' | 'shared-ember';
  databaseUrl: string;
  checkOnly: boolean;
  allowDockerBootstrap: boolean;
  bootstrapScriptPath: string;
  bootstrapScriptCwd: string;
}): Promise<DatabaseStatus> {
  const parsed = new URL(input.databaseUrl);
  const host = parsed.hostname;
  const port = Number.parseInt(parsed.port || '5432', 10);

  if (await isTcpReachable(host, port)) {
    return {
      label: input.label,
      databaseUrl: input.databaseUrl,
      reachable: true,
      bootstrappedWithDocker: false,
      message: `${input.label} database is reachable at ${host}:${port}.`,
    };
  }

  const dockerPlan = resolveDockerPostgresPlan(input.databaseUrl);
  const dockerReady = input.allowDockerBootstrap ? await dockerIsReachable() : false;
  const sessionBootstrapAvailable = host === '127.0.0.1' || host === 'localhost';
  if (input.checkOnly) {
    if (dockerPlan && dockerReady) {
      return {
        label: input.label,
        databaseUrl: input.databaseUrl,
        reachable: false,
        bootstrappedWithDocker: false,
        message: `${input.label} database is not reachable yet; Docker bootstrap is available.`,
      };
    }

    if (sessionBootstrapAvailable) {
      return {
        label: input.label,
        databaseUrl: input.databaseUrl,
        reachable: false,
        bootstrappedWithDocker: false,
        message: `${input.label} database is not reachable yet; session-local bootstrap is available.`,
      };
    }

    throw new Error(
      `${input.label} database is not reachable at ${input.databaseUrl}, and no automatic Docker bootstrap path is available.`,
    );
  }

  if (!dockerPlan || !dockerReady) {
    if (!sessionBootstrapAvailable) {
      throw new Error(
        `${input.label} database is not reachable at ${input.databaseUrl}. Start Postgres there or restore Docker access.`,
      );
    }

    const sessionBootstrap = await runCommand(
      'bash',
      [
        input.bootstrapScriptPath,
        '--cluster',
        input.cluster,
        '--url',
        input.databaseUrl,
      ],
      {
        cwd: input.bootstrapScriptCwd,
        env: process.env,
      },
    );
    if (sessionBootstrap.exitCode !== 0) {
      throw new Error(
        `Failed to bootstrap session-local ${input.label} Postgres: ${sessionBootstrap.stderr || sessionBootstrap.stdout}`,
      );
    }
    await waitForTcpReady(host, port, 30_000, `${input.label} database`);
    return {
      label: input.label,
      databaseUrl: input.databaseUrl,
      reachable: true,
      bootstrappedWithDocker: false,
      message: `${input.label} database was bootstrapped from the session-local Postgres runtime at ${host}:${port}.`,
    };
  }

  await bootstrapDockerPostgres(dockerPlan);
  await waitForTcpReady(host, port, 30_000, `${input.label} database`);

  return {
    label: input.label,
    databaseUrl: input.databaseUrl,
    reachable: true,
    bootstrappedWithDocker: true,
    message: `${input.label} database was bootstrapped with Docker at ${host}:${port}.`,
  };
}

async function startCommandServer(input: {
  label: string;
  cwd: string;
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
  baseUrl: string;
  healthPath: string;
  logFilePath: string;
  acceptStatus?: (status: number) => boolean;
}): Promise<StartedProcessService> {
  mkdirSync(path.dirname(input.logFilePath), { recursive: true });
  const logStream = createWriteStream(input.logFilePath, { flags: 'a' });
  const logs: string[] = [];
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: {
      ...process.env,
      ...Object.fromEntries(
        Object.entries(input.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const appendLog = (prefix: string, chunk: Buffer | string) => {
    const rendered = String(chunk);
    logStream.write(`${prefix}${rendered}`);
    for (const line of rendered.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      logs.push(`${prefix}${trimmed}`);
      if (logs.length > 200) {
        logs.shift();
      }
    }
  };

  child.stdout.on('data', (chunk) => appendLog('', chunk));
  child.stderr.on('data', (chunk) => appendLog('ERR: ', chunk));

  let closedByHarness = false;
  child.once('exit', (code, signal) => {
    if (closedByHarness) {
      return;
    }
    const summary =
      `${input.label} exited after startup (code=${String(code)}, signal=${String(signal)}).` +
      (logs.length > 0 ? `\n${logs.slice(-40).join('\n')}` : '');
    console.error(summary);
  });

  await waitForHttpReady(
    new URL(input.healthPath, input.baseUrl).toString(),
    HEALTH_TIMEOUT_MS,
    input.label,
    input.acceptStatus ?? ((status) => status >= 200 && status < 500),
  ).catch(async (error) => {
    closedByHarness = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
    logStream.end();
    throw new Error(`${toErrorMessage(error)}\n${logs.slice(-20).join('\n')}`);
  });

  return {
    label: input.label,
    baseUrl: input.baseUrl,
    reused: false,
    close: async () => {
      closedByHarness = true;
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill('SIGKILL');
            }
            resolve();
          }, 5_000);

          child.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      await new Promise<void>((resolve) => {
        logStream.end(() => resolve());
      });
    },
  };
}

async function runLoggedCommand(input: {
  label: string;
  cwd: string;
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
  logFilePath: string;
}) {
  mkdirSync(path.dirname(input.logFilePath), { recursive: true });

  const result = await runCommand(input.command, input.args, {
    cwd: input.cwd,
    env: {
      ...process.env,
      ...Object.fromEntries(
        Object.entries(input.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
    },
  });

  const renderedCommand = `$ ${input.command} ${input.args.join(' ')}`;
  const renderedOutput = [renderedCommand, result.stdout.trim(), result.stderr.trim()]
    .filter((chunk) => chunk.length > 0)
    .join('\n');
  createWriteStream(input.logFilePath, { flags: 'a' }).end(`${renderedOutput}\n`);

  if (result.exitCode !== 0) {
    throw new Error(
      `${input.label} failed (exit=${result.exitCode}).\n${[result.stdout.trim(), result.stderr.trim()]
        .filter((chunk) => chunk.length > 0)
        .join('\n')}`,
    );
  }
}

async function waitForShutdownSignal() {
  await new Promise<void>((resolve) => {
    const onSignal = () => resolve();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  });
}

function printHelp() {
  console.log(`Usage: bash scripts/smoke/boot-wallet-qa-stack.sh [--check]

Environment overrides:
  WALLET_QA_BUNDLE_ROOT
  WALLET_QA_ONCHAIN_ACTIONS_API_URL
  WALLET_QA_ONCHAIN_ACTIONS_WORKTREE_DIR
  WALLET_QA_SPEC_ROOT
  WALLET_QA_PI_DATABASE_URL
  WALLET_QA_SHARED_EMBER_DATABASE_URL
  WALLET_QA_ONCHAIN_ACTIONS_PORT
  WALLET_QA_SHARED_EMBER_PORT
  WALLET_QA_WEB_PORT
  WALLET_QA_NO_DOCKER_POSTGRES=1
`);
}

async function ensureHttpDependencyReady(input: {
  label: string;
  baseUrl: string;
  healthPath: string;
}): Promise<HttpDependencyStatus> {
  const healthUrl = new URL(input.healthPath, input.baseUrl).toString();
  await waitForHttpReady(healthUrl, 15_000, input.label, (status) => status >= 200 && status < 300);
  return {
    label: input.label,
    baseUrl: input.baseUrl,
    reachable: true,
    message: `${input.label} is reachable at ${healthUrl}.`,
  };
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const webAgUiRoot = currentWebAgUiRoot();
  const vibekitRoot = currentVibekitRoot(webAgUiRoot);
  const explicitOnchainActionsApiUrl = readString(process.env.WALLET_QA_ONCHAIN_ACTIONS_API_URL);
  const workspace = resolveWalletQaWorkspace({
    webAgUiRoot,
    bundleRoot: readString(process.env.WALLET_QA_BUNDLE_ROOT) ?? undefined,
    onchainActionsWorktreeDir:
      readString(process.env.WALLET_QA_ONCHAIN_ACTIONS_WORKTREE_DIR) ?? undefined,
    specRoot:
      readString(process.env.WALLET_QA_SPEC_ROOT) ??
      readString(process.env.EMBER_ORCHESTRATION_V1_SPEC_ROOT) ??
      undefined,
    allowMissingOnchainActionsWorktree: explicitOnchainActionsApiUrl !== null,
  });

  mkdirSync(workspace.logsDir, { recursive: true });

  const webBaseEnv = applyProcessEnvironmentOverrides(
    parseDotEnvFile(workspace.webEnvFilePath),
    process.env,
    ['NEXT_PUBLIC_PRIVY_APP_ID'],
  );
  const portfolioManagerBaseEnv = applyProcessEnvironmentOverrides(
    parseDotEnvFile(workspace.portfolioManagerEnvFilePath),
    process.env,
    ['OPENROUTER_API_KEY'],
  );
  const emberLendingBaseEnv = applyProcessEnvironmentOverrides(
    parseDotEnvFile(workspace.emberLendingEnvFilePath),
    process.env,
    ['OPENROUTER_API_KEY'],
  );
  const onchainActionsBaseEnv = parseDotEnvFile(workspace.onchainActionsEnvFilePath);
  const requireFromWeb = createRequire(path.join(vibekitRoot, 'typescript/clients/web-ag-ui/apps/web/package.json'));
  const { privateKeyToAccount } = requireFromWeb('viem/accounts') as typeof import('viem/accounts');
  const explicitPortfolioManagerWalletId = readString(
    process.env.WALLET_QA_PORTFOLIO_MANAGER_OWS_WALLET_ID,
  );
  const explicitPortfolioManagerOcaExecutorWalletId = readString(
    process.env.WALLET_QA_PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_ID,
  );
  const explicitEmberLendingWalletId = readString(
    process.env.WALLET_QA_EMBER_LENDING_OWS_WALLET_ID,
  );
  const sharedEmberManagedOnboardingBootstrap = JSON.parse(
    readFileSync(workspace.sharedEmberManagedOnboardingBootstrapPath, 'utf8'),
  ) as Record<string, { controllerPrivateKey?: `0x${string}` }>;
  const managedBootstrapEntry = sharedEmberManagedOnboardingBootstrap['ember-lending'] ?? {};
  const controllerSignerAddress = managedBootstrapEntry.controllerPrivateKey
    ? privateKeyToAccount(managedBootstrapEntry.controllerPrivateKey).address
    : null;
  const resolvedWalletIds = resolveManagedWalletIds({
    portfolioManagerWallets: readOwsWalletRecords(
      path.join(workspace.portfolioManagerOwsVaultPath, 'wallets'),
    ),
    emberLendingWallets: readOwsWalletRecords(
      path.join(workspace.emberLendingOwsVaultPath, 'wallets'),
    ),
    portfolioManagerWalletName:
      explicitPortfolioManagerWalletId ??
      readString(portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OWS_WALLET_NAME),
    portfolioManagerOcaExecutorWalletName:
      explicitPortfolioManagerOcaExecutorWalletId ??
      readString(portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_NAME) ??
      undefined,
    emberLendingWalletName:
      explicitEmberLendingWalletId ??
      readString(emberLendingBaseEnv.EMBER_LENDING_OWS_WALLET_NAME),
    controllerSignerAddress,
  });

  const piDatabaseUrl =
    readString(process.env.WALLET_QA_PI_DATABASE_URL) ??
    readString(portfolioManagerBaseEnv.DATABASE_URL) ??
    readString(emberLendingBaseEnv.DATABASE_URL) ??
    DEFAULT_PI_DATABASE_URL;
  const sharedEmberDatabaseUrl =
    readString(process.env.WALLET_QA_SHARED_EMBER_DATABASE_URL) ??
    DEFAULT_SHARED_EMBER_DATABASE_URL;
  const allowDockerBootstrap =
    !['1', 'true'].includes((process.env.WALLET_QA_NO_DOCKER_POSTGRES ?? '').trim().toLowerCase());
  const bootstrapScriptPath = path.join(webAgUiRoot, 'scripts/smoke/ensure-session-postgres.sh');

  const piDatabase = await ensureDatabaseReady({
    label: 'pi-runtime',
    cluster: 'pi-runtime',
    databaseUrl: piDatabaseUrl,
    checkOnly: cli.checkOnly,
    allowDockerBootstrap,
    bootstrapScriptPath,
    bootstrapScriptCwd: webAgUiRoot,
  });
  const sharedEmberDatabase = await ensureDatabaseReady({
    label: 'shared-ember',
    cluster: 'shared-ember',
    databaseUrl: sharedEmberDatabaseUrl,
    checkOnly: cli.checkOnly,
    allowDockerBootstrap,
    bootstrapScriptPath,
    bootstrapScriptCwd: webAgUiRoot,
  });

  const preferredOnchainActionsPort =
    readInteger(process.env.WALLET_QA_ONCHAIN_ACTIONS_PORT) ??
    readInteger(onchainActionsBaseEnv.PORT) ??
    DEFAULT_ONCHAIN_ACTIONS_PORT;
  const onchainActionsPort =
    explicitOnchainActionsApiUrl === null
      ? await resolveLaunchPort({
          label: 'onchain-actions',
          preferredPort: preferredOnchainActionsPort,
          explicitPort: readString(process.env.WALLET_QA_ONCHAIN_ACTIONS_PORT) !== null,
          reusableHealthUrl: `http://${HOST}:${preferredOnchainActionsPort}/health`,
        })
      : null;

  const preferredSharedEmberPort =
    readInteger(process.env.WALLET_QA_SHARED_EMBER_PORT) ?? DEFAULT_SHARED_EMBER_PORT;
  const sharedEmberPort = await resolveLaunchPort({
    label: 'shared-ember',
    preferredPort: preferredSharedEmberPort,
    explicitPort: readString(process.env.WALLET_QA_SHARED_EMBER_PORT) !== null,
  });

  const preferredWebPort = readInteger(process.env.WALLET_QA_WEB_PORT) ?? DEFAULT_WEB_PORT;
  const webPort = await resolveLaunchPort({
    label: 'apps/web',
    preferredPort: preferredWebPort,
    explicitPort: readString(process.env.WALLET_QA_WEB_PORT) !== null,
  });

  const onchainActionsBaseUrl =
    explicitOnchainActionsApiUrl ?? `http://${HOST}:${onchainActionsPort?.port ?? DEFAULT_ONCHAIN_ACTIONS_PORT}`;
  const sharedEmberBaseUrl = `http://${HOST}:${sharedEmberPort.port}`;
  const webServerPlan = resolveWalletQaWebServerPlan({
    host: HOST,
    port: webPort.port,
  });
  const onchainActionsDependency =
    explicitOnchainActionsApiUrl !== null
      ? await ensureHttpDependencyReady({
          label: 'onchain-actions',
          baseUrl: onchainActionsBaseUrl,
          healthPath: '/health',
        })
      : onchainActionsPort?.reused
      ? await ensureHttpDependencyReady({
          label: 'onchain-actions',
          baseUrl: onchainActionsBaseUrl,
          healthPath: '/health',
        })
      : {
          label: 'onchain-actions',
          baseUrl: onchainActionsBaseUrl,
          reachable: false,
          message: `onchain-actions will be started locally at ${onchainActionsBaseUrl}.`,
        };

  const managedBaseEnvs = {
    webBaseEnv,
    portfolioManagerBaseEnv: {
      ...portfolioManagerBaseEnv,
      DATABASE_URL: piDatabaseUrl,
      ...(explicitPortfolioManagerWalletId
        ? {
            PORTFOLIO_MANAGER_OWS_WALLET_NAME: explicitPortfolioManagerWalletId,
          }
        : resolvedWalletIds.portfolioManagerWalletId
        ? {
            PORTFOLIO_MANAGER_OWS_WALLET_NAME: resolvedWalletIds.portfolioManagerWalletId,
          }
        : {}),
      ...(explicitPortfolioManagerOcaExecutorWalletId
        ? {
            PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_NAME:
              explicitPortfolioManagerOcaExecutorWalletId,
          }
        : resolvedWalletIds.portfolioManagerOcaExecutorWalletId
        ? {
            PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_NAME:
              resolvedWalletIds.portfolioManagerOcaExecutorWalletId,
          }
        : {}),
    },
    emberLendingBaseEnv: {
      ...emberLendingBaseEnv,
      DATABASE_URL: piDatabaseUrl,
      ...(explicitEmberLendingWalletId
        ? {
            EMBER_LENDING_OWS_WALLET_NAME: explicitEmberLendingWalletId,
          }
        : resolvedWalletIds.emberLendingWalletId
        ? {
            EMBER_LENDING_OWS_WALLET_NAME: resolvedWalletIds.emberLendingWalletId,
          }
        : {}),
    },
  };

  if (cli.checkOnly) {
    console.log(
      JSON.stringify(
        {
          sessionRoot: workspace.sessionRoot,
          bundleRoot: workspace.bundleRoot,
          onchainActionsWorktree: workspace.onchainActionsWorktree,
          specRoot: workspace.specRoot,
          logsDir: workspace.logsDir,
          onchainActions: onchainActionsDependency,
          databases: [piDatabase, sharedEmberDatabase],
          plannedPorts: {
            onchainActions: onchainActionsPort,
            sharedEmber: sharedEmberPort,
            web: webPort,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  let onchainActionsServer: StartedProcessService | null = null;
  let sharedEmberServer: Awaited<ReturnType<typeof startManagedSharedEmberHarness>> | null = null;
  let portfolioManagerServer: Awaited<ReturnType<typeof startWorkspaceAgentServer>> | null = null;
  let emberLendingServer: Awaited<ReturnType<typeof startWorkspaceAgentServer>> | null = null;
  let webServer: StartedProcessService | null = null;

  try {
    onchainActionsServer =
      explicitOnchainActionsApiUrl !== null
        ? {
            label: 'onchain-actions',
            baseUrl: onchainActionsBaseUrl,
            reused: true,
            close: async () => undefined,
          }
        : onchainActionsPort?.reused
        ? {
            label: 'onchain-actions',
            baseUrl: onchainActionsBaseUrl,
            reused: true,
            close: async () => undefined,
          }
        : await startCommandServer({
            label: 'onchain-actions',
            cwd: workspace.onchainActionsWorktree ?? workspace.webAgUiRoot,
            command: 'pnpm',
            args: ['dev'],
            env: {
              ...onchainActionsBaseEnv,
              PORT: String(onchainActionsPort?.port ?? preferredOnchainActionsPort),
            },
            baseUrl: onchainActionsBaseUrl,
            healthPath: '/health',
            logFilePath: path.join(workspace.logsDir, 'onchain-actions.log'),
          });

    const preAgentOverrides = buildWalletQaEnvironmentOverrides({
      ...managedBaseEnvs,
      specRoot: workspace.specRoot,
      sharedEmberDatabaseUrl,
      portfolioManagerOwsVaultPath: workspace.portfolioManagerOwsVaultPath,
      emberLendingOwsVaultPath: workspace.emberLendingOwsVaultPath,
      sharedEmberBaseUrl,
      portfolioManagerBaseUrl: '',
      emberLendingBaseUrl: '',
      onchainActionsApiUrl: onchainActionsBaseUrl,
    });

    Object.assign(process.env, preAgentOverrides.sharedEmberEnv);
    sharedEmberServer = await startManagedSharedEmberHarness({
      specRoot: workspace.specRoot,
      vibekitRoot: workspace.vibekitRoot,
      managedAgentId: 'ember-lending',
      host: HOST,
      port: sharedEmberPort.port,
    });

    portfolioManagerServer = await startWorkspaceAgentServer({
      cwd: path.join(workspace.webAgUiRoot, 'apps/agent-portfolio-manager'),
      env: preAgentOverrides.portfolioManagerEnv,
      label: 'agent-portfolio-manager',
      basePath: '/ag-ui',
    });

    const preWebOverrides = buildWalletQaEnvironmentOverrides({
      ...managedBaseEnvs,
      specRoot: workspace.specRoot,
      sharedEmberDatabaseUrl,
      portfolioManagerOwsVaultPath: workspace.portfolioManagerOwsVaultPath,
      emberLendingOwsVaultPath: workspace.emberLendingOwsVaultPath,
      sharedEmberBaseUrl: sharedEmberServer.baseUrl,
      portfolioManagerBaseUrl: portfolioManagerServer.baseUrl,
      emberLendingBaseUrl: '',
      onchainActionsApiUrl: onchainActionsBaseUrl,
    });

    emberLendingServer = await startWorkspaceAgentServer({
      cwd: path.join(workspace.webAgUiRoot, 'apps/agent-ember-lending'),
      env: preWebOverrides.emberLendingEnv,
      label: 'agent-ember-lending',
      basePath: '/ag-ui',
    });

    const finalOverrides = buildWalletQaEnvironmentOverrides({
      ...managedBaseEnvs,
      specRoot: workspace.specRoot,
      sharedEmberDatabaseUrl,
      portfolioManagerOwsVaultPath: workspace.portfolioManagerOwsVaultPath,
      emberLendingOwsVaultPath: workspace.emberLendingOwsVaultPath,
      sharedEmberBaseUrl: sharedEmberServer.baseUrl,
      portfolioManagerBaseUrl: portfolioManagerServer.baseUrl,
      emberLendingBaseUrl: emberLendingServer.baseUrl,
      onchainActionsApiUrl: onchainActionsBaseUrl,
    });

    await runLoggedCommand({
      label: 'apps/web build',
      cwd: path.join(workspace.webAgUiRoot, 'apps/web'),
      command: webServerPlan.buildCommand.command,
      args: webServerPlan.buildCommand.args,
      env: finalOverrides.webEnv,
      logFilePath: path.join(workspace.logsDir, 'apps-web.log'),
    });

    webServer = await startCommandServer({
      label: 'apps/web',
      cwd: path.join(workspace.webAgUiRoot, 'apps/web'),
      command: webServerPlan.startCommand.command,
      args: webServerPlan.startCommand.args,
      env: finalOverrides.webEnv,
      baseUrl: `http://${HOST}:${webPort.port}`,
      healthPath: '/',
      logFilePath: path.join(workspace.logsDir, 'apps-web.log'),
    });

    console.log(
      `READY ${JSON.stringify({
        logsDir: workspace.logsDir,
        onchainActionsBaseUrl: onchainActionsServer.baseUrl,
        sharedEmberBaseUrl: sharedEmberServer.baseUrl,
        portfolioManagerBaseUrl: portfolioManagerServer.baseUrl,
        emberLendingBaseUrl: emberLendingServer.baseUrl,
        webBaseUrl: webServer.baseUrl,
      })}`,
    );

    await waitForShutdownSignal();
  } finally {
    await webServer?.close().catch(() => undefined);
    await emberLendingServer?.close().catch(() => undefined);
    await portfolioManagerServer?.close().catch(() => undefined);
    await sharedEmberServer?.close().catch(() => undefined);
    await onchainActionsServer?.close().catch(() => undefined);
  }
}

void main().catch((error: unknown) => {
  console.error(toErrorMessage(error));
  process.exit(1);
});
