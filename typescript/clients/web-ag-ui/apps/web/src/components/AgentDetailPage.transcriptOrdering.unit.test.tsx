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

function renderPage(messages: Message[], overrides: Partial<React.ComponentProps<typeof AgentDetailPage>> = {}) {
  return React.createElement(AgentDetailPage, {
    agentId: 'agent-portfolio-manager',
    agentName: 'Ember Portfolio Agent',
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
    ...overrides,
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

  it('renders later transcript order exactly as provided when an assistant reply becomes visible later', () => {
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
    expect(transcriptText.indexOf('Here is the final answer.')).toBeLessThan(
      transcriptText.indexOf('Thinking through the request first.'),
    );

    act(() => {
      root.unmount();
    });
  });

  it('renders canonical replacement message ids in the order supplied by the runtime', () => {
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
    expect(transcriptText.indexOf('Scheduled a sync every minute.')).toBeLessThan(
      transcriptText.indexOf('Schedule a sync every minute.'),
    );

    act(() => {
      root.unmount();
    });
  });

  it('renders new user, reasoning, and assistant turns in the order supplied by the runtime', () => {
    const root = createRoot(container);
    const initialMessages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'hi',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Hello there.',
      },
    ];

    act(() => {
      root.render(renderPage(initialMessages));
    });

    const updatedMessages: Message[] = [
      ...initialMessages,
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'Here is the next answer.',
      },
      {
        id: 'reasoning-2',
        role: 'reasoning',
        content: 'Thinking about the follow-up.',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'tell me more',
      },
    ];

    act(() => {
      root.render(renderPage(updatedMessages));
    });

    const transcriptText = container.textContent ?? '';
    expect(transcriptText).toContain('tell me more');
    expect(transcriptText).toContain('Thinking about the follow-up.');
    expect(transcriptText).toContain('Here is the next answer.');
    expect(transcriptText.indexOf('Here is the next answer.')).toBeLessThan(
      transcriptText.indexOf('Thinking about the follow-up.'),
    );
    expect(transcriptText.indexOf('Thinking about the follow-up.')).toBeLessThan(
      transcriptText.indexOf('tell me more'),
    );

    act(() => {
      root.unmount();
    });
  });

  it('renders later runtime snapshots in the order supplied even when reasoning follows its assistant', () => {
    const root = createRoot(container);
    const initialMessages: Message[] = [
      {
        id: 'reasoning-1',
        role: 'reasoning',
        parentMessageId: 'assistant-1',
        content: 'Thinking through the first answer.',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Here is the first answer.',
      },
    ];

    act(() => {
      root.render(renderPage(initialMessages));
    });

    let transcriptText = container.textContent ?? '';
    expect(transcriptText.indexOf('Thinking through the first answer.')).toBeLessThan(
      transcriptText.indexOf('Here is the first answer.'),
    );

    const laterSnapshotMessages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Here is the first answer.',
      },
      {
        id: 'reasoning-1',
        role: 'reasoning',
        parentMessageId: 'assistant-1',
        content: 'Thinking through the first answer.',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'tell me more',
      },
    ];

    act(() => {
      root.render(renderPage(laterSnapshotMessages));
    });

    transcriptText = container.textContent ?? '';
    expect(transcriptText.indexOf('Here is the first answer.')).toBeLessThan(
      transcriptText.indexOf('Thinking through the first answer.'),
    );

    act(() => {
      root.unmount();
    });
  });

  it('renders later runtime snapshots in the order supplied even without reasoning parent linkage', () => {
    const root = createRoot(container);
    const initialMessages: Message[] = [
      {
        id: 'reasoning-1',
        role: 'reasoning',
        content: 'Thinking through the first answer.',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Here is the first answer.',
      },
    ];

    act(() => {
      root.render(renderPage(initialMessages));
    });

    let transcriptText = container.textContent ?? '';
    expect(transcriptText.indexOf('Thinking through the first answer.')).toBeLessThan(
      transcriptText.indexOf('Here is the first answer.'),
    );

    const laterSnapshotMessages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Here is the first answer.',
      },
      {
        id: 'reasoning-1',
        role: 'reasoning',
        content: 'Thinking through the first answer.',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'tell me more',
      },
    ];

    act(() => {
      root.render(renderPage(laterSnapshotMessages));
    });

    transcriptText = container.textContent ?? '';
    expect(transcriptText.indexOf('Here is the first answer.')).toBeLessThan(
      transcriptText.indexOf('Thinking through the first answer.'),
    );

    act(() => {
      root.unmount();
    });
  });

  it('does not special-case legacy sync envelope content in the transcript', () => {
    const root = createRoot(container);
    const syncAckContent = JSON.stringify({ status: 'synced', clientMutationId: 'sync-1' });
    const syncCommandContent = JSON.stringify({ command: 'sync', clientMutationId: 'sync-1' });
    const messages: Message[] = [
      {
        id: 'user-sync-1',
        role: 'user',
        content: syncCommandContent,
      },
      {
        id: 'assistant-sync-1',
        role: 'assistant',
        content: syncAckContent,
      },
      {
        id: 'reasoning-sync-1',
        role: 'reasoning',
        parentMessageId: 'assistant-sync-1',
        content: 'Thinking about how to acknowledge the sync request.',
      },
      {
        id: 'reasoning-visible-1',
        role: 'reasoning',
        parentMessageId: 'assistant-visible-1',
        content: 'Thinking about the actual portfolio update.',
      },
      {
        id: 'assistant-visible-1',
        role: 'assistant',
        content: 'Here is the portfolio update you asked for.',
      },
    ];

    act(() => {
      root.render(renderPage(messages));
    });

    const transcriptText = container.textContent ?? '';
    expect(transcriptText).toContain(syncCommandContent);
    expect(transcriptText).toContain(syncAckContent);
    expect(transcriptText).toContain('Thinking about how to acknowledge the sync request.');
    expect(transcriptText).toContain('Thinking about the actual portfolio update.');
    expect(transcriptText).toContain('Here is the portfolio update you asked for.');

    act(() => {
      root.unmount();
    });
  });

  it('keeps unlinked reasoning visible alongside a legacy sync acknowledgment', () => {
    const root = createRoot(container);
    const syncAckContent = JSON.stringify({ status: 'synced', clientMutationId: 'sync-1' });
    const messages: Message[] = [
      {
        id: 'assistant-sync-1',
        role: 'assistant',
        content: syncAckContent,
      },
      {
        id: 'reasoning-unlinked-1',
        role: 'reasoning',
        content: 'Thinking about whether the sync completed cleanly.',
      },
    ];

    act(() => {
      root.render(renderPage(messages));
    });

    const transcriptText = container.textContent ?? '';
    expect(transcriptText).toContain(syncAckContent);
    expect(transcriptText).toContain('Thinking about whether the sync completed cleanly.');

    act(() => {
      root.unmount();
    });
  });

  it('keeps reasoning visible even when the runtime encodes the linked assistant id inside the reasoning message id', () => {
    const root = createRoot(container);
    const linkedAssistantId = 'pi:agent-runtime:thread-1:assistant:1775509885583';
    const messages: Message[] = [
      {
        id: linkedAssistantId,
        role: 'assistant',
        content: JSON.stringify({ status: 'synced', clientMutationId: 'sync-1' }),
      },
      {
        id: `pi:agent-runtime:thread-1:reasoning:${linkedAssistantId}:0`,
        role: 'reasoning',
        content: '**Considering sync response**\n\nLet me acknowledge the sync.',
      },
      {
        id: 'assistant-visible-1',
        role: 'assistant',
        content: 'Visible assistant reply.',
      },
    ];

    act(() => {
      root.render(renderPage(messages));
    });

    const transcriptText = container.textContent ?? '';
    expect(transcriptText).toContain('Considering sync response');
    expect(transcriptText).toContain('Visible assistant reply.');

    act(() => {
      root.unmount();
    });
  });
});
