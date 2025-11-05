import { resolve } from 'node:path';

import prompts from 'prompts';
import { encodeFunctionData } from 'viem';

import { loadAgentBase } from '../../config/loaders/agent-loader.js';
import { resolveConfigDirectory } from '../../config/runtime/config-dir.js';
import type { ERC8004RegistrationEntry } from '../../config/schemas/agent.schema.js';
import { IDENTITY_REGISTRY_ABI } from '../abi/identity.js';
import { ensureErc8004Config, updateAgentFrontmatter } from '../utils/frontmatter.js';
import {
  CONTRACT_ADDRESSES,
  isSupportedChain,
  buildRegistrationFile,
  createIpfsFile,
  getPendingUri,
  savePendingUri,
} from '../utils/registration.js';
import { serveTransactionSigningPage, openBrowser } from '../utils/serve-transaction.js';

/**
 * CLI command options for updating an agent's registry.
 */
export type UpdateRegistryCommandOptions = {
  agentId?: string;
  name?: string;
  description?: string;
  url?: string;
  chainId?: string;
  chain?: string;
  version?: string;
  image?: string;
  all?: boolean;
  configDir?: string;
  forceNewUpload?: boolean;
};

/**
 * CLI wrapper for the update registry command.
 * Updates an agent's registry on-chain using configuration from agent.md.
 * @param options Command line options
 */
