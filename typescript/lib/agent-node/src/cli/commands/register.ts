import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import matter from 'gray-matter';
import prompts from 'prompts';
import { encodeFunctionData } from 'viem';

import { loadAgentBase } from '../../config/loaders/agent-loader.js';
import { resolveConfigDirectory } from '../../config/runtime/config-dir.js';
import { IDENTITY_REGISTRY_ABI } from '../abi/identity.js';
import {
  CONTRACT_ADDRESSES,
  isSupportedChain,
  buildRegistrationFileForRegister,
  createIpfsFile,
  getPendingUri,
  savePendingUri,
} from '../utils/registration.js';
import { serveTransactionSigningPage, openBrowser } from '../utils/serve-transaction.js';

/**
 * CLI command options for registering an agent.
 */
export type RegisterCommandOptions = {
  name?: string;
  description?: string;
  url?: string;
  chainId?: string;
  version?: string;
  image?: string;
  all?: boolean;
  configDir?: string;
  chain?: string;
  forceNewUpload?: boolean;
};

/**
 * CLI wrapper for the register command.
 * Registers an agent on-chain using configuration from agent.md.
 * @param options Command line options
 */
export async function registerCommand(options: RegisterCommandOptions): Promise<void> {
  const { configDir } = resolveConfigDirectory(options.configDir);
  const agentPath = resolve(configDir, 'agent.md');
  const agentBase = loadAgentBase(agentPath);

  const fm = agentBase.frontmatter;
  const name = options.name ?? fm.card.name;
  const description = options.description ?? fm.card.description;
  const version = options.version ?? fm.card.version;
  const image = options.image ?? fm.erc8004?.image ?? '';
  const a2aUrl = options.url ?? fm.card.url;

  // Compose Agent Card URL using routing overrides
  let origin: string;
  try {
    origin = new URL(a2aUrl).origin;
  } catch {
    throw new Error(`Invalid agent card.url: ${a2aUrl}`);
  }
  const agentCardOrigin = fm.routing?.agentCardOrigin ?? origin;
  const agentCardPath = fm.routing?.agentCardPath ?? '/.well-known/agent-card.json';
  const agentCardUrl = `${agentCardOrigin}${agentCardPath}`;

  // Check for overrides and prompt to persist
  const hasOverrides =
    options.name || options.description || options.version || options.image || options.url;

  if (hasOverrides && process.stdin.isTTY && process.stdout.isTTY) {
    const overridesList: string[] = [];
    if (options.name) overridesList.push(`name: "${options.name}"`);
    if (options.description) overridesList.push(`description: "${options.description}"`);
    if (options.version) overridesList.push(`version: "${options.version}"`);
    if (options.image) overridesList.push(`image: "${options.image}"`);
    if (options.url) overridesList.push(`url: "${options.url}"`);

    console.log('\n📝 Override flags detected:');
    overridesList.forEach((override) => console.log(`   - ${override}`));

    const response = await prompts({
      type: 'confirm',
      name: 'persist',
      message: 'Persist these overrides to agent.md?',
      initial: true,
    });

    if (response.persist) {
      try {
        const agentRaw = readFileSync(agentPath, 'utf-8');
        const parsed = matter(agentRaw);
        const data = parsed.data as Record<string, any>;

        if (options.name) data['card'] = { ...data['card'], name: options.name };
        if (options.description)
          data['card'] = { ...data['card'], description: options.description };
        if (options.version) data['card'] = { ...data['card'], version: options.version };
        if (options.image) {
          data['erc8004'] = data['erc8004'] ?? {};
          data['erc8004']['image'] = options.image;
        }

        const updated = matter.stringify(parsed.content, data);
        writeFileSync(agentPath, updated, 'utf-8');
        console.log('✅ Overrides persisted to agent.md\n');
      } catch (err) {
        console.log(
          `⚠️  Failed to persist overrides: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  }

  // Determine chain set: canonical + optional mirrors, or specific chain via --chain
  const canonicalId = fm.erc8004?.canonical?.chainId;
  const mirrors = fm.erc8004?.mirrors ?? [];
  let chains: number[] = [];
  if (options.chain) {
    const targetChain = parseInt(options.chain);
    if (isNaN(targetChain)) {
      throw new Error(`Invalid chain ID: ${options.chain}`);
    }
    chains = [targetChain];
  } else {
    if (typeof canonicalId === 'number') chains.push(canonicalId);
    if (options.all !== false) {
      for (const m of mirrors) {
        if (typeof m?.chainId === 'number') chains.push(m.chainId);
      }
    }
  }
  if (chains.length === 0) {
    throw new Error('No chains configured in erc8004. Set canonical and/or mirrors.');
  }

  for (const chain of chains) {
    if (!isSupportedChain(chain)) {
      throw new Error(`Unsupported chain ID in config: ${chain}`);
    }

    console.log('\n🤖 Registering agent from config...');
    console.log('Name:', name);
    console.log('Description:', description);
    console.log('Agent Card URL:', agentCardUrl);
    console.log('Chain ID:', chain);

    const chainKey = String(chain);
    let ipfsUri: string;

    // Check for existing pending URI from previous attempt
    const existingPendingUri = getPendingUri(agentPath, chainKey, false);

    if (existingPendingUri && !options.forceNewUpload) {
      console.log('\n📎 Resuming with existing IPFS URI from previous attempt:', existingPendingUri);
      console.log('ℹ️  Use --force-new-upload to create a fresh registration file');
      ipfsUri = existingPendingUri;
    } else {
      // Compose Agent Card URL for registration
      console.log('\n📤 Uploading registration to IPFS...');
      const registrationFileContents = buildRegistrationFileForRegister(
        name,
        description,
        image || 'https://example.com/agent-image.png',
        version || '1.0.0',
        agentCardUrl,
        chain,
      );
      ipfsUri = await createIpfsFile(registrationFileContents);

      // Save URI immediately after upload for retry if needed
      savePendingUri(agentPath, chainKey, ipfsUri, false);
      console.log('💾 IPFS URI saved for retry if needed');
    }

    const callData = encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [ipfsUri],
    });

    // Serve the transaction signing page with persistence callback
    const url = await serveTransactionSigningPage({
      to: CONTRACT_ADDRESSES[chain].identity,
      data: callData,
      chainId: chain,
      agentName: name,
      onAgentIdReceived: (agentId: number | string, txHash?: string) => {
        console.log('\n🎉 Agent registered successfully!');
        const agentIdDisplay = typeof agentId === 'number' ? agentId.toString(10) : agentId;
        console.log(`📋 Agent ID: ${agentIdDisplay}`);
        if (txHash) {
          console.log(`📋 Transaction hash: ${txHash}`);
        }

        // Persist agentId and registrationUri to config
        try {
          const agentRaw = readFileSync(agentPath, 'utf-8');
          const parsed = matter(agentRaw);
          const data = parsed.data as Record<string, any>;
          data['erc8004'] = data['erc8004'] ?? {};
          data['erc8004']['registrations'] = data['erc8004']['registrations'] ?? {};
          const chainKey = String(chain);
          const existing = data['erc8004']['registrations'][chainKey] ?? {};
          const parsedAgentId =
            typeof agentId === 'number' ? agentId : Number.parseInt(agentId, 10);
          if (Number.isSafeInteger(parsedAgentId) && parsedAgentId >= 0) {
            existing.agentId = parsedAgentId;
          } else if (typeof agentId === 'string') {
            console.log(
              `\n⚠️  Agent ID ${agentId} exceeds JavaScript safe integer range. Update agent.md manually if you need to track it.`,
            );
          }
          existing.registrationUri = ipfsUri;
          if (txHash) {
            existing.txHash = txHash;
          }
          // Remove pending flags if they exist
          delete existing.pendingRegistrationUri;
          delete existing.pendingAgentId;
          data['erc8004']['registrations'][chainKey] = existing;
          const updated = matter.stringify(parsed.content, data);
          writeFileSync(agentPath, updated, 'utf-8');
          console.log(
            `\n📝 Persisted agentId and registrationUri for chain ${chain} to agent.md`,
          );
          console.log('🧹 Cleaned up pending registration data');
        } catch (err) {
          console.log(
            `\n⚠️  Failed to persist registration data for chain ${chain}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        console.log('\n   You can now close this terminal with Ctrl+C\n');
      },
      onPendingAgentId: (txHash: string) => {
        console.log('\n⚠️  Transaction confirmed but agent ID could not be retrieved.');
        console.log(`📋 Transaction hash: ${txHash}`);
        console.log('\nThe agent was likely registered successfully, but we could not extract the ID.');
        console.log('You can:');
        console.log('  1. Run `agent recover-id` to retry retrieval');
        console.log('  2. Check the transaction on a block explorer');

        // Persist pending status to config
        try {
          const agentRaw = readFileSync(agentPath, 'utf-8');
          const parsed = matter(agentRaw);
          const data = parsed.data as Record<string, any>;
          data['erc8004'] = data['erc8004'] ?? {};
          data['erc8004']['registrations'] = data['erc8004']['registrations'] ?? {};
          const chainKey = String(chain);
          const existing = data['erc8004']['registrations'][chainKey] ?? {};
          existing.registrationUri = ipfsUri;
          existing.pendingAgentId = true;
          existing.txHash = txHash;
          // Remove old pending URI flag
          delete existing.pendingRegistrationUri;
          data['erc8004']['registrations'][chainKey] = existing;
          const updated = matter.stringify(parsed.content, data);
          writeFileSync(agentPath, updated, 'utf-8');
          console.log(
            `\n📝 Saved registration with pending agent ID status to agent.md`,
          );
        } catch (err) {
          console.log(
            `\n⚠️  Failed to persist pending status for chain ${chain}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        console.log('\n   You can now close this terminal with Ctrl+C\n');
      },
    });

    console.log('\n✅ Registration file uploaded to IPFS:', ipfsUri);
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
    await new Promise(() => {
      // This promise never resolves, keeping the server alive
      // User will need to manually terminate with Ctrl+C
    });
  }
}
