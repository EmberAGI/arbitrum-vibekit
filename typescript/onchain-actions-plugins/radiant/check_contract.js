import { createPublicClient, http } from 'viem';
import { arbitrum } from 'viem/chains';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

// Try to get code at the address
const code = await client.getBytecode({
  address: '0x596B0cc4c5094507C50b579a662FE7e7b094A2cC'
});

console.log('Contract exists:', code && code.length > 2);
console.log('Code length:', code?.length);