export async function updateRegistryCommand(options: UpdateRegistryCommandOptions): Promise<void> {
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
        updateAgentFrontmatter(agentPath, (draft) => {
          if (options.name) draft.card.name = options.name;
          if (options.description) draft.card.description = options.description;
          if (options.version) draft.card.version = options.version;
          if (options.image) {
            const erc8004Config = ensureErc8004Config(draft);
            erc8004Config.image = options.image;
          }
          return draft;
        });
        console.log('✅ Overrides persisted to agent.md\n');
      } catch (err) {
        console.log(
          `⚠️  Failed to persist overrides: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  }

  // Determine chain set: canonical + optional mirrors, or specific chain if --chain provided
  const canonicalId = fm.erc8004?.canonical?.chainId;
  const mirrors = fm.erc8004?.mirrors ?? [];
  let chains: number[] = [];

  if (options.chain) {
    // Target specific chain via --chain flag
    const targetChain = parseInt(options.chain);
    if (isNaN(targetChain)) {
      throw new Error(`Invalid chain ID: ${options.chain}`);
    }
    chains = [targetChain];
  } else {
    // Default: canonical + mirrors (when --all is true, which is default)
    if (typeof canonicalId === 'number') chains.push(canonicalId);
    if (options.all !== false) {
      for (const m of mirrors) {
        if (typeof m?.chainId === 'number') chains.push(m.chainId);
      }
    }
  }

  if (chains.length === 0) {
    throw new Error(
      'No chains to update. Set canonical and/or mirrors in erc8004, or use --chain <id>.',
    );
  }

  console.log('\n🔄 Updating agent registry from config...');
  console.log('Name:', name);
  console.log('Description:', description);
  console.log('A2A URL:', a2aUrl);
  console.log('Agent Card URL:', agentCardUrl);
  console.log('Chains:', chains.join(', '));

  for (const chain of chains) {
    if (!isSupportedChain(chain)) {
      throw new Error(`Unsupported chain ID in config: ${chain}`);
    }
    const perChainKey = String(chain);
    const perChainReg = fm.erc8004?.registrations?.[perChainKey];
    const perChainAgentId = options.agentId ? parseInt(options.agentId) : perChainReg?.agentId;
    if (typeof perChainAgentId !== 'number') {
      throw new Error(
        `Missing agentId for chain ${chain}. Provide --agent-id or set erc8004.registrations[${perChainKey}].agentId`,
      );
    }

    const chainKey = String(chain);
    let ipfsUri: string;

    // Check for existing pending update URI from previous attempt
    const existingPendingUri = getPendingUri(agentPath, chainKey, true);

    if (existingPendingUri && !options.forceNewUpload) {
      console.log(
        `\n📎 Chain ${chain}: Resuming with existing IPFS URI from previous attempt:`,
        existingPendingUri,
      );
      console.log('ℹ️  Use --force-new-upload to create a fresh registration file');
      ipfsUri = existingPendingUri;
    } else {
      // Build registration file
      console.log(`\n📤 Chain ${chain}: Uploading registration to IPFS...`);
      const registrationFileContents = buildRegistrationFile(
        name,
        description,
        image || 'https://example.com/agent-image.png',
        version || '1.0.0',
        agentCardUrl,
        chain,
        perChainAgentId,
      );

      // Upload to IPFS
      ipfsUri = await createIpfsFile(registrationFileContents);

      // Save URI immediately after upload for retry if needed
      savePendingUri(agentPath, chainKey, ipfsUri, true);
      console.log(`💾 Chain ${chain}: IPFS URI saved for retry if needed`);
    }

    console.log(`✅ Chain ${chain}: registration file ready: ${ipfsUri}`);

    // Encode and serve transaction signing page
    const callData = encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setAgentUri',
      args: [BigInt(perChainAgentId), ipfsUri],
    });

    const url = await serveTransactionSigningPage({
      to: CONTRACT_ADDRESSES[chain].identity,
      data: callData,
      chainId: chain,
      agentName: name,
      onAgentIdReceived: (receivedAgentId: number | string) => {
        console.log('\n🎉 Agent registry updated successfully!');
        const agentIdDisplay =
          typeof receivedAgentId === 'number' ? receivedAgentId.toString(10) : receivedAgentId;
        console.log(`📋 Agent ID: ${agentIdDisplay}`);

        // Persist the updated registrationUri and clean up pending URI
        try {
          updateAgentFrontmatter(agentPath, (draft) => {
            const erc8004Config = ensureErc8004Config(draft);
            const chainKey = String(chain);
            const existing: ERC8004RegistrationEntry = erc8004Config.registrations[chainKey] ?? {};
            existing.registrationUri = ipfsUri;
            // Remove pending update URI now that update is successful
            delete existing.pendingUpdateUri;
            erc8004Config.registrations[chainKey] = existing;
            return draft;
          });
          console.log(`\n📝 Persisted updated registrationUri for chain ${chain} to agent.md`);
          console.log('🧹 Cleaned up pending update data');
        } catch (err) {
          console.log(
            `\n⚠️  Failed to persist update data for chain ${chain}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        console.log('\n   You can now close this terminal with Ctrl+C\n');
      },
    });

    console.log('\n🌐 Opening browser to sign transaction...');
    console.log('📋 Transaction URL:', url);
    try {
      await openBrowser(url);
      console.log('\n✨ Please complete the transaction in your browser.');
      console.log('   Press Ctrl+C to close the server when done.\n');
    } catch (_error) {
      console.log('\n⚠️  Could not open browser automatically.');
      console.log('   Please open this URL manually:', url);
      console.log('   Press Ctrl+C to close the server when done.\n');
    }

    // Persist registrationUri back to config
    try {
      updateAgentFrontmatter(agentPath, (draft) => {
        const erc8004Config = ensureErc8004Config(draft);
        const existing: ERC8004RegistrationEntry = erc8004Config.registrations[perChainKey] ?? {};
        existing.registrationUri = ipfsUri;
        if (typeof perChainAgentId === 'number') {
          existing.agentId = perChainAgentId;
        }
        erc8004Config.registrations[perChainKey] = existing;
        return draft;
      });
      console.log(`\n📝 Persisted registrationUri for chain ${chain} to agent.md`);
    } catch {
      console.log(`\n⚠️  Failed to persist registrationUri for chain ${chain} to agent.md`);
    }
  }

  // Keep the process alive for the last served signing page
  return new Promise(() => {});
}
