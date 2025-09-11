/**
 * MetaMask Integration for VibeKit Web Client
 * This file contains browser-side MetaMask functions for user interactions
 */

// Note: This would typically be in a separate package or imported from autosynth
// For now, we'll define the functions here for the web client

import { ethers, parseEther } from 'ethers';

// Type declarations for MetaMask
interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
}

/**
 * Connect to MetaMask and get signer
 */
export async function connectMetaMask(): Promise<ethers.Signer> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask not detected. Please install MetaMask.');
  }

  const ethereum = (window as any).ethereum as EthereumProvider;

  try {
    console.log('🔄 Requesting MetaMask connection...');
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please connect your wallet.');
    }
    console.log('accounts----------------', accounts);
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();

    console.log('✅ MetaMask connected:', await signer.getAddress(), signer);
    return signer;

  } catch (error: any) {
    console.error('❌ MetaMask connection failed:', error);
    throw error;
  }
}

/**
 * Create a job using MetaMask for signing
 * This sends the job request to the server after user approval
 */
export async function createJobWithMetaMask(jobData: {
  jobTitle: string;
  targetContractAddress: string;
  targetFunction: string;
  abi: string;
  arguments: string[];
  scheduleTypes: string[];
  timeInterval?: number;
  cronExpression?: string;
  specificSchedule?: string;
  recurring?: boolean;
  timeFrame?: number;
  targetChainId?: string;
}) {
  try {
    // Connect to MetaMask
    const signer = await connectMetaMask();
    const userAddress = await signer.getAddress();

    // Sign a message to prove ownership (optional but recommended)
    const message = `Create AutoSynth job: ${jobData.jobTitle} for ${userAddress}`;
    const signature = await signer.signMessage(message);

    console.log('📝 Job creation approved by user');

    // Send to server with signature
    const response = await fetch('/api/create-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...jobData,
        userAddress,
        signature,
        message,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create job');
    }

    const result = await response.json();
    console.log('✅ Job created successfully:', result);
    return result;

  } catch (error) {
    console.error('❌ Job creation failed:', error);
    throw error;
  }
}

/**
 * Send a transaction using MetaMask
 */
export async function sendTransactionWithMetaMask(tx: {
  to: string;
  value?: string;
  data?: string;
}) {
  try {
    const signer = await connectMetaMask();

    console.log('📤 Sending transaction...');
    const transaction = await signer.sendTransaction({
      to: tx.to,
      value: tx.value ? parseEther(tx.value) : undefined,
      data: tx.data,
    });

    console.log('✅ Transaction sent:', transaction.hash);

    // Wait for confirmation
    const receipt = await transaction.wait();
    console.log('✅ Transaction confirmed');

    return { transaction, receipt };

  } catch (error) {
    console.error('❌ Transaction failed:', error);
    throw error;
  }
}

/**
 * Check if MetaMask is installed and connected
 */
export function isMetaMaskAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ethereum;
}

export async function isMetaMaskConnected(): Promise<boolean> {
  if (!isMetaMaskAvailable()) return false;

  try {
    const ethereum = (window as any).ethereum as EthereumProvider;
    const accounts = await ethereum.request({ method: 'eth_accounts' });
    return accounts && accounts.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get current MetaMask account
 */
export async function getMetaMaskAccount(): Promise<string | null> {
  if (!isMetaMaskAvailable()) return null;

  try {
    const ethereum = (window as any).ethereum as EthereumProvider;
    const accounts = await ethereum.request({ method: 'eth_accounts' });
    return accounts && accounts.length > 0 ? accounts[0] : null;
  } catch (error) {
    return null;
  }
}


