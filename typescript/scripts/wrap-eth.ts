import { Wallet, providers, Contract } from 'ethers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// WETH ABI for deposit function
const WETH_ABI = [
  "function deposit() payable",
  "function balanceOf(address) view returns (uint)"
];

// Load environment variables from the compound-v3-mcp .env file
dotenv.config({ path: join(__dirname, '../lib/mcp-tools/compound-v3-mcp/.env') });

async function main() {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    throw new Error('RPC_URL or PRIVATE_KEY not set in environment');
  }

  // Connect to the network
  const provider = new providers.JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  // WETH contract on Arbitrum
  const WETH_ADDRESS = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
  const wethContract = new Contract(WETH_ADDRESS, WETH_ABI, wallet);

  // Amount to wrap (1 ETH)
  const amount = '1000000000000000000'; // 1 ETH in wei

  console.log('Wrapping 1 ETH to WETH...');
  
  // Get initial balance
  const initialBalance = await wethContract.balanceOf(wallet.address);
  console.log('Initial WETH balance:', initialBalance.toString());

  // Deposit ETH to get WETH
  const tx = await wethContract.deposit({ value: amount });
  console.log('Transaction hash:', tx.hash);
  
  // Wait for transaction to be mined
  await tx.wait();
  console.log('Transaction confirmed');

  // Get final balance
  const finalBalance = await wethContract.balanceOf(wallet.address);
  console.log('Final WETH balance:', finalBalance.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 