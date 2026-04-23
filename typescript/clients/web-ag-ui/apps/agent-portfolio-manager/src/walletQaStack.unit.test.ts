import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyProcessEnvironmentOverrides,
  buildWalletQaEnvironmentOverrides,
  resolveManagedWalletIds,
  resolveWalletQaWebServerPlan,
  resolveWalletQaWorkspace,
} from '../../../scripts/smoke/support/walletQaStack.js';

function ensureDir(dirPath: string) {
  mkdirSync(dirPath, { recursive: true });
}

function touch(filePath: string, contents = '') {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, contents, 'utf8');
}

describe('resolveWalletQaWorkspace', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('auto-discovers the session bundle, onchain-actions worktree, and spec repo fallback', () => {
    const forgeRoot = mkdtempSync(path.join(os.tmpdir(), 'wallet-qa-stack-'));
    tempDirs.push(forgeRoot);

    const sessionRoot = path.join(
      forgeRoot,
      'sessions/i627-wallet-onchain-reconciliation',
    );
    const vibekitWorktree = path.join(
      sessionRoot,
      'worktrees/arbitrum-vibekit-i627-wallet-onchain-reconciliation',
    );
    const webAgUiRoot = path.join(vibekitWorktree, 'typescript/clients/web-ag-ui');
    const onchainActionsWorktree = path.join(
      sessionRoot,
      'worktrees/onchain-actions-i627-aave-wallet-balances',
    );
    const bundleRoot = path.join(sessionRoot, 'runtime/i617-local-stack-env-and-ows');
    const specRoot = path.join(forgeRoot, 'repos/ember-orchestration-v1-spec');

    ensureDir(webAgUiRoot);
    ensureDir(onchainActionsWorktree);
    touch(path.join(bundleRoot, 'vibekit/web.env'));
    touch(path.join(bundleRoot, 'vibekit/agent-portfolio-manager.env'));
    touch(path.join(bundleRoot, 'vibekit/agent-ember-lending.env'));
    touch(path.join(bundleRoot, 'onchain-actions/.env'));
    touch(path.join(specRoot, 'package.json'), '{}');

    const workspace = resolveWalletQaWorkspace({
      webAgUiRoot,
    });

    expect(workspace).toMatchObject({
      sessionRoot,
      bundleRoot,
      onchainActionsWorktree,
      specRoot,
      portfolioManagerOwsVaultPath: path.join(
        bundleRoot,
        'runtime/ows/portfolio-manager',
      ),
      emberLendingOwsVaultPath: path.join(
        bundleRoot,
        'runtime/ows/ember-lending',
      ),
      logsDir: path.join(sessionRoot, 'runtime/wallet-qa-stack/logs'),
    });
    expect(workspace.webEnvFilePath).toBe(path.join(bundleRoot, 'vibekit/web.env'));
    expect(workspace.portfolioManagerEnvFilePath).toBe(
      path.join(bundleRoot, 'vibekit/agent-portfolio-manager.env'),
    );
    expect(workspace.emberLendingEnvFilePath).toBe(
      path.join(bundleRoot, 'vibekit/agent-ember-lending.env'),
    );
    expect(workspace.onchainActionsEnvFilePath).toBe(
      path.join(bundleRoot, 'onchain-actions/.env'),
    );
    expect(workspace.sharedEmberManagedOnboardingBootstrapPath).toBe(
      path.join(bundleRoot, 'shared-ember/shared-ember-managed-onboarding.ember-lending.json'),
    );
  });

  it('allows remote onchain-actions mode without a local onchain-actions worktree', () => {
    const forgeRoot = mkdtempSync(path.join(os.tmpdir(), 'wallet-qa-stack-'));
    tempDirs.push(forgeRoot);

    const sessionRoot = path.join(
      forgeRoot,
      'sessions/i627-wallet-onchain-reconciliation',
    );
    const vibekitWorktree = path.join(
      sessionRoot,
      'worktrees/arbitrum-vibekit-i627-wallet-onchain-reconciliation',
    );
    const webAgUiRoot = path.join(vibekitWorktree, 'typescript/clients/web-ag-ui');
    const bundleRoot = path.join(sessionRoot, 'runtime/i617-local-stack-env-and-ows');
    const specRoot = path.join(forgeRoot, 'repos/ember-orchestration-v1-spec');

    ensureDir(webAgUiRoot);
    touch(path.join(bundleRoot, 'vibekit/web.env'));
    touch(path.join(bundleRoot, 'vibekit/agent-portfolio-manager.env'));
    touch(path.join(bundleRoot, 'vibekit/agent-ember-lending.env'));
    touch(path.join(bundleRoot, 'onchain-actions/.env'));
    touch(path.join(specRoot, 'package.json'), '{}');

    const workspace = resolveWalletQaWorkspace({
      webAgUiRoot,
      allowMissingOnchainActionsWorktree: true,
    });

    expect(workspace.onchainActionsWorktree).toBeNull();
    expect(workspace.onchainActionsEnvFilePath).toBe(path.join(bundleRoot, 'onchain-actions/.env'));
  });
});

