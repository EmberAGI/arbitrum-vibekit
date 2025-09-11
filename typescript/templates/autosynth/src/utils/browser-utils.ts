/**
 * Browser Utilities for AutoSynth Agent
 * These utilities are designed for browser environments only
 * They cannot be used in the Node.js server environment
 */

import { ethers } from 'ethers';

// Type declarations for MetaMask ethereum provider
interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
}

/**
 * Function to connect MetaMask and create signer
 * NOTE: This function works in browser environments only (web client)
 * It cannot be used in the Node.js AutoSynth agent server
 *
 * @returns Promise<ethers.Signer> - MetaMask-backed signer
 * @throws Error if MetaMask is not installed or user rejects connection
 */
export async function connectMetaMaskSigner(): Promise<ethers.Signer> {
  // Type check for browser environment
  if (typeof globalThis === 'undefined' || !(globalThis as any).window) {
    throw new Error('MetaMask signer can only be used in browser environments');
  }

  // Check if MetaMask is installed
  const ethereum = (globalThis as any).window?.ethereum as EthereumProvider | undefined;
  if (!ethereum) {
    throw new Error('MetaMask not detected! Please install MetaMask.');
  }

  // Check if MetaMask is the provider
  if (ethereum.isMetaMask !== true) {
    console.warn('Non-MetaMask provider detected. Functionality may be limited.');
  }

  try {
    // Request account access (triggers MetaMask popup)
    console.log('🔄 Requesting MetaMask account access...');
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please connect your wallet.');
    }

    console.log('✅ MetaMask connected. Available accounts:', accounts);

    // Create provider and signer from MetaMask
    // Use BrowserProvider for modern ethers v6+
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner(); // This creates a JsonRpcSigner backed by MetaMask

    const address = await signer.getAddress();
    console.log('✅ MetaMask signer created successfully');
    console.log('📍 Signer address:', address);

    // Verify signer is working
    const network = await provider.getNetwork();
    console.log('🌐 Connected to network:', network.name, '(Chain ID:', network.chainId.toString() + ')');

    return signer;

  } catch (error: any) {
    console.error('❌ MetaMask connection failed:', error);

    // Handle specific MetaMask errors
    if (error.code === 4001) {
      throw new Error('User rejected the request to connect MetaMask.');
    }

    if (error.code === -32002) {
      throw new Error('MetaMask connection request already pending. Please check your MetaMask extension.');
    }

    // Re-throw with more context
    throw new Error(`MetaMask connection failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Utility function to get the current MetaMask signer if already connected
 * @returns Promise<ethers.Signer | null> - Current signer or null if not connected
 */
export async function getCurrentMetaMaskSigner(): Promise<ethers.Signer | null> {
  if (typeof globalThis === 'undefined' || !(globalThis as any).window) {
    return null;
  }

  const ethereum = (globalThis as any).window?.ethereum as EthereumProvider | undefined;
  if (!ethereum) {
    return null;
  }

  try {
    const accounts = await ethereum.request({ method: 'eth_accounts' });

    if (!accounts || accounts.length === 0) {
      return null;
    }

    const provider = new ethers.BrowserProvider(ethereum);
    return await provider.getSigner();

  } catch (error) {
    console.warn('Failed to get current MetaMask signer:', error);
    return null;
  }
}

/**
 * Utility function to check if MetaMask is installed
 * @returns boolean - True if MetaMask is detected
 */
export function isMetaMaskInstalled(): boolean {
  if (typeof globalThis === 'undefined' || !(globalThis as any).window) {
    return false;
  }

  const ethereum = (globalThis as any).window?.ethereum as EthereumProvider | undefined;
  return !!ethereum && ethereum.isMetaMask === true;
}

/**
 * Utility function to check if user is connected to MetaMask
 * @returns Promise<boolean> - True if connected
 */
export async function isMetaMaskConnected(): Promise<boolean> {
  if (typeof globalThis === 'undefined' || !(globalThis as any).window) {
    return false;
  }

  const ethereum = (globalThis as any).window?.ethereum as EthereumProvider | undefined;
  if (!ethereum) {
    return false;
  }

  try {
    const accounts = await ethereum.request({ method: 'eth_accounts' });
    return accounts && accounts.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Sign and send a transaction using MetaMask
 * @param tx - Transaction object to sign and send
 * @returns Promise<TransactionResponse> - The sent transaction
 */
export async function sendMetaMaskTransaction(tx: {
  to?: string;
  value?: string;
  data?: string;
  gasLimit?: string;
}): Promise<any> {
  const signer = await connectMetaMaskSigner();

  console.log('📤 Sending transaction via MetaMask...');
  const transaction = await signer.sendTransaction({
    to: tx.to,
    value: tx.value ? ethers.parseEther(tx.value) : undefined,
    data: tx.data,
    gasLimit: tx.gasLimit ? parseInt(tx.gasLimit) : undefined,
  });

  console.log('✅ Transaction sent:', transaction.hash);
  return transaction;
}

/**
 * Sign a message using MetaMask
 * @param message - Message to sign
 * @returns Promise<string> - The signature
 */
export async function signMetaMaskMessage(message: string): Promise<string> {
  const signer = await connectMetaMaskSigner();

  console.log('📝 Signing message via MetaMask...');
  const signature = await signer.signMessage(message);

  console.log('✅ Message signed');
  return signature;
}

/**
 * Get MetaMask signer for contract interactions
 * @returns Promise<ethers.Contract> - Contract instance with MetaMask signer
 */
export async function getMetaMaskContract(contractAddress: string, abi: any[]): Promise<any> {
  const signer = await connectMetaMaskSigner();

  console.log('📄 Creating contract instance with MetaMask signer...');
  const contract = new ethers.Contract(contractAddress, abi, signer);

  return contract;
}
