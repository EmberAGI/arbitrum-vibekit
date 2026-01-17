
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com'; // Default to public RPC if not set
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const EIP712_DOMAIN_ABI = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function getChainId() view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)'
];

async function main() {
  console.log('Connecting to RPC:', RPC_URL);
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const network = await provider.getNetwork();
  console.log('Connected to network:', {
    name: network.name,
    chainId: network.chainId.toString()
  });

  const usdc = new ethers.Contract(USDC_ADDRESS, EIP712_DOMAIN_ABI, provider);

  console.log('\nQuerying USDC Contract:', USDC_ADDRESS);

  try {
    const name = await usdc.name();
    console.log('Name:', name);
  } catch (e) {
    console.log('Failed to fetch name:', e.message);
  }

  try {
    const version = await usdc.version();
    console.log('Version:', version);
  } catch (e) {
    console.log('Failed to fetch version (might not verify via this method):', e.message);
  }

  try {
    // Some implementations expose this
    const domainSeparator = await usdc.DOMAIN_SEPARATOR();
    console.log('DOMAIN_SEPARATOR:', domainSeparator);
  } catch (e) {
    console.log('Failed to fetch DOMAIN_SEPARATOR');
  }

  try {
    // EIP-5267 standard
    const domain = await usdc.eip712Domain();
    console.log('EIP-712 Domain:', {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId.toString(),
        verifyingContract: domain.verifyingContract
    });
  } catch (e) {
    console.log('Does not support EIP-5267 eip712Domain()');
  }

  // Calculate expected separator for comparison
  const expectedName = "USD Coin (PoS)";
  const expectedVersion = "1";
  const chainId = 137;

  const domainSep = ethers.TypedDataEncoder.hashDomain({
      name: expectedName,
      version: expectedVersion,
      chainId: chainId,
      verifyingContract: USDC_ADDRESS
  });
  console.log('\nCalculated local DOMAIN_SEPARATOR:', domainSep);
}

main().catch(console.error);
