// @vitest-environment jsdom

import { act, useEffect, useState, type ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Providers } from './Providers';

type TestWallet = {
  address: string;
  walletClientType: string;
};

const mocks = vi.hoisted(() => ({
  wallets: [] as TestWallet[],
}));

vi.mock('@privy-io/react-auth', () => ({
  useWallets: () => ({
    wallets: mocks.wallets,
  }),
}));

vi.mock('./PrivyClientProvider', () => ({
  PrivyClientProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../contexts/AgentListContext', () => ({
  AgentListProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

let sessionMountCounter = 0;

function SessionProbe(params: {
  onMount: (mountId: number) => void;
  onUnmount: (mountId: number) => void;
}) {
  const [mountId] = useState(() => {
    sessionMountCounter += 1;
    return sessionMountCounter;
  });

  useEffect(() => {
    params.onMount(mountId);
    return () => {
      params.onUnmount(mountId);
    };
  }, [mountId, params]);

  return <div data-testid={`session-${mountId}`} />;
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Providers', () => {
  let clearQueryClientSpy: ReturnType<typeof vi.spyOn>;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionMountCounter = 0;
    mocks.wallets = [];
    clearQueryClientSpy = vi.spyOn(QueryClient.prototype, 'clear');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    clearQueryClientSpy.mockRestore();
  });

  it('resets app memory and clears query cache when the selected privy wallet signs out and a new wallet signs in', async () => {
    const mountedIds: number[] = [];
    const unmountedIds: number[] = [];

    mocks.wallets = [
      {
        address: '0xbD70792F773a39f88b43d35bb5Aa3d5e098EfeA4',
        walletClientType: 'privy',
      },
    ];

    await act(async () => {
      root.render(
        <Providers>
          <SessionProbe
            onMount={(mountId) => {
              mountedIds.push(mountId);
            }}
            onUnmount={(mountId) => {
              unmountedIds.push(mountId);
            }}
          />
        </Providers>,
      );
    });
    await flushEffects();

    expect(mountedIds).toEqual([1]);
    expect(unmountedIds).toEqual([]);
    expect(clearQueryClientSpy).not.toHaveBeenCalled();

    mocks.wallets = [];
    await act(async () => {
      root.render(
        <Providers>
          <SessionProbe
            onMount={(mountId) => {
              mountedIds.push(mountId);
            }}
            onUnmount={(mountId) => {
              unmountedIds.push(mountId);
            }}
          />
        </Providers>,
      );
    });
    await flushEffects();

    expect(mountedIds).toEqual([1, 2]);
    expect(unmountedIds).toEqual([1]);
    expect(clearQueryClientSpy).toHaveBeenCalledTimes(1);

    mocks.wallets = [
      {
        address: '0xaD53eC51a70e9a17df6752fdA80cd465457c258d',
        walletClientType: 'privy',
      },
    ];
    await act(async () => {
      root.render(
        <Providers>
          <SessionProbe
            onMount={(mountId) => {
              mountedIds.push(mountId);
            }}
            onUnmount={(mountId) => {
              unmountedIds.push(mountId);
            }}
          />
        </Providers>,
      );
    });
    await flushEffects();

    expect(mountedIds).toEqual([1, 2, 3]);
    expect(unmountedIds).toEqual([1, 2]);
    expect(clearQueryClientSpy).toHaveBeenCalledTimes(2);
  });
});
