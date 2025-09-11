/**
 * MetaMask Connector Component
 * Provides UI for connecting MetaMask and managing wallet interactions
 */

import React, { useState, useEffect } from 'react';
import {
  connectMetaMask,
  createJobWithMetaMask,
  sendTransactionWithMetaMask,
  isMetaMaskAvailable,
  isMetaMaskConnected,
  getMetaMaskAccount
} from '../utils/metamask-integration';

interface MetaMaskConnectorProps {
  onConnect?: (address: string) => void;
  onDisconnect?: () => void;
  children?: React.ReactNode;
}

export function MetaMaskConnector({ onConnect, onDisconnect, children }: MetaMaskConnectorProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check connection status on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const connected = await isMetaMaskConnected();
      setIsConnected(connected);

      if (connected) {
        const currentAccount = await getMetaMaskAccount();
        setAccount(currentAccount);
        onConnect?.(currentAccount!);
      }
    } catch (err) {
      console.error('Failed to check MetaMask connection:', err);
    }
  };

  const handleConnect = async () => {
    if (!isMetaMaskAvailable()) {
      setError('MetaMask is not installed. Please install MetaMask extension.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const signer = await connectMetaMask();
      const address = await signer.getAddress();

      setAccount(address);
      setIsConnected(true);
      onConnect?.(address);

      console.log('✅ MetaMask connected successfully');

    } catch (err: any) {
      console.error('❌ MetaMask connection failed:', err);
      setError(err.message || 'Failed to connect MetaMask');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setAccount(null);
    setIsConnected(false);
    onDisconnect?.();
  };

  const handleCreateJob = async (jobData: any) => {
    if (!isConnected) {
      setError('Please connect MetaMask first');
      return;
    }

    try {
      setError(null);
      const result = await createJobWithMetaMask(jobData);
      console.log('✅ Job created:', result);
      return result;
    } catch (err: any) {
      console.error('❌ Job creation failed:', err);
      setError(err.message || 'Failed to create job');
      throw err;
    }
  };

  if (!isMetaMaskAvailable()) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center">
          <div className="text-yellow-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">MetaMask Required</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Please install the MetaMask browser extension to use this feature.
            </p>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-yellow-800 underline hover:text-yellow-900"
            >
              Install MetaMask →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {isConnected ? 'MetaMask Connected' : 'MetaMask Disconnected'}
            </p>
            {account && (
              <p className="text-xs text-gray-500">
                {account.slice(0, 6)}...{account.slice(-4)}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={isConnected ? handleDisconnect : handleConnect}
          disabled={isConnecting}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            isConnected
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect MetaMask'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <div className="text-red-600">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="ml-3 text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Children with MetaMask context */}
      {children && isConnected && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          {React.cloneElement(children as React.ReactElement, {
            metamask: {
              account,
              createJob: handleCreateJob,
              sendTransaction: sendTransactionWithMetaMask,
            }
          })}
        </div>
      )}
    </div>
  );
}

// Export utility functions for external use
export {
  connectMetaMask,
  createJobWithMetaMask,
  sendTransactionWithMetaMask,
  isMetaMaskAvailable,
  isMetaMaskConnected,
  getMetaMaskAccount
};


