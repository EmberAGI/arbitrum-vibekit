import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

type RuntimeGatewayService = {
  stop: () => Promise<void>;
};

type StartedServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

type StartedAgUiServer = StartedServer & {
  service: RuntimeGatewayService;
};

type StartedChildProcessServer = StartedServer;

const DEFAULT_MANAGED_AGENT_ID = 'ember-lending';
const DEFAULT_OWS_CHAIN = 'evm';
const MAX_DECIMAL_TYPED_DATA_BIGINT = 1n << 128n;
const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readHexAddress(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized?.startsWith('0x') ? (normalized.toLowerCase() as `0x${string}`) : null;
}

export function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const entries: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key.length > 0) {
      entries[key] = value;
    }
  }

  return entries;
}

function normalizeHexSignature(value: string): `0x${string}` {
  const normalized = value.trim();
  if (normalized.startsWith('0x')) {
    return normalized.toLowerCase() as `0x${string}`;
  }
  if (!/^[0-9a-fA-F]+$/u.test(normalized)) {
    throw new Error('Managed onboarding issuer returned a non-hex signature.');
  }
  return `0x${normalized.toLowerCase()}` as `0x${string}`;
}

function serializeTypedDataJson(typedData: unknown): string {
  return JSON.stringify(typedData, (_key, value: unknown) =>
    typeof value === 'bigint'
      ? value >= MAX_DECIMAL_TYPED_DATA_BIGINT
        ? (() => {
            const hex = value.toString(16);
            return `0x${hex.length % 2 === 0 ? hex : `0${hex}`}`;
          })()
        : value.toString()
      : value,
  );
}

function normalizeOwsTypedData(typedData: unknown): unknown {
  if (
    typedData === null ||
    typeof typedData !== 'object' ||
    !('types' in typedData) ||
    typedData.types === null ||
    typeof typedData.types !== 'object'
  ) {
    return typedData;
  }

  const types = typedData.types as Record<string, unknown>;
  if (Array.isArray(types['EIP712Domain'])) {
    return typedData;
  }

  return {
    ...typedData,
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      ...types,
    },
  };
}

function resolveRpcUrl(chainId: number): string {
  switch (chainId) {
    case 42161:
      return process.env.ARBITRUM_RPC_URL?.trim() || 'https://arb1.arbitrum.io/rpc';
    case 8453:
      return process.env.BASE_CHAIN_RPC_URL?.trim() || 'https://mainnet.base.org';
    case 1:
      return process.env.ETHEREUM_RPC_URL?.trim() || 'https://eth.llamarpc.com';
    default:
      throw new Error(`Unsupported managed onboarding issuer chain id ${chainId}.`);
  }
}

