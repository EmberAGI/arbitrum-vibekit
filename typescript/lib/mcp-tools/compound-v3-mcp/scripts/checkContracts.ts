import * as dotenv from 'dotenv';
import { createPublicClient, http, defineChain } from 'viem';

// Load environment variables
dotenv.config();

const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) {
  console.error('RPC_URL not set in environment');
  process.exit(1);
}

const COMET_ADDRESS = process.env.COMET_ADDRESS;
if (!COMET_ADDRESS) {
  console.error('COMET_ADDRESS not set in environment');
  process.exit(1);
}

// Get TOKEN_ADDRESS either from environment variable or command line argument
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || process.argv[2];
if (!TOKEN_ADDRESS) {
  console.error('TOKEN_ADDRESS not set in environment or provided as a command-line argument');
  process.exit(1);
}

// Define local Arbitrum chain
const localArbitrum = defineChain({
  id: 42161,
  name: 'Local Arbitrum Fork',
  network: 'arbitrum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://arbiscan.io' },
  },
});

const client = createPublicClient({
  transport: http(RPC_URL),
  chain: localArbitrum,
});

async function checkContracts() {
  console.error('Checking COMET_ADDRESS:', COMET_ADDRESS);
  const cometCode = await client.getBytecode({ address: COMET_ADDRESS as `0x${string}` });
  if (cometCode === '0x') {
    console.error('No code found at COMET_ADDRESS:', COMET_ADDRESS);
  } else {
    console.error('Contract found at COMET_ADDRESS:', COMET_ADDRESS, 'Code length:', cometCode?.length);
  }

  console.error('Checking TOKEN_ADDRESS:', TOKEN_ADDRESS);
  const tokenCode = await client.getBytecode({ address: TOKEN_ADDRESS as `0x${string}` });
  if (tokenCode === '0x') {
    console.error('No code found at TOKEN_ADDRESS:', TOKEN_ADDRESS);
  } else {
    console.error('Contract found at TOKEN_ADDRESS:', TOKEN_ADDRESS, 'Code length:', tokenCode?.length);
  }
}

checkContracts().catch((err) => {
  console.error('Error while checking contracts:', err);
  process.exit(1);
}); 