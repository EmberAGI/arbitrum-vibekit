import { encodeFunctionData } from 'viem';
import { IDENTITY_REGISTRY_ABI } from '../abi/identity.js';
import { serveTransactionSigningPage, openBrowser } from '../utils/serve-transaction.js';
import {
  CONTRACT_ADDRESSES,
  isSupportedChain,
  buildRegistrationFile,
  createIpfsFile,
} from '../utils/registration.js';

/**
 * Options for updating an agent's registry.
 */
export type UpdateRegistryOptions = {
  agentId: string;
  agentName: string;
  agentDescription: string;
  agentUrl: string;
  chainId: string;
  agentVersion?: string;
  agentImage?: string;
};

/**
 * Command to update an agent's registry using EIP-8004 standard.
 * @param options Update options
 */
export async function updateAgentRegistryUsing8004(options: UpdateRegistryOptions) {
  const chainId = parseInt(options.chainId);
  if (!isSupportedChain(chainId)) {
    throw new Error(`Unsupported chain ID: ${options.chainId}`);
  }

  const agentId = parseInt(options.agentId);
  if (isNaN(agentId) || agentId < 0) {
    throw new Error(`Invalid agent ID: ${options.agentId}`);
  }

  // Build the registration file with updated information
  const registrationFileContents = buildRegistrationFile(
    options.agentName,
    options.agentDescription,
    options.agentImage || 'https://example.com/agent-image.png',
    options.agentVersion || '1.0.0',
    options.agentUrl,
    chainId,
  );

  // Upload to IPFS
  const ipfsUri = await createIpfsFile(registrationFileContents);

  // Encode the setAgentUri function call
  const callData = encodeFunctionData({
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'setAgentUri',
    args: [BigInt(agentId), ipfsUri],
  });

  // Serve the transaction signing page
  const url = await serveTransactionSigningPage({
    to: CONTRACT_ADDRESSES[chainId].identity,
    data: callData,
    chainId,
    agentName: options.agentName,
    onAgentIdReceived: (receivedAgentId: number) => {
      console.log('\n🎉 Agent registry updated successfully!');
      console.log(`📋 Agent ID: ${receivedAgentId}`);
      console.log('\n   You can now close this terminal with Ctrl+C\n');
    },
  });

  console.log('\n✅ Updated registration file uploaded to IPFS:', ipfsUri);
  console.log('\n🌐 Opening browser to sign transaction...');
  console.log('📋 Transaction URL:', url);

  try {
    await openBrowser(url);
    console.log('\n✨ Please complete the transaction in your browser.');
    console.log('   Press Ctrl+C to close the server when done.\n');
  } catch (error) {
    console.log('\n⚠️  Could not open browser automatically.');
    console.log('   Please open this URL manually:', url);
    console.log('   Press Ctrl+C to close the server when done.\n');
  }

  // Keep the process alive so the server stays running
  return new Promise(() => {
    // This promise never resolves, keeping the server alive
    // User will need to manually terminate with Ctrl+C
  });
}

/**
 * CLI command options for updating an agent's registry.
 */
export type UpdateRegistryCommandOptions = {
  agentId?: string;
  name?: string;
  description?: string;
  url?: string;
  chainId?: string;
  version?: string;
  image?: string;
};

/**
 * CLI wrapper for the update registry command.
 * @param options Command line options
 */
export async function updateRegistryCommand(options: UpdateRegistryCommandOptions): Promise<void> {
  // Validate required options
  if (!options.agentId) {
    throw new Error('Agent ID is required. Use --agent-id <agent-id>');
  }
  if (!options.name) {
    throw new Error('Agent name is required. Use --name <agent-name>');
  }
  if (!options.description) {
    throw new Error('Agent description is required. Use --description <description>');
  }
  if (!options.url) {
    throw new Error('Agent URL is required. Use --url <agent-url>');
  }
  if (!options.chainId) {
    throw new Error('Chain ID is required. Use --chain-id <chain-id>');
  }

  console.log('\n🔄 Updating agent registry...');
  console.log('Agent ID:', options.agentId);
  console.log('Name:', options.name);
  console.log('Description:', options.description);
  console.log('URL:', options.url);
  console.log('Chain ID:', options.chainId);
  if (options.version) {
    console.log('Version:', options.version);
  }
  if (options.image) {
    console.log('Image:', options.image);
  }

  await updateAgentRegistryUsing8004({
    agentId: options.agentId,
    agentName: options.name,
    agentDescription: options.description,
    agentUrl: options.url,
    chainId: options.chainId,
    agentVersion: options.version,
    agentImage: options.image,
  });
}
