import { PinataSDK } from 'pinata';

/**
 * Zero address placeholder for undeployed contracts
 */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Chain IDs for supported networks
 */
export const CHAIN_IDS = {
  ETHEREUM: 1,
  BASE: 8453,
  ETHEREUM_SEPOLIA: 11155111,
  ARBITRUM_ONE: 42161,
} as const;

/**
 * Contract addresses for supported chains.
 * Zero address indicates contract not yet deployed on that chain.
 */
export const CONTRACT_ADDRESSES = {
  [CHAIN_IDS.ETHEREUM]: {
    identity: ZERO_ADDRESS, // Placeholder - not yet deployed
  },
  [CHAIN_IDS.BASE]: {
    identity: ZERO_ADDRESS, // Placeholder - not yet deployed
  },
  [CHAIN_IDS.ETHEREUM_SEPOLIA]: {
    identity: '0x8004a6090Cd10A7288092483047B097295Fb8847', // Deployed testnet registry
  },
  [CHAIN_IDS.ARBITRUM_ONE]: {
    identity: ZERO_ADDRESS, // Placeholder - not yet deployed
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
  agentCardUrl: string,
  chainId: SupportedChains,
  agentId: number,
): {
  type: string;
  name: string;
  description: string;
  image: string;
  endpoints: Array<{ name: string; endpoint: string; version: string }>;
  registrations: Array<{ agentId: number; agentRegistry: string }>;
  supportedTrust: string[];
} {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agentName,
    description: agentDescription,
    image: agentImage,
    endpoints: [
      {
        name: 'A2A',
        endpoint: agentCardUrl,
        version: agentVersion,
      },
    ],
    registrations: [
      {
        agentId,
        agentRegistry: `eip155:${chainId}:${CONTRACT_ADDRESSES[chainId].identity}`,
      },
    ],
    supportedTrust: [],
  };
}

/**
 * Builds the registration file for initial registration (no agentId yet).
 * @param agentName The name of the agent.
 * @param agentDescription A description of the agent.
 * @param agentImage The image URL of the agent.
 * @param agentVersion The version of the agent.
 * @param agentCardUrl Fully composed Agent Card URL.
 * @param chainId The chain ID where the agent will be registered.
 */
export function buildRegistrationFileForRegister(
  agentName: string,
  agentDescription: string,
  agentImage: string,
  agentVersion: string,
  agentCardUrl: string,
  _chainId: SupportedChains,
): {
  type: string;
  name: string;
  description: string;
  image: string;
  endpoints: Array<{ name: string; endpoint: string; version: string }>;
  registrations?: Array<{ agentId: number; agentRegistry: string }>;
  supportedTrust: string[];
} {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agentName,
    description: agentDescription,
    image: agentImage,
    endpoints: [
      {
        name: 'A2A',
        endpoint: agentCardUrl,
        version: agentVersion,
      },
    ],
    // registrations omitted at register time; registry infers/sets id
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
  // Use Blob (Node.js 18+ compatible) instead of File (browser-only)
  const blob = new Blob([JSON.stringify(fileContents)], {
    type: 'application/json',
  });
  // Create a File-like object from the Blob for Pinata SDK
  const file = Object.assign(blob, {
    name: 'registration.json',
    lastModified: Date.now(),
  }) as File;
  const upload = await pinataClient.upload.public.file(file);

  // Return the IPFS URI
  return `ipfs://${upload.cid}`;
}
