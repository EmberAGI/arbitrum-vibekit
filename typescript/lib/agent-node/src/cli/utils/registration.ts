import { PinataSDK } from 'pinata';
import { sepolia } from 'viem/chains';

/**
 * Contract addresses for supported chains.
 */
export const CONTRACT_ADDRESSES = {
  [sepolia.id]: {
    identity: '0x8004a6090Cd10A7288092483047B097295Fb8847',
  },
} as const;

/**
 * Type representing supported chain IDs.
 */
export type SupportedChains = keyof typeof CONTRACT_ADDRESSES;

/**
 * Checks if the given chain ID is supported.
 * @param chainId The chain ID to check.
 * @returns True if the chain ID is supported, false otherwise.
 */
export function isSupportedChain(chainId: number): chainId is SupportedChains {
  return chainId in CONTRACT_ADDRESSES;
}

/**
 * Builds the registration file for the agent.
 * @param agentName The name of the agent.
 * @param agentDescription A description of the agent.
 * @param agentImage The image URL of the agent.
 * @param agentVersion The version of the agent.
 * @param agentUrl The URL of the agent.
 * @param chainId The chain ID where the agent is registered.
 * @returns The registration file object.
 */
export function buildRegistrationFile(
  agentName: string,
  agentDescription: string,
  agentImage: string,
  agentVersion: string,
  agentUrl: string,
  chainId: SupportedChains,
) {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agentName,
    description: agentDescription,
    image: agentImage,
    endpoints: [
      {
        name: 'A2A',
        endpoint: `${agentUrl}/.well-known/agent-card.json`,
        version: agentVersion,
      },
    ],
    registrations: [
      {
        agentId: 22,
        agentRegistry: `eip155:${chainId}:${CONTRACT_ADDRESSES[chainId].identity}`,
      },
    ],
    supportedTrust: [],
  };
}

/**
 * Uploads the given file contents to IPFS and returns the URI.
 * @param fileContents The contents of the file to upload.
 * @returns The IPFS URI of the uploaded file.
 */
export async function createIpfsFile(fileContents: unknown): Promise<string> {
  const pinataJwt = process.env['PINATA_JWT'];
  const pinataGateway = process.env['PINATA_GATEWAY'];

  if (!pinataJwt) {
    throw new Error('PINATA_JWT environment variable is not set');
  }
  if (!pinataGateway) {
    throw new Error('PINATA_GATEWAY environment variable is not set');
  }

  const pinataClient = new PinataSDK({ pinataJwt });

  // Upload JSON to IPFS using Pinata
  const file = new File([JSON.stringify(fileContents)], 'registration.json', {
    type: 'application/json',
  });
  const upload = await pinataClient.upload.public.file(file);

  // Return the IPFS URI
  return `ipfs://${upload.cid}`;
}
