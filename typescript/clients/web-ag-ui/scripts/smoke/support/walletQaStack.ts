import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type WalletQaWorkspace = {
  forgeRoot: string;
  sessionRoot: string;
  vibekitRoot: string;
  webAgUiRoot: string;
  bundleRoot: string;
  onchainActionsWorktree: string | null;
  specRoot: string;
  logsDir: string;
  webEnvFilePath: string;
  portfolioManagerEnvFilePath: string;
  emberLendingEnvFilePath: string;
  onchainActionsEnvFilePath: string;
  sharedEmberManagedOnboardingBootstrapPath: string;
  portfolioManagerOwsVaultPath: string;
  emberLendingOwsVaultPath: string;
};

export type WalletQaEnvironmentOverrides = {
  sharedEmberEnv: Record<string, string>;
  portfolioManagerEnv: Record<string, string>;
  emberLendingEnv: Record<string, string>;
  webEnv: Record<string, string>;
};

export type WalletQaCommandPlan = {
  command: string;
  args: string[];
};

export type WalletQaWebServerPlan = {
  buildCommand: WalletQaCommandPlan;
  startCommand: WalletQaCommandPlan;
};

export type OwsWalletRecord = {
  id: string;
  name: string | null;
  createdAt: string | null;
  address: string | null;
};

function readExistingDirectory(dirPath: string | undefined): string | null {
  if (typeof dirPath !== 'string' || dirPath.trim().length === 0) {
    return null;
  }

  const resolved = path.resolve(dirPath.trim());
  return existsSync(resolved) ? resolved : null;
}

function hasWalletQaBundleFiles(bundleRoot: string): boolean {
  return [
    path.join(bundleRoot, 'vibekit/web.env'),
    path.join(bundleRoot, 'vibekit/agent-portfolio-manager.env'),
    path.join(bundleRoot, 'vibekit/agent-ember-lending.env'),
    path.join(bundleRoot, 'onchain-actions/.env'),
  ].every((candidate) => existsSync(candidate));
}