describe('applyProcessEnvironmentOverrides', () => {
  it('lets explicit process env values override archived env entries', () => {
    expect(
      applyProcessEnvironmentOverrides(
        {
          OPENROUTER_API_KEY: 'archived-openrouter-key',
          NEXT_PUBLIC_PRIVY_APP_ID: 'archived-privy-app-id',
        },
        {
          OPENROUTER_API_KEY: 'live-openrouter-key',
          NEXT_PUBLIC_PRIVY_APP_ID: '',
        },
        ['OPENROUTER_API_KEY', 'NEXT_PUBLIC_PRIVY_APP_ID'],
      ),
    ).toEqual({
      OPENROUTER_API_KEY: 'live-openrouter-key',
      NEXT_PUBLIC_PRIVY_APP_ID: 'archived-privy-app-id',
    });
  });
});

describe('buildWalletQaEnvironmentOverrides', () => {
  it('rewrites runtime endpoints and vault paths without dropping base env values', () => {
    const overrides = buildWalletQaEnvironmentOverrides({
      specRoot: '/tmp/ember-orchestration-v1-spec',
      sharedEmberDatabaseUrl: 'postgresql://ember:ember@127.0.0.1:55433/ember',
      portfolioManagerOwsVaultPath: '/tmp/runtime/ows/portfolio-manager',
      emberLendingOwsVaultPath: '/tmp/runtime/ows/ember-lending',
      sharedEmberBaseUrl: 'http://127.0.0.1:4011',
      portfolioManagerBaseUrl: 'http://127.0.0.1:3421/ag-ui',
      emberLendingBaseUrl: 'http://127.0.0.1:3431/ag-ui',
      onchainActionsApiUrl: 'http://127.0.0.1:50051',
      webBaseEnv: {
        NEXT_PUBLIC_PRIVY_APP_ID: 'privy-app-id',
        NEXT_PUBLIC_ONCHAIN_ACTIONS_API_URL: 'http://127.0.0.1:50061',
      },
      portfolioManagerBaseEnv: {
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
        PORTFOLIO_MANAGER_OWS_WALLET_NAME: 'portfolio-manager-controller-wallet',
      },
      emberLendingBaseEnv: {
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
        EMBER_LENDING_OWS_WALLET_NAME: 'ember-lending-service-wallet',
      },
    });

    expect(overrides.webEnv).toMatchObject({
      NEXT_PUBLIC_PRIVY_APP_ID: 'privy-app-id',
      ONCHAIN_ACTIONS_API_URL: 'http://127.0.0.1:50051',
      NEXT_PUBLIC_ONCHAIN_ACTIONS_API_URL: 'http://127.0.0.1:50051',
      PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL: 'http://127.0.0.1:3421/ag-ui',
      EMBER_LENDING_AGENT_DEPLOYMENT_URL: 'http://127.0.0.1:3431/ag-ui',
    });
    expect(overrides.portfolioManagerEnv).toMatchObject({
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      SHARED_EMBER_BASE_URL: 'http://127.0.0.1:4011',
      ONCHAIN_ACTIONS_API_URL: 'http://127.0.0.1:50051',
      PORTFOLIO_MANAGER_OWS_WALLET_NAME: 'portfolio-manager-controller-wallet',
      PORTFOLIO_MANAGER_OWS_VAULT_PATH: '/tmp/runtime/ows/portfolio-manager',
    });
    expect(overrides.emberLendingEnv).toMatchObject({
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      SHARED_EMBER_BASE_URL: 'http://127.0.0.1:4011',
      PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL: 'http://127.0.0.1:3421/ag-ui',
      ONCHAIN_ACTIONS_API_URL: 'http://127.0.0.1:50051',
      EMBER_LENDING_OWS_WALLET_NAME: 'ember-lending-service-wallet',
      EMBER_LENDING_OWS_VAULT_PATH: '/tmp/runtime/ows/ember-lending',
    });
    expect(overrides.sharedEmberEnv).toMatchObject({
      EMBER_ORCHESTRATION_V1_SPEC_ROOT: '/tmp/ember-orchestration-v1-spec',
      ONCHAIN_ACTIONS_API_URL: 'http://127.0.0.1:50051',
      PORTFOLIO_MANAGER_OWS_VAULT_PATH: '/tmp/runtime/ows/portfolio-manager',
      EMBER_LENDING_OWS_VAULT_PATH: '/tmp/runtime/ows/ember-lending',
    });
    expect(JSON.parse(overrides.sharedEmberEnv.SHARED_EMBER_PROTOCOL_REFERENCE_BOOTSTRAP_JSON))
      .toEqual({
        persistence: {
          kind: 'postgres',
          connectionString: 'postgresql://ember:ember@127.0.0.1:55433/ember',
        },
      });
  });
});

