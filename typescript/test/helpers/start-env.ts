import dotenv from 'dotenv';
import { definePool, Instance } from 'prool';
import { anvil } from 'prool/instances';
import { ethers } from 'ethers';
import { runCommand } from './run-command';
import * as process from 'process';
import { AnvilOptions } from '@viem/anvil';
import { CHAIN_CONFIGS } from '../chains.js';
import { writeFile } from 'fs/promises';

dotenv.config();

export const startEnv = async (useAnvil: boolean) => {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) throw new Error('Mnemonic not found in the .env file.');
  let anvilPort = parseInt(process.env.ANVIL_PORT || '3070');
  let instance: null | Instance = null;
  let rpcUrlVars = '';
  if (useAnvil) {
    for (const [chainId, chainConfig] of Object.entries(CHAIN_CONFIGS)) {
      const { varName, rpcUrl: originalRpcUrl } = chainConfig;

      const anvilSpec: AnvilOptions = {
        mnemonic: mnemonic,
        forkUrl: originalRpcUrl,
      };

      const blockNumberVarName = `TEST_${varName}_ANVIL_FORK_BLOCK_NUMBER`;
      if (process.env[blockNumberVarName]) {
        anvilSpec.forkBlockNumber = parseInt(process.env[blockNumberVarName]);
      } else {
        console.info(`${blockNumberVarName} not provided, starting from the latest block`);
      }

      const pool = definePool({
        instance: anvil(anvilSpec),
      });

      instance = (await pool.start(1, {
        port: anvilPort++,
      })) as Instance;

      const anvilRpcUrl = `http://${instance.host}:${instance.port}`;
      process.env[`${varName}_RPC_URL`] = anvilRpcUrl;
      const provider = new ethers.providers.JsonRpcProvider(anvilRpcUrl);
      await provider.send('evm_setAutomine', [true]);

      const { chainId: providerChainId } = await provider.getNetwork();
      if (parseInt(chainId) !== providerChainId) {
        throw new Error(
          `Chain ID does not match for anvil: ${parseInt(chainId)} != ${providerChainId}`
        );
      }

      // Make sure the RPC is alive
      await provider.getBlockNumber();
      console.log(`${varName}_RPC_URL=${anvilRpcUrl}`);
      rpcUrlVars += `${varName}_RPC_URL=${anvilRpcUrl}\n`;
    }
  }

  process.chdir('onchain-actions');

  // Ensure the nested repo is up to date without changing architecture
  try {
    await runCommand('git fetch --all --prune', 'git');
    await runCommand('git pull --ff-only', 'git');
  } catch (e) {
    console.warn('[git] Skipping auto-update of onchain-actions (non-fatal).');
  }

  await runCommand(
    'docker compose --progress=plain -f compose.dev.service.yaml up -d --wait',
    'compose'
  );

  await runCommand('pnpm install --ignore-workspace --no-frozen-lockfile', 'install');
  try {
    await runCommand('pnpm run dev', 'dev', {}, 'Server listening on port');
  } catch (e) {
    console.error(e);
    throw new Error(
      'Did you forget to populate .env in the onchain-actions/ folder?\nGo to onchain-actions and fix this problem manually: the goal is to be able to run `pnpm run dev`'
    );
  }

  if (useAnvil) {
    await writeFile('.env.tmp.test', rpcUrlVars);
  }

  // DO NOT EDIT the line below, CI depends on it
  // useAnvil flag purposefully breaks the logic, to ensure we never accidentally
  // run real chain tests in CI.
  console.log(`You can run ${useAnvil ? '' : 'mainnet '}integration tests now`);
  console.log();
  if (useAnvil) {
    console.log('pnpm run test');
  } else {
    console.log('pnpm run test:mainnet');
  }
};
