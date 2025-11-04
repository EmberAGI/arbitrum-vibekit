import { readFileSync, writeFileSync } from 'node:fs';

import matter from 'gray-matter';
import { PinataSDK } from 'pinata';

/**
 * Type definitions for agent frontmatter data
 */
interface RegistrationEntry {
  pendingRegistrationUri?: string;
  pendingUpdateUri?: string;
  registrationUri?: string;
  agentId?: string;
  agentIdString?: string;
  txHash?: string;
  pendingAgentId?: string;
  image?: string;
  [key: string]: unknown; // Allow additional properties
}

interface ERC8004Data {
  registrations?: Record<string, RegistrationEntry>;
}

interface AgentFrontmatterData {
  erc8004?: ERC8004Data;
  [key: string]: unknown; // Allow additional properties
}

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

/**
 * Saves a pending IPFS URI to agent.md for later retry.
 * @param agentPath Path to the agent.md file
 * @param chainKey The chain ID as a string
 * @param uri The IPFS URI to save
 * @param isUpdate Whether this is for an update (vs initial registration)
 */
export function savePendingUri(
  agentPath: string,
  chainKey: string,
  uri: string,
  isUpdate = false,
): void {
  const agentRaw = readFileSync(agentPath, 'utf-8');
  const parsed = matter(agentRaw);
  const data = parsed.data as AgentFrontmatterData;

  // Ensure ERC8004 structure exists
  if (!data.erc8004) {
    data.erc8004 = {};
  }
  if (!data.erc8004.registrations) {
    data.erc8004.registrations = {};
  }

  // Get or create registration entry for this chain
  const existing = data.erc8004.registrations[chainKey] ?? {};

  // Save the pending URI
  if (isUpdate) {
    existing.pendingUpdateUri = uri;
  } else {
    existing.pendingRegistrationUri = uri;
  }

  data.erc8004.registrations[chainKey] = existing;

  // Write back to file
  const updated = matter.stringify(parsed.content, data);
  writeFileSync(agentPath, updated, 'utf-8');
}

/**
 * Gets a pending IPFS URI from agent.md if one exists.
 * @param agentPath Path to the agent.md file
 * @param chainKey The chain ID as a string
 * @param isUpdate Whether to look for update URI (vs registration URI)
 * @returns The pending URI if found, undefined otherwise
 */
export function getPendingUri(
  agentPath: string,
  chainKey: string,
  isUpdate = false,
): string | undefined {
  try {
    const agentRaw = readFileSync(agentPath, 'utf-8');
    const parsed = matter(agentRaw);
    const data = parsed.data as AgentFrontmatterData;

    const registrations = data?.erc8004?.registrations;
    if (!registrations || !registrations[chainKey]) {
      return undefined;
    }

    const entry = registrations[chainKey];
    return isUpdate ? entry.pendingUpdateUri : entry.pendingRegistrationUri;
  } catch (_err) {
    // File might not exist or have valid structure
    return undefined;
  }
}

/**
 * Clears a pending IPFS URI from agent.md after successful registration.
 * @param agentPath Path to the agent.md file
 * @param chainKey The chain ID as a string
 * @param isUpdate Whether to clear update URI (vs registration URI)
 */
export function clearPendingUri(agentPath: string, chainKey: string, isUpdate = false): void {
  try {
    const agentRaw = readFileSync(agentPath, 'utf-8');
    const parsed = matter(agentRaw);
    const data = parsed.data as AgentFrontmatterData;

    const registrations = data?.erc8004?.registrations;
    if (!registrations || !registrations[chainKey]) {
      return;
    }

    const entry = registrations[chainKey];
    if (isUpdate) {
      delete entry.pendingUpdateUri;
    } else {
      delete entry.pendingRegistrationUri;
    }

    // Clean up empty objects if needed
    if (Object.keys(entry).length === 0) {
      delete registrations[chainKey];
    }

    // Write back to file
    const updated = matter.stringify(parsed.content, data);
    writeFileSync(agentPath, updated, 'utf-8');
  } catch (_err) {
    // Ignore errors - might not exist
  }
}