async function maybeCreateManagedOnboardingIssuers(input: {
  specRoot: string;
  vibekitRoot: string;
  managedAgentId: string;
}) {
  const portfolioManagerEnv = parseDotEnvFile(
    path.join(
      input.vibekitRoot,
      'typescript/clients/web-ag-ui/apps/agent-portfolio-manager/.env',
    ),
  );
  const controllerWalletName =
    readString(process.env.PORTFOLIO_MANAGER_OWS_WALLET_NAME) ??
    readString(portfolioManagerEnv.PORTFOLIO_MANAGER_OWS_WALLET_NAME);
  const controllerVaultPath =
    readString(process.env.PORTFOLIO_MANAGER_OWS_VAULT_PATH) ??
    readString(portfolioManagerEnv.PORTFOLIO_MANAGER_OWS_VAULT_PATH);
  const controllerPassphrase =
    readString(process.env.PORTFOLIO_MANAGER_OWS_PASSPHRASE) ??
    readString(portfolioManagerEnv.PORTFOLIO_MANAGER_OWS_PASSPHRASE) ??
    undefined;

  if (!controllerWalletName) {
    return undefined;
  }

  const portfolioManagerAppRoot = path.join(
    input.vibekitRoot,
    'typescript/clients/web-ag-ui/apps/agent-portfolio-manager',
  );
  const requireFromPortfolioManager = createRequire(
    path.join(portfolioManagerAppRoot, 'package.json'),
  );
  const { getWallet, signTypedData: signTypedDataWithOwsCore } = requireFromPortfolioManager(
    '@open-wallet-standard/core',
  ) as {
    getWallet: (walletName: string, vaultPath?: string) => {
      accounts: Array<{ address?: string; chainId?: string }>;
    };
    signTypedData: (
      walletName: string,
      chain: string,
      typedDataJson: string,
      passphrase?: string,
      _unused?: unknown,
      vaultPath?: string,
    ) => { signature: string };
  };
  const {
    getDeleGatorEnvironment,
    Implementation,
    toMetaMaskSmartAccount,
  } = requireFromPortfolioManager('@metamask/delegation-toolkit') as {
    getDeleGatorEnvironment: (chainId: number) => unknown;
    Implementation: { Hybrid: unknown };
    toMetaMaskSmartAccount: (input: Record<string, unknown>) => Promise<{
      address: `0x${string}`;
      signDelegation(input: {
        delegation: Record<string, unknown>;
        chainId: number;
      }): Promise<`0x${string}`>;
    }>;
  };
  const { createPublicClient, defineChain, http } = requireFromPortfolioManager('viem') as {
    createPublicClient: (input: Record<string, unknown>) => unknown;
    defineChain: (input: Record<string, unknown>) => unknown;
    http: (url: string, options?: Record<string, unknown>) => unknown;
  };

  const wallet = getWallet(controllerWalletName, controllerVaultPath ?? undefined);
  const controllerSignerAddress =
    wallet.accounts
      .map((account) => readHexAddress(account.address))
      .find((address) => address !== null) ?? null;

  if (!controllerSignerAddress) {
    throw new Error(
      `Controller OWS wallet "${controllerWalletName}" did not resolve an EVM address for managed onboarding issuer bootstrap.`,
    );
  }

  const smartAccountByChainId = new Map<
    number,
    Promise<{
      address: `0x${string}`;
      signDelegation(input: {
        delegation: Record<string, unknown>;
        chainId: number;
      }): Promise<`0x${string}`>;
    }>
  >();

  const resolveSmartAccount = (chainId: number) => {
    const existing = smartAccountByChainId.get(chainId);
    if (existing) {
      return existing;
    }

    const chain = defineChain({
      id: chainId,
      name: `chain-${chainId}`,
      nativeCurrency: {
        name: 'Native',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [resolveRpcUrl(chainId)],
        },
      },
    });
    const publicClient = createPublicClient({
      chain,
      transport: http(resolveRpcUrl(chainId), {
        retryCount: 0,
      }),
    });
    const smartAccount = toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Hybrid,
      deployParams: [controllerSignerAddress, [], [], []],
      deploySalt: '0x',
      signer: {
        account: {
          address: controllerSignerAddress,
          async signMessage() {
            throw new Error('managed onboarding issuer signer does not sign messages');
          },
          async signTypedData(typedData: unknown) {
            return normalizeHexSignature(
              signTypedDataWithOwsCore(
                controllerWalletName,
                DEFAULT_OWS_CHAIN,
                serializeTypedDataJson(normalizeOwsTypedData(typedData)),
                controllerPassphrase,
                undefined,
                controllerVaultPath ?? undefined,
              ).signature,
            );
          },
        },
      },
      environment: getDeleGatorEnvironment(chainId),
    });

    smartAccountByChainId.set(chainId, smartAccount);
    return smartAccount;
  };

  const owsAdaptersModule = (await import(
    pathToFileURL(path.join(input.specRoot, 'packages/orchestration-ows-adapters/src/index.ts'))
      .href
  )) as {
    createMetaMaskManagedOnboardingIssuer: (input: {
      controllerWallet: string;
      resolveSigner(input: { controllerWallet: string }): Promise<{
        getControllerAddress(): Promise<string> | string;
        signDelegation(input: {
          delegation: Record<string, unknown>;
          chainId: number;
        }): Promise<`0x${string}`>;
      }>;
    }) => Promise<unknown>;
  };

  const initialSmartAccount = await resolveSmartAccount(42161);
  const issuer = await owsAdaptersModule.createMetaMaskManagedOnboardingIssuer({
    controllerWallet: initialSmartAccount.address,
    resolveSigner: async () => ({
      async getControllerAddress() {
        return (await resolveSmartAccount(42161)).address;
      },
      async signDelegation({ delegation, chainId }) {
        return normalizeHexSignature(
          await (await resolveSmartAccount(chainId)).signDelegation({
            delegation,
            chainId,
          }),
        );
      },
    }),
  });

  return {
    [input.managedAgentId]: issuer,
  };
}

async function maybeCreateSubagentRuntimes(input: {
  specRoot: string;
  vibekitRoot: string;
  managedAgentId: string;
}) {
  const portfolioManagerEnv = parseDotEnvFile(
    path.join(
      input.vibekitRoot,
      'typescript/clients/web-ag-ui/apps/agent-portfolio-manager/.env',
    ),
  );
  const controllerWalletName =
    readString(process.env.PORTFOLIO_MANAGER_OWS_WALLET_NAME) ??
    readString(portfolioManagerEnv.PORTFOLIO_MANAGER_OWS_WALLET_NAME);
  const controllerVaultPath =
    readString(process.env.PORTFOLIO_MANAGER_OWS_VAULT_PATH) ??
    readString(portfolioManagerEnv.PORTFOLIO_MANAGER_OWS_VAULT_PATH);
  const controllerPassphrase =
    readString(process.env.PORTFOLIO_MANAGER_OWS_PASSPHRASE) ??
    readString(portfolioManagerEnv.PORTFOLIO_MANAGER_OWS_PASSPHRASE) ??
    undefined;
  const lendingEnv = parseDotEnvFile(
    path.join(input.vibekitRoot, 'typescript/clients/web-ag-ui/apps/agent-ember-lending/.env'),
  );
  const lendingWalletName =
    readString(process.env.EMBER_LENDING_OWS_WALLET_NAME) ??
    readString(lendingEnv.EMBER_LENDING_OWS_WALLET_NAME);
  const lendingVaultPath =
    readString(process.env.EMBER_LENDING_OWS_VAULT_PATH) ??
    readString(lendingEnv.EMBER_LENDING_OWS_VAULT_PATH);

  if (!lendingWalletName) {
    return undefined;
  }

  const lendingAppRoot = path.join(
    input.vibekitRoot,
    'typescript/clients/web-ag-ui/apps/agent-ember-lending',
  );
  const requireFromLending = createRequire(path.join(lendingAppRoot, 'package.json'));
  const { getWallet } = requireFromLending('@open-wallet-standard/core') as {
    getWallet: (walletName: string, vaultPath?: string) => {
      accounts: Array<{ address?: string }>;
    };
  };
  const wallet = getWallet(lendingWalletName, lendingVaultPath ?? undefined);
  const agentWallet =
    wallet.accounts
      .map((account) => readHexAddress(account.address))
      .find((address) => address !== null) ?? null;

  if (!agentWallet) {
    throw new Error(
      `Ember-lending OWS wallet "${lendingWalletName}" did not resolve an EVM address for runtime binding bootstrap.`,
    );
  }

  let refreshIssuer: unknown = {
    async issueDelegation() {
      throw new Error(
        'Repo-local Shared Ember runtime binding could not resolve a controller-backed refresh issuer.',
      );
    },
  };
  if (controllerWalletName) {
    const portfolioManagerAppRoot = path.join(
      input.vibekitRoot,
      'typescript/clients/web-ag-ui/apps/agent-portfolio-manager',
    );
    const requireFromPortfolioManager = createRequire(
      path.join(portfolioManagerAppRoot, 'package.json'),
    );
    const { getWallet, signTypedData: signTypedDataWithOwsCore } = requireFromPortfolioManager(
      '@open-wallet-standard/core',
    ) as {
      getWallet: (walletName: string, vaultPath?: string) => {
        accounts: Array<{ address?: string; chainId?: string }>;
      };
      signTypedData: (
        walletName: string,
        chain: string,
        typedDataJson: string,
        passphrase?: string,
        _unused?: unknown,
        vaultPath?: string,
      ) => { signature: string };
    };
    const {
      getDeleGatorEnvironment,
      Implementation,
      toMetaMaskSmartAccount,
    } = requireFromPortfolioManager('@metamask/delegation-toolkit') as {
      getDeleGatorEnvironment: (chainId: number) => unknown;
      Implementation: { Hybrid: unknown };
      toMetaMaskSmartAccount: (input: Record<string, unknown>) => Promise<{
        address: `0x${string}`;
        signDelegation(input: {
          delegation: Record<string, unknown>;
          chainId: number;
        }): Promise<`0x${string}`>;
      }>;
    };
    const { createPublicClient, defineChain, http } = requireFromPortfolioManager('viem') as {
      createPublicClient: (input: Record<string, unknown>) => unknown;
      defineChain: (input: Record<string, unknown>) => unknown;
      http: (url: string, options?: Record<string, unknown>) => unknown;
    };
    const controllerWallet = getWallet(controllerWalletName, controllerVaultPath ?? undefined);
    const controllerSignerAddress =
      controllerWallet.accounts
        .map((account) => readHexAddress(account.address))
        .find((address) => address !== null) ?? null;

    if (!controllerSignerAddress) {
      throw new Error(
        `Controller OWS wallet "${controllerWalletName}" did not resolve an EVM address for runtime refresh issuer bootstrap.`,
      );
    }

    const smartAccountByChainId = new Map<
      number,
      Promise<{
        address: `0x${string}`;
        signDelegation(input: {
          delegation: Record<string, unknown>;
          chainId: number;
        }): Promise<`0x${string}`>;
      }>
    >();

    const resolveSmartAccount = (chainId: number) => {
      const existing = smartAccountByChainId.get(chainId);
      if (existing) {
        return existing;
      }

      const chain = defineChain({
        id: chainId,
        name: `chain-${chainId}`,
        nativeCurrency: {
          name: 'Native',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: {
          default: {
            http: [resolveRpcUrl(chainId)],
          },
        },
      });
      const publicClient = createPublicClient({
        chain,
        transport: http(resolveRpcUrl(chainId), {
          retryCount: 0,
        }),
      });
      const smartAccount = toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [controllerSignerAddress, [], [], []],
        deploySalt: '0x',
        signer: {
          account: {
            address: controllerSignerAddress,
            async signMessage() {
              throw new Error('runtime refresh issuer signer does not sign messages');
            },
            async signTypedData(typedData: unknown) {
              return normalizeHexSignature(
                signTypedDataWithOwsCore(
                  controllerWalletName,
                  DEFAULT_OWS_CHAIN,
                  serializeTypedDataJson(normalizeOwsTypedData(typedData)),
                  controllerPassphrase,
                  undefined,
                  controllerVaultPath ?? undefined,
                ).signature,
              );
            },
          },
        },
        environment: getDeleGatorEnvironment(chainId),
      });

      smartAccountByChainId.set(chainId, smartAccount);
      return smartAccount;
    };

    const owsAdaptersModule = (await import(
      pathToFileURL(path.join(input.specRoot, 'packages/orchestration-ows-adapters/src/index.ts'))
        .href
    )) as {
      createMetaMaskManagedOnboardingIssuer: (input: {
        controllerWallet: string;
        resolveSigner(input: { controllerWallet: string }): Promise<{
          getControllerAddress(): Promise<string> | string;
          signDelegation(input: {
            delegation: Record<string, unknown>;
            chainId: number;
          }): Promise<`0x${string}`>;
        }>;
      }) => Promise<unknown>;
    };

    const initialSmartAccount = await resolveSmartAccount(42161);
    refreshIssuer = await owsAdaptersModule.createMetaMaskManagedOnboardingIssuer({
      controllerWallet: initialSmartAccount.address,
      resolveSigner: async () => ({
        async getControllerAddress() {
          return (await resolveSmartAccount(42161)).address;
        },
        async signDelegation({ delegation, chainId }) {
          return normalizeHexSignature(
            await (await resolveSmartAccount(chainId)).signDelegation({
              delegation,
              chainId,
            }),
          );
        },
      }),
    });
  }

  const domainModules = (await import(
    pathToFileURL(path.join(input.specRoot, 'packages/orchestration-domain-modules/src/index.ts'))
      .href
  )) as {
    createHttpJsonRpcClient: (input: {
      rpcUrl: string;
      fetchImpl?: typeof fetch;
    }) => unknown;
    createInMemoryPayloadArtifactStore: (input: {
      executionPayloads?: unknown[];
      signedPayloads?: unknown[];
      functionCallPayloads?: unknown[];
    }) => unknown;
    createJsonRpcSignedTransactionSubmissionBackend: (input: {
      rpcClient: unknown;
      settlementProjector: {
        projectConfirmedExecution(input: {
          request: unknown;
          reservation?: unknown;
          sourceUnits?: unknown[];
          requestId: string;
          executionId: string;
          transactionHash: string;
          receipt: unknown;
        }): Promise<unknown[]>;
      };
      maxReceiptPollAttempts?: number;
      waitForNextReceiptPoll?: (attempt: number) => Promise<void>;
    }) => {
      submitSignedTransaction(input: {
        request: unknown;
        payload: unknown;
        delegation: unknown;
        reservation?: unknown;
        sourceUnits?: unknown[];
        signerAddress: string;
        rawTransaction: string;
      }): Promise<unknown>;
    };
  };
  const accountingModule = (await import(
    pathToFileURL(path.join(input.specRoot, 'packages/orchestration-accounting/src/index.ts'))
      .href
  )) as {
    projectLendingExecutionSuccessorPlans: (input: {
      request: unknown;
      sourceUnits: unknown[];
      executionId: string;
      transactionHash: string;
    }) => unknown[];
  };

  const rpcClient = domainModules.createHttpJsonRpcClient({
    rpcUrl: resolveRpcUrl(42161),
  });
  const payloadStore = domainModules.createInMemoryPayloadArtifactStore({
    executionPayloads: [],
  });
  const submissionBackend = domainModules.createJsonRpcSignedTransactionSubmissionBackend({
    rpcClient,
    maxReceiptPollAttempts: 8,
    waitForNextReceiptPoll: async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    },
    settlementProjector: {
      async projectConfirmedExecution({ request, sourceUnits, executionId, transactionHash }) {
        return accountingModule.projectLendingExecutionSuccessorPlans({
          request,
          sourceUnits: sourceUnits ?? [],
          executionId,
          transactionHash,
        });
      },
    },
  });

  return {
    [input.managedAgentId]: {
      agentWallet,
      payloadStore,
      issuer: refreshIssuer,
      delegationClient: {
        async redeemActiveDelegation() {
          throw new Error(
            'Repo-local Shared Ember runtime binding does not redeem delegations directly.',
          );
        },
      },
      chainAdapter: {
        async submitSignedPayload() {
          throw new Error(
            'Repo-local Shared Ember runtime binding does not submit signed payloads directly.',
          );
        },
      },
      submissionBackend,
    },
  };
}

