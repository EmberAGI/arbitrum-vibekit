// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDetailPage } from './AgentDetailPage';

vi.mock('../hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      walletClient: null,
      privyWallet: null,
      chainId: null,
      switchChain: async () => {},
      isLoading: false,
      error: null,
    }),
  };
});

describe('AgentDetailPage chat composer', () => {
  let container: HTMLDivElement;
  const previousActEnvironment = (globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }).IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    container.remove();
  });

  it.each([
    ['agent-pi-example', 'Pi Example Agent'],
    ['agent-portfolio-manager', 'Ember Portfolio Agent'],
  ])('submits the chat draft for %s when Enter is pressed without Shift', (agentId, agentName) => {
    const onSendChatMessage = vi.fn();
    const root = createRoot(container);

    act(() => {
      root.render(
        React.createElement(AgentDetailPage, {
          agentId,
          agentName,
          agentDescription: 'desc',
          creatorName: 'Ember AI Team',
          creatorVerified: true,
          profile: {
            chains: [],
            protocols: [],
            tokens: [],
          },
          metrics: {},
          initialTab: 'chat',
          isHired: false,
          isHiring: false,
          hasLoadedView: true,
          onHire: () => {},
          onFire: () => {},
          onSync: () => {},
          onBack: () => {},
          allowedPools: [],
          onSendChatMessage,
        }),
      );
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();

    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setValue?.call(textarea, 'Explain your reasoning flow');
      textarea!.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Explain your reasoning flow' }));
    });

    act(() => {
      textarea!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
        }),
      );
    });

    expect(onSendChatMessage).toHaveBeenCalledWith('Explain your reasoning flow');

    act(() => {
      root.unmount();
    });
  });
});
