import {
  getDeleGatorEnvironment,
  Implementation,
  toMetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import { createPublicClient, http, serializeTransaction } from 'viem';
import { arbitrum } from 'viem/chains';

import {
  signPreparedEvmTransaction,
  type AgentRuntimeSigningService,
} from 'agent-runtime/internal';

export type PortfolioManagerControllerIdentity = {
  signerAddress: `0x${string}`;
  smartAccountAddress: `0x${string}`;
};

type SmartAccountDependencies = {
  createPublicClient?: typeof createPublicClient;
  toMetaMaskSmartAccount?: typeof toMetaMaskSmartAccount;
  getDeleGatorEnvironment?: typeof getDeleGatorEnvironment;
  signPreparedEvmTransaction?: typeof signPreparedEvmTransaction;
};

type PortfolioManagerControllerSmartAccount = Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;

async function createPortfolioManagerControllerSmartAccount(input: {
  signerAddress: `0x${string}`;
  dependencies?: SmartAccountDependencies;
}): Promise<{
  publicClient: ReturnType<typeof createPublicClient>;
  smartAccount: PortfolioManagerControllerSmartAccount;
}> {
  const createPublicClientImpl =
    input.dependencies?.createPublicClient ?? createPublicClient;
  const toMetaMaskSmartAccountImpl =
    input.dependencies?.toMetaMaskSmartAccount ?? toMetaMaskSmartAccount;
  const getDeleGatorEnvironmentImpl =
    input.dependencies?.getDeleGatorEnvironment ?? getDeleGatorEnvironment;
  const publicClient = createPublicClientImpl({
    chain: arbitrum,
    transport: http(arbitrum.rpcUrls.default.http[0]),
  });
  const smartAccount = await toMetaMaskSmartAccountImpl({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [input.signerAddress, [], [], []],
    deploySalt: '0x',
    signer: {
      account: {
        address: input.signerAddress,
        async signMessage() {
          throw new Error('portfolio-manager smart-account address derivation does not sign messages');
        },
        async signTypedData() {
          throw new Error(
            'portfolio-manager smart-account address derivation does not sign typed data',
          );
        },
      },
    },
    environment: getDeleGatorEnvironmentImpl(arbitrum.id),
  });

  return {
    publicClient,
    smartAccount,
  };
}

export async function derivePortfolioManagerControllerSmartAccountAddress(input: {
  signerAddress: `0x${string}`;
  dependencies?: SmartAccountDependencies;
}): Promise<`0x${string}`> {
  const { smartAccount } = await createPortfolioManagerControllerSmartAccount(input);

  return smartAccount.address.toLowerCase() as `0x${string}`;
}

export async function ensurePortfolioManagerControllerSmartAccountDeployed(input: {
  signing: AgentRuntimeSigningService;
  signerRef: string;
  signerAddress: `0x${string}`;
  dependencies?: SmartAccountDependencies;
}): Promise<`0x${string}`> {
  const { publicClient, smartAccount } = await createPortfolioManagerControllerSmartAccount({
    signerAddress: input.signerAddress,
    dependencies: input.dependencies,
  });

  if (await smartAccount.isDeployed()) {
    return smartAccount.address.toLowerCase() as `0x${string}`;
  }

  const { factory, factoryData } = await smartAccount.getFactoryArgs();
  const [nonce, feeEstimate, gas] = await Promise.all([
    publicClient.getTransactionCount({
      address: input.signerAddress,
      blockTag: 'pending',
    }),
    publicClient.estimateFeesPerGas(),
    publicClient.estimateGas({
      account: input.signerAddress,
      to: factory,
      data: factoryData,
      value: 0n,
    }),
  ]);

  const unsignedTransactionHex =
    typeof feeEstimate.maxFeePerGas === 'bigint' &&
    typeof feeEstimate.maxPriorityFeePerGas === 'bigint'
      ? serializeTransaction({
          chainId: arbitrum.id,
          type: 'eip1559',
          nonce,
          gas,
          maxFeePerGas: feeEstimate.maxFeePerGas,
          maxPriorityFeePerGas: feeEstimate.maxPriorityFeePerGas,
          to: factory,
          value: 0n,
          data: factoryData,
        })
      : typeof feeEstimate.gasPrice === 'bigint'
        ? serializeTransaction({
            chainId: arbitrum.id,
            nonce,
            gas,
            gasPrice: feeEstimate.gasPrice,
            to: factory,
            value: 0n,
            data: factoryData,
          })
        : (() => {
            throw new Error(
              'RPC fee estimation did not return a signable gas price or EIP-1559 fee pair.',
            );
          })();

  const signPreparedEvmTransactionImpl =
    input.dependencies?.signPreparedEvmTransaction ?? signPreparedEvmTransaction;
  const signedDeployment = await signPreparedEvmTransactionImpl({
    signing: input.signing,
    signerRef: input.signerRef,
    expectedAddress: input.signerAddress,
    chain: 'evm',
    unsignedTransactionHex,
    context: {
      threadId: 'portfolio-manager-startup',
    },
  });
  const hash = await publicClient.request({
    method: 'eth_sendRawTransaction',
    params: [signedDeployment.rawTransaction],
  });

  await publicClient.waitForTransactionReceipt({
    hash,
  });

  return smartAccount.address.toLowerCase() as `0x${string}`;
}

export async function resolvePortfolioManagerControllerIdentity(input: {
  signing: AgentRuntimeSigningService;
  signerRef: string;
  dependencies?: SmartAccountDependencies;
}): Promise<PortfolioManagerControllerIdentity> {
  const signerAddress = await input.signing.readAddress({
    signerRef: input.signerRef,
  });
  const smartAccountAddress = await derivePortfolioManagerControllerSmartAccountAddress({
    signerAddress,
    dependencies: input.dependencies,
  });

  return {
    signerAddress,
    smartAccountAddress,
  };
}