export async function startManagedSharedEmberHarness(input: {
  specRoot: string;
  vibekitRoot: string;
  managedAgentId?: string;
  host?: string;
  port?: number;
}): Promise<StartedServer> {
  const managedAgentId = input.managedAgentId ?? DEFAULT_MANAGED_AGENT_ID;
  const host = input.host ?? '127.0.0.1';
  const port = input.port ?? 0;

  const harnessModule = (await import(
    pathToFileURL(path.join(input.specRoot, 'scripts/shared-domain-service-repo-harness.ts')).href
  )) as {
    startRepoLocalSharedEmberDomainProtocolHttpServer: (input: {
      bootstrap: Record<string, unknown>;
      host?: string;
      port?: number;
    }) => Promise<StartedServer>;
  };
  const bootstrapModule = (await import(
    pathToFileURL(
      path.join(
        input.specRoot,
        'packages/orchestration-domain-integration/src/reference-server-bootstrap.ts',
      ),
    ).href
  )) as {
    resolveSharedEmberReferenceBootstrapFromEnv: () => Record<string, unknown>;
  };

  const bootstrap = bootstrapModule.resolveSharedEmberReferenceBootstrapFromEnv();
  const managedOnboardingIssuers = await maybeCreateManagedOnboardingIssuers({
    specRoot: input.specRoot,
    vibekitRoot: input.vibekitRoot,
    managedAgentId,
  });
  const subagentRuntimes = await maybeCreateSubagentRuntimes({
    specRoot: input.specRoot,
    vibekitRoot: input.vibekitRoot,
    managedAgentId,
  });

  return harnessModule.startRepoLocalSharedEmberDomainProtocolHttpServer({
    bootstrap: {
      ...bootstrap,
      ...(managedOnboardingIssuers === undefined
        ? {}
        : {
            managedOnboardingIssuers: {
              ...((bootstrap.managedOnboardingIssuers as Record<string, unknown> | undefined) ??
                {}),
              ...managedOnboardingIssuers,
            },
          }),
      ...(subagentRuntimes === undefined
        ? {}
        : {
            subagentRuntimes: {
              ...((bootstrap.subagentRuntimes as Record<string, unknown> | undefined) ?? {}),
              ...subagentRuntimes,
            },
          }),
    },
    host,
    port,
  });
}

