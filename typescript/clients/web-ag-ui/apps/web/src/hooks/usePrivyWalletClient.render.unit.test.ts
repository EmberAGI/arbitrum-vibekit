import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectedWallet } from '@privy-io/react-auth';

import { usePrivyWalletClient } from './usePrivyWalletClient';

const useWalletsMock = vi.fn();
const useQueryMock = vi.fn();
const invalidateQueriesMock = vi.fn();

vi.mock('@privy-io/react-auth', () => {
  return {
    useWallets: () => useWalletsMock(),
  };
});

vi.mock('@tanstack/react-query', () => {
  return {
    useQuery: (input: unknown) => useQueryMock(input),
    useQueryClient: () => ({
      invalidateQueries: invalidateQueriesMock,
    }),
  };
});

function makeWallet(params: { address: string; walletClientType: string }): ConnectedWallet {
  return {
    address: params.address,
    walletClientType: params.walletClientType,
    switchChain: async () => {},
    getEthereumProvider: async () => ({
      request: async () => '0xa4b1',
    }),
  } as unknown as ConnectedWallet;
}

type HookResultCapture = ReturnType<typeof usePrivyWalletClient>;
const captureRef: { current: HookResultCapture | null } = { current: null };

function HookProbe(props: { preferredWalletAddress?: string }) {
  // eslint-disable-next-line react-hooks/immutability
  captureRef.current = usePrivyWalletClient(props.preferredWalletAddress);
  return React.createElement('div', null, captureRef.current.chainId ?? 'none');
}

describe('usePrivyWalletClient render integration', () => {
  beforeEach(() => {
    captureRef.current = null;
    useWalletsMock.mockReset();
    useQueryMock.mockReset();
    invalidateQueriesMock.mockReset();
  });

  it('selects preferred wallet and exposes resolved query data', async () => {
    const switchChainMock = vi.fn().mockResolvedValue(undefined);

    useWalletsMock.mockReturnValue({
      wallets: [
        makeWallet({ address: '0x1111', walletClientType: 'privy' }),
        {
          ...makeWallet({ address: '0x2222', walletClientType: 'metamask' }),
          switchChain: switchChainMock,
        },
      ],
    });

    const provider = { request: vi.fn().mockResolvedValue('0xa4b1') };
    const walletClient = { account: `0x${'a'.repeat(40)}` };

    useQueryMock
      .mockReturnValueOnce({ data: provider, isLoading: false, error: null })
      .mockReturnValueOnce({ data: 42161, isLoading: false, error: null })
      .mockReturnValueOnce({ data: walletClient, isLoading: false, error: null });

    renderToStaticMarkup(React.createElement(HookProbe, { preferredWalletAddress: '0x2222' }));

    expect(captureRef.current?.privyWallet?.address).toBe('0x2222');
    expect(captureRef.current?.chainId).toBe(42161);
    expect(captureRef.current?.walletClient).toBe(walletClient);
    expect(captureRef.current?.isLoading).toBe(false);
    expect(captureRef.current?.error).toBeNull();

    await captureRef.current?.switchChain(10);

    expect(switchChainMock).toHaveBeenCalledWith(10);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['privyWalletChainId', '0x2222'],
    });
  });

  it('returns null client and surfaces provider error when queries fail', () => {
    useWalletsMock.mockReturnValue({
      wallets: [makeWallet({ address: '0x1111', walletClientType: 'privy' })],
    });

    const providerError = new Error('provider unavailable');

    useQueryMock
      .mockReturnValueOnce({ data: null, isLoading: false, error: providerError })
      .mockReturnValueOnce({ data: null, isLoading: false, error: null })
      .mockReturnValueOnce({ data: null, isLoading: false, error: null });

    renderToStaticMarkup(React.createElement(HookProbe));

    expect(captureRef.current?.privyWallet?.address).toBe('0x1111');
    expect(captureRef.current?.walletClient).toBeNull();
    expect(captureRef.current?.chainId).toBeNull();
    expect(captureRef.current?.error?.message).toBe('provider unavailable');
  });
});
