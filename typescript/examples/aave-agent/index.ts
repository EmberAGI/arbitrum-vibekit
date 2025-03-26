import { AAVEInstance, Chain } from '../../src/adapters/providers/aave';
import { Agent } from './agent';
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// sepolia testnet:

// const rpc = 'https://eth-sepolia.blastapi.io/58417139-0bc7-49b3-9637-ae50b6ecd82b'
// const chainId = 11155111;

// arbitrum one:

const rpc = 'https://arbitrum.llamarpc.com'
const chainId = 42161;

const main = async () => {

  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error("Mnemonic not found in the .env file.");
  }

  const wallet = ethers.Wallet.fromMnemonic(mnemonic);
  console.log(`Using wallet ${wallet.address}`);

  const chain = new Chain(
    'Sepolia Testnet',
    chainId,
    rpc,
  );

  const aave = new AAVEInstance(
    chain,
  );

  const provider = chain.getProvider();
  const signer = wallet.connect(provider);
  const agent = new Agent(aave, signer, wallet.address);
  agent.start();

};

main();
