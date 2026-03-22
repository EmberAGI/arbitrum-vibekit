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

function renderPiExamplePage(
  container: HTMLDivElement,
  overrides: Partial<React.ComponentProps<typeof AgentDetailPage>> = {},
) {
  const root = createRoot(container);

  act(() => {
    root.render(
      React.createElement(AgentDetailPage, {
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
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
        ...overrides,
      }),
    );
  });

  return root;
}

describe('AgentDetailPage Pi example A2UI rendering', () => {
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

  it('renders automation status cards through the A2UI renderer', () => {
    const root = renderPiExamplePage(container, {
      events: [
        {
          type: 'artifact',
          artifact: {
            artifactId: 'automation-artifact',
            data: {
              type: 'automation-status',
              status: 'scheduled',
              command: 'sync',
              detail: 'Scheduled sync every 5 minutes.',
            },
          },
        },
        {
          type: 'dispatch-response',
          parts: [
            {
              kind: 'a2ui',
              data: {
                payload: {
                  kind: 'automation-status',
                  payload: {
                    status: 'scheduled',
                    command: 'sync',
                    detail: 'Scheduled sync every 5 minutes.',
                  },
                },
              },
            },
          ],
        },
      ] as never,
    });

    expect(container.querySelector('.a2ui-card')).not.toBeNull();
    expect(container.textContent).toContain('Automation scheduled');
    expect(container.textContent).toContain('Scheduled sync every 5 minutes.');

    act(() => {
      root.unmount();
    });
  });

  it('renders the interrupt flow through an A2UI text field and button, then sends the operator note', () => {
    const onSendChatMessage = vi.fn();
    const root = renderPiExamplePage(container, {
      events: [
        {
          type: 'dispatch-response',
          parts: [
            {
              kind: 'a2ui',
              data: {
                payload: {
                  kind: 'interrupt',
                  payload: {
                    type: 'operator-config-request',
                    artifactId: 'interrupt-artifact',
                    message: 'Please provide a short operator note to continue.',
                    inputLabel: 'Operator note',
                    submitLabel: 'Continue agent loop',
                  },
                },
              },
            },
          ],
        },
      ] as never,
      onSendChatMessage,
    });

    expect(container.querySelector('.a2ui-textfield')).not.toBeNull();
    expect(container.querySelector('.a2ui-button')).not.toBeNull();

    const interruptTextarea = Array.from(container.querySelectorAll('textarea')).find((textarea) =>
      textarea.parentElement?.textContent?.includes('Operator note'),
    );
    expect(interruptTextarea).toBeDefined();

    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setValue?.call(interruptTextarea, 'Use the safe automation window');
      interruptTextarea!.dispatchEvent(
        new InputEvent('input', { bubbles: true, data: 'Use the safe automation window' }),
      );
    });

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Continue agent loop'),
    );
    expect(submitButton).toBeDefined();

    act(() => {
      submitButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSendChatMessage).toHaveBeenCalledWith('Operator note: Use the safe automation window');

    act(() => {
      root.unmount();
    });
  });
});