export function findSessionRoot(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (path.basename(current) === 'worktrees') {
      return path.dirname(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function findForgeRoot(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(current, 'sessions')) && existsSync(path.join(current, 'repos'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function resolveSinglePrefixedDirectory(parentDir: string, prefix: string): string | null {
  if (!existsSync(parentDir)) {
    return null;
  }

  const matches = readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === prefix || name.startsWith(`${prefix}-`))
    .sort();

  if (matches.length !== 1) {
    return null;
  }

  return path.join(parentDir, matches[0]!);
}

export function findWalletQaBundleRoot(runtimeRoot: string): string | null {
  const resolvedRuntimeRoot = path.resolve(runtimeRoot);
  if (!existsSync(resolvedRuntimeRoot)) {
    return null;
  }

  if (hasWalletQaBundleFiles(resolvedRuntimeRoot)) {
    return resolvedRuntimeRoot;
  }

  const matches = readdirSync(resolvedRuntimeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(resolvedRuntimeRoot, entry.name))
    .filter(hasWalletQaBundleFiles)
    .sort();

  if (matches.length !== 1) {
    return null;
  }

  return matches[0]!;
}

export function resolveWalletQaWorkspace(input: {
  webAgUiRoot: string;
  bundleRoot?: string;
  onchainActionsWorktreeDir?: string;
  specRoot?: string;
  allowMissingOnchainActionsWorktree?: boolean;
}): WalletQaWorkspace {
  const webAgUiRoot = path.resolve(input.webAgUiRoot);
  const vibekitRoot = path.resolve(webAgUiRoot, '..', '..', '..');
  const sessionRoot = findSessionRoot(vibekitRoot);
  if (!sessionRoot) {
    throw new Error(`Unable to resolve session root from ${webAgUiRoot}.`);
  }

  const forgeRoot = findForgeRoot(sessionRoot);
  if (!forgeRoot) {
    throw new Error(`Unable to resolve Forge root from ${sessionRoot}.`);
  }

  const worktreesRoot = path.join(sessionRoot, 'worktrees');
  const bundleRoot =
    readExistingDirectory(input.bundleRoot) ??
    findWalletQaBundleRoot(path.join(sessionRoot, 'runtime'));
  if (!bundleRoot) {
    throw new Error(
      `Unable to resolve the extracted wallet QA bundle under ${path.join(sessionRoot, 'runtime')}.`,
    );
  }

  const onchainActionsWorktree =
    readExistingDirectory(input.onchainActionsWorktreeDir) ??
    resolveSinglePrefixedDirectory(worktreesRoot, 'onchain-actions');
  if (!onchainActionsWorktree && !input.allowMissingOnchainActionsWorktree) {
    throw new Error(
      `Unable to resolve a single onchain-actions worktree under ${worktreesRoot}.`,
    );
  }

  const specRoot =
    readExistingDirectory(input.specRoot) ??
    resolveSinglePrefixedDirectory(worktreesRoot, 'ember-orchestration-v1-spec') ??
    readExistingDirectory(path.join(forgeRoot, 'repos/ember-orchestration-v1-spec'));
  if (!specRoot) {
    throw new Error(
      'Unable to resolve ember-orchestration-v1-spec. Set EMBER_ORCHESTRATION_V1_SPEC_ROOT or provide WALLET_QA_SPEC_ROOT.',
    );
  }

  return {
    forgeRoot,
    sessionRoot,
    vibekitRoot,
    webAgUiRoot,
    bundleRoot,
    onchainActionsWorktree,
    specRoot,
    logsDir: path.join(sessionRoot, 'runtime/wallet-qa-stack/logs'),
    webEnvFilePath: path.join(bundleRoot, 'vibekit/web.env'),
    portfolioManagerEnvFilePath: path.join(bundleRoot, 'vibekit/agent-portfolio-manager.env'),
    emberLendingEnvFilePath: path.join(bundleRoot, 'vibekit/agent-ember-lending.env'),
    onchainActionsEnvFilePath: path.join(bundleRoot, 'onchain-actions/.env'),
    sharedEmberManagedOnboardingBootstrapPath: path.join(
      bundleRoot,
      'shared-ember/shared-ember-managed-onboarding.ember-lending.json',
    ),
    portfolioManagerOwsVaultPath: path.join(bundleRoot, 'runtime/ows/portfolio-manager'),
    emberLendingOwsVaultPath: path.join(bundleRoot, 'runtime/ows/ember-lending'),
  };
}

export function applyProcessEnvironmentOverrides(
  baseEnv: Record<string, string>,
  processEnv: NodeJS.ProcessEnv,
  overrideKeys: readonly string[],
): Record<string, string> {
  const overrides = Object.fromEntries(
    overrideKeys
      .map((key) => {
        const value = processEnv[key];
        return typeof value === 'string' && value.trim().length > 0 ? [key, value.trim()] : null;
      })
      .filter((entry): entry is [string, string] => entry !== null),
  );

  return {
    ...baseEnv,
    ...overrides,
  };
}

export function buildWalletQaEnvironmentOverrides(input: {
  specRoot: string;
  sharedEmberDatabaseUrl: string;
  portfolioManagerOwsVaultPath: string;
  emberLendingOwsVaultPath: string;
  sharedEmberBaseUrl: string;
  portfolioManagerBaseUrl: string;
  emberLendingBaseUrl: string;
  onchainActionsApiUrl: string;
  webBaseEnv: Record<string, string>;
  portfolioManagerBaseEnv: Record<string, string>;
  emberLendingBaseEnv: Record<string, string>;
}): WalletQaEnvironmentOverrides {
  const sharedEmberEnv: Record<string, string> = {
    EMBER_ORCHESTRATION_V1_SPEC_ROOT: input.specRoot,
    ONCHAIN_ACTIONS_API_URL: input.onchainActionsApiUrl,
    SHARED_EMBER_PROTOCOL_REFERENCE_BOOTSTRAP_JSON: JSON.stringify({
      persistence: {
        kind: 'postgres',
        connectionString: input.sharedEmberDatabaseUrl,
      },
    }),
    PORTFOLIO_MANAGER_OWS_VAULT_PATH: input.portfolioManagerOwsVaultPath,
    EMBER_LENDING_OWS_VAULT_PATH: input.emberLendingOwsVaultPath,
  };

  if (input.portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OWS_WALLET_NAME) {
    sharedEmberEnv.PORTFOLIO_MANAGER_OWS_WALLET_NAME =
      input.portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OWS_WALLET_NAME;
  }
  if (input.portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_NAME) {
    sharedEmberEnv.PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_NAME =
      input.portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_NAME;
    sharedEmberEnv.PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_VAULT_PATH =
      input.portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_VAULT_PATH ??
      input.portfolioManagerOwsVaultPath;
  }
  if (input.emberLendingBaseEnv.EMBER_LENDING_OWS_WALLET_NAME) {
    sharedEmberEnv.EMBER_LENDING_OWS_WALLET_NAME =
      input.emberLendingBaseEnv.EMBER_LENDING_OWS_WALLET_NAME;
  }

  return {
    sharedEmberEnv,
    portfolioManagerEnv: {
      ...input.portfolioManagerBaseEnv,
      SHARED_EMBER_BASE_URL: input.sharedEmberBaseUrl,
      ONCHAIN_ACTIONS_API_URL: input.onchainActionsApiUrl,
      PORTFOLIO_MANAGER_OWS_VAULT_PATH: input.portfolioManagerOwsVaultPath,
      ...(input.portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_NAME
        ? {
            PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_VAULT_PATH:
              input.portfolioManagerBaseEnv.PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_VAULT_PATH ??
              input.portfolioManagerOwsVaultPath,
          }
        : {}),
    },
    emberLendingEnv: {
      ...input.emberLendingBaseEnv,
      SHARED_EMBER_BASE_URL: input.sharedEmberBaseUrl,
      PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL: input.portfolioManagerBaseUrl,
      ONCHAIN_ACTIONS_API_URL: input.onchainActionsApiUrl,
      EMBER_LENDING_OWS_VAULT_PATH: input.emberLendingOwsVaultPath,
    },
    webEnv: {
      ...input.webBaseEnv,
      ONCHAIN_ACTIONS_API_URL: input.onchainActionsApiUrl,
      NEXT_PUBLIC_ONCHAIN_ACTIONS_API_URL: input.onchainActionsApiUrl,
      PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL: input.portfolioManagerBaseUrl,
      EMBER_LENDING_AGENT_DEPLOYMENT_URL: input.emberLendingBaseUrl,
    },
  };
}

export function resolveWalletQaWebServerPlan(input: {
  host: string;
  port: number;
}): WalletQaWebServerPlan {
  return {
    buildCommand: {
      command: 'pnpm',
      args: ['build'],
    },
    startCommand: {
      command: 'pnpm',
      args: ['exec', 'next', 'start', '--hostname', input.host, '--port', String(input.port)],
    },
  };
}

function normalizeAddress(value: string | null): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function toTimestamp(value: string | null): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function readOwsWalletRecords(vaultDir: string): OwsWalletRecord[] {
  if (!existsSync(vaultDir)) {
    return [];
  }

  return readdirSync(vaultDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(vaultDir, entry.name))
    .map((filePath) => JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>)
    .map((raw) => ({
      id: typeof raw.id === 'string' ? raw.id : '',
      name: typeof raw.name === 'string' ? raw.name : null,
      createdAt: typeof raw.created_at === 'string' ? raw.created_at : null,
      address:
        Array.isArray(raw.accounts) &&
        raw.accounts[0] &&
        typeof raw.accounts[0] === 'object' &&
        raw.accounts[0] !== null &&
        typeof (raw.accounts[0] as Record<string, unknown>).address === 'string'
          ? ((raw.accounts[0] as Record<string, unknown>).address as string)
          : null,
    }))
    .filter((wallet) => wallet.id.length > 0);
}

export function resolveManagedWalletIds(input: {
  portfolioManagerWallets: OwsWalletRecord[];
  emberLendingWallets: OwsWalletRecord[];
  portfolioManagerWalletName: string | null;
  portfolioManagerOcaExecutorWalletName?: string | null;
  emberLendingWalletName: string | null;
  controllerSignerAddress?: string | null;
}): {
  portfolioManagerWalletId: string | null;
  portfolioManagerOcaExecutorWalletId: string | null;
  emberLendingWalletId: string | null;
} {
  const portfolioManagerCandidates =
    input.portfolioManagerWalletName === null
      ? []
      : input.portfolioManagerWallets.filter(
          (wallet) => wallet.name === input.portfolioManagerWalletName,
        );
  let selectedPortfolioManager = portfolioManagerCandidates[0] ?? null;

  if (portfolioManagerCandidates.length > 1) {
    const controllerSignerAddress = normalizeAddress(input.controllerSignerAddress ?? null);
    selectedPortfolioManager =
      portfolioManagerCandidates.find(
        (wallet) => normalizeAddress(wallet.address) === controllerSignerAddress,
      ) ?? null;
    if (!selectedPortfolioManager) {
      throw new Error(
        `Unable to disambiguate portfolio-manager wallet "${input.portfolioManagerWalletName}".`,
      );
    }
  }

  const explicitOcaExecutorWallet =
    input.portfolioManagerOcaExecutorWalletName === null ||
    input.portfolioManagerOcaExecutorWalletName === undefined
      ? null
      : input.portfolioManagerWallets.find(
          (wallet) =>
            wallet.id === input.portfolioManagerOcaExecutorWalletName ||
            wallet.name === input.portfolioManagerOcaExecutorWalletName,
        ) ?? null;
  const inferredOcaExecutorWallet =
    explicitOcaExecutorWallet ??
    (input.portfolioManagerOcaExecutorWalletName === undefined &&
    portfolioManagerCandidates.length > 1
      ? portfolioManagerCandidates.find(
          (wallet) => wallet.id !== selectedPortfolioManager?.id,
        ) ?? null
      : null);

  const emberLendingCandidates =
    input.emberLendingWalletName === null
      ? []
      : input.emberLendingWallets.filter((wallet) => wallet.name === input.emberLendingWalletName);
  let selectedEmberLending = emberLendingCandidates[0] ?? null;

  if (emberLendingCandidates.length > 1) {
    const portfolioManagerTimestamp = toTimestamp(selectedPortfolioManager?.createdAt ?? null);
    if (portfolioManagerTimestamp === null) {
      throw new Error(
        `Unable to disambiguate ember-lending wallet "${input.emberLendingWalletName}" without a paired portfolio-manager timestamp.`,
      );
    }

    selectedEmberLending =
      [...emberLendingCandidates]
        .map((wallet) => ({
          wallet,
          distance:
            toTimestamp(wallet.createdAt) === null
              ? Number.POSITIVE_INFINITY
              : Math.abs((toTimestamp(wallet.createdAt) as number) - portfolioManagerTimestamp),
        }))
        .sort((left, right) => left.distance - right.distance)[0]?.wallet ?? null;

    if (!selectedEmberLending || !Number.isFinite(
      Math.abs((toTimestamp(selectedEmberLending.createdAt) as number) - portfolioManagerTimestamp),
    )) {
      throw new Error(
        `Unable to disambiguate ember-lending wallet "${input.emberLendingWalletName}".`,
      );
    }
  }

  return {
    portfolioManagerWalletId: selectedPortfolioManager?.id ?? null,
    portfolioManagerOcaExecutorWalletId: inferredOcaExecutorWallet?.id ?? null,
    emberLendingWalletId: selectedEmberLending?.id ?? null,
  };
}