describe('resolveManagedWalletIds', () => {
  it('uses the controller signer address and paired timestamps to disambiguate duplicate wallet names', () => {
    const resolved = resolveManagedWalletIds({
      portfolioManagerWallets: [
        {
          id: 'older-controller',
          name: 'portfolio-manager-controller-wallet',
          createdAt: '2026-04-05T22:18:20.216Z',
          address: '0x4f632fdF182e3cA03cF0e116DbbF0EF9208FE9e8',
        },
        {
          id: 'newer-controller',
          name: 'portfolio-manager-controller-wallet',
          createdAt: '2026-04-15T01:16:36.952Z',
          address: '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
        },
      ],
      emberLendingWallets: [
        {
          id: 'older-lending',
          name: 'ember-lending-service-wallet',
          createdAt: '2026-04-05T22:18:20.381Z',
          address: '0xAF68877C0C510AEc08A8BF0E1961B7FC43dD5e07',
        },
        {
          id: 'newer-lending',
          name: 'ember-lending-service-wallet',
          createdAt: '2026-04-15T01:16:37.109Z',
          address: '0x5d46aC553A974ef992A08eeef0A05990802F01F6',
        },
      ],
      portfolioManagerWalletName: 'portfolio-manager-controller-wallet',
      emberLendingWalletName: 'ember-lending-service-wallet',
      controllerSignerAddress: '0x4f632fdF182e3cA03cF0e116DbbF0EF9208FE9e8',
    });

    expect(resolved).toEqual({
      portfolioManagerWalletId: 'older-controller',
      emberLendingWalletId: 'older-lending',
    });
  });
});

describe('resolveWalletQaWebServerPlan', () => {
  it('builds the web app before starting Next in production mode', () => {
    expect(
      resolveWalletQaWebServerPlan({
        host: '127.0.0.1',
        port: 3000,
      }),
    ).toEqual({
      buildCommand: {
        command: 'pnpm',
        args: ['build'],
      },
      startCommand: {
        command: 'pnpm',
        args: ['exec', 'next', 'start', '--hostname', '127.0.0.1', '--port', '3000'],
      },
    });
  });
});