async function readRequestBody(request: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function toHeaders(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
      continue;
    }

    if (typeof value === 'string') {
      result.set(key, value);
    }
  }

  return result;
}

async function writeNodeResponse(response: Response, target: http.ServerResponse): Promise<void> {
  target.writeHead(response.status, Object.fromEntries(response.headers.entries()));

  if (!response.body) {
    target.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      target.end();
      return;
    }

    target.write(Buffer.from(chunk.value));
  }
}

export async function startAgUiGatewayHttpServer(input: {
  service: RuntimeGatewayService;
  handler: (request: Request) => Promise<Response>;
  basePath?: string;
  host?: string;
  port?: number;
}): Promise<StartedAgUiServer> {
  const host = input.host ?? '127.0.0.1';
  const basePath = input.basePath ?? '/ag-ui';
  const requestedPort = input.port ?? 0;

  const server = http.createServer(async (request, response) => {
    try {
      const origin = `http://${request.headers.host ?? `${host}:${requestedPort}`}`;
      const url = new URL(request.url ?? '/', origin);
      const body = await readRequestBody(request);

      const webRequest = new Request(url, {
        method: request.method,
        headers: toHeaders(request.headers),
        body:
          request.method === 'GET' || request.method === 'HEAD' || body.length === 0
            ? undefined
            : new Uint8Array(body),
      });
      const webResponse = await input.handler(webRequest);
      await writeNodeResponse(webResponse, response);
    } catch (error) {
      response.writeHead(502, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(
        JSON.stringify({
          error: 'ag-ui-server request failed',
          message: error instanceof Error ? error.message : 'Unknown error.',
        }),
      );
    }
  });

  const listeningPort = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve bound AG-UI server address.'));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    service: input.service,
    baseUrl: `http://${host}:${listeningPort}${basePath}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await input.service.stop().catch(() => undefined);
    },
  };
}

async function reserveFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve a free port.')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function startWorkspaceAgentServer(input: {
  cwd: string;
  env: Record<string, string | undefined>;
  label: string;
  basePath?: string;
  startupProbePath?: string;
}): Promise<StartedChildProcessServer> {
  const port = await reserveFreePort();
  const logs: string[] = [];
  const child = spawn(process.execPath, ['./node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
    cwd: input.cwd,
    env: {
      ...process.env,
      ...Object.fromEntries(
        Object.entries(input.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const appendLog = (prefix: string, chunk: Buffer | string) => {
    for (const line of String(chunk).split(/\r?\n/u)) {
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

    const recentLogs = logs.slice(-40).join('\n');
    const summary =
      `${input.label} exited after startup (code=${String(code)}, signal=${String(signal)}).` +
      (recentLogs.length > 0 ? `\n${recentLogs}` : '');
    console.error(summary);
  });

  const probeUrl = `http://127.0.0.1:${port}${input.startupProbePath ?? '/'}`;
  const ready = await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(
        new Error(
          `${input.label} did not become reachable at ${probeUrl}.\n${logs.slice(-20).join('\n')}`,
        ),
      );
    }, 30_000);

    const complete = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    child.once('exit', (code, signal) => {
      complete(() =>
        reject(
          new Error(
            `${input.label} exited before becoming ready (code=${String(code)}, signal=${String(signal)}).\n${logs.slice(-20).join('\n')}`,
          ),
        ),
      );
    });

    const poll = async () => {
      if (settled) {
        return;
      }

      try {
        const response = await fetch(probeUrl);
        if (response.status >= 100) {
          complete(resolve);
          return;
        }
      } catch {
        // Keep polling until timeout or child exit.
      }

      setTimeout(() => {
        void poll();
      }, 250);
    };

    void poll();
  });

  void ready;

  return {
    baseUrl: `http://127.0.0.1:${port}${input.basePath ?? ''}`,
    close: async () => {
      closedByHarness = true;
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }

      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
          }
        }, 3_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}
