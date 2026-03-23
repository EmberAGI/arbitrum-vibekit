// @vitest-environment jsdom

import React from 'react';
import type { Message } from '@ag-ui/core';
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

function renderPage(messages: Message[]) {
  return React.createElement(AgentDetailPage, {
    agentId: 'agent-pi-example',
    agentName: 'Pi Example Agent',
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
    messages,
    onHire: () => {},
    onFire: () => {},
    onSync: () => {},
    onBack: () => {},
    allowedPools: [],
  });
}

describe('AgentDetailPage transcript ordering', () => {
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

  it('keeps reasoning ahead of an assistant reply that becomes visible later', () => {
    const root = createRoot(container);
    const initialMessages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
      },
      {
        id: 'reasoning-1',
        role: 'reasoning',
        content: 'Thinking through the request first.',
      },
    ];

    act(() => {
      root.render(renderPage(initialMessages));
    });

    expect(container.textContent).toContain('Thinking through the request first.');
    expect(container.textContent).not.toContain('Here is the final answer.');

    const updatedMessages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Here is the final answer.',
      },
      {
        id: 'reasoning-1',
        role: 'reasoning',
        content: 'Thinking through the request first.',
      },
    ];

    act(() => {
      root.render(renderPage(updatedMessages));
    });

    const transcriptText = container.textContent ?? '';
    expect(transcriptText).toContain('Thinking through the request first.');
    expect(transcriptText).toContain('Here is the final answer.');
    expect(transcriptText.indexOf('Thinking through the request first.')).toBeLessThan(
      transcriptText.indexOf('Here is the final answer.'),
    );

    act(() => {
      root.unmount();
    });
  });

  it('keeps a canonical user message ahead of a new assistant reply when the user message id changes', () => {
    const root = createRoot(container);
    const initialMessages: Message[] = [
      {
        id: 'user-temp-1',
        role: 'user',
        content: 'Schedule a sync every minute.',
      },
    ];

    act(() => {
      root.render(renderPage(initialMessages));
    });

    const updatedMessages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Scheduled a sync every minute.',
      },
      {
        id: 'user-canonical-1',
        role: 'user',
        content: 'Schedule a sync every minute.',
      },
    ];

    act(() => {
      root.render(renderPage(updatedMessages));
    });

    const transcriptText = container.textContent ?? '';
    expect(transcriptText).toContain('Schedule a sync every minute.');
    expect(transcriptText).toContain('Scheduled a sync every minute.');
    expect(transcriptText.indexOf('Schedule a sync every minute.')).toBeLessThan(
      transcriptText.indexOf('Scheduled a sync every minute.'),
    );

    act(() => {
      root.unmount();
    });
  });
});
