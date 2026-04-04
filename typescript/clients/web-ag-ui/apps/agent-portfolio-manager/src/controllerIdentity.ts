import {
  getDeleGatorEnvironment,
  Implementation,
  toMetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import { createPublicClient, http } from 'viem';
import { arbitrum } from 'viem/chains';

import type { AgentRuntimeSigningService } from 'agent-runtime/internal';

export type PortfolioManagerControllerIdentity = {
  signerAddress: `0x${string}`;
  smartAccountAddress: `0x${string}`;
};

type SmartAccountDependencies = {
  createPublicClient?: typeof createPublicClient;
  toMetaMaskSmartAccount?: typeof toMetaMaskSmartAccount;
  getDeleGatorEnvironment?: typeof getDeleGatorEnvironment;
};

export async function derivePortfolioManagerControllerSmartAccountAddress(input: {
  signerAddress: `0x${string}`;
  dependencies?: SmartAccountDependencies;
}): Promise<`0x${string}`> {
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
