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

function renderChatFirstPage(
  container: HTMLDivElement,
  overrides: Partial<React.ComponentProps<typeof AgentDetailPage>> = {},
) {
  const root = createRoot(container);

  act(() => {
    root.render(
      React.createElement(AgentDetailPage, {
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

describe('AgentDetailPage chat-first A2UI rendering', () => {
  let container: HTMLDivElement;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
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
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    consoleErrorSpy.mockRestore();
    container.remove();
  });

  it('keeps automation status events out of the chat transcript', () => {
    const root = renderChatFirstPage(container, {
      events: [
        {
          type: 'artifact',
          artifact: {
            artifactId: 'automation-artifact',
            data: {
              type: 'automation-status',
              status: 'scheduled',
              command: 'refresh',
              detail: 'Scheduled refresh every 5 minutes.',
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
                    command: 'refresh',
                    detail: 'Scheduled refresh every 5 minutes.',
                  },
                },
              },
            },
          ],
        },
      ] as never,
    });

    expect(container.querySelector('.a2ui-card')).toBeNull();
    expect(container.textContent).not.toContain('Automation scheduled');
    expect(container.textContent).not.toContain('Scheduled refresh every 5 minutes.');

    act(() => {
      root.unmount();
    });
  });

  it('renders the interrupt flow through an A2UI text field and button, then resolves through interrupt submit', () => {
    const onInterruptSubmit = vi.fn();
    const root = renderChatFirstPage(container, {
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
      onInterruptSubmit,
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

    expect(onInterruptSubmit).toHaveBeenCalledWith({
      operatorNote: 'Use the safe automation window',
    });

    act(() => {
      root.unmount();
    });
  });

  it('keeps repeated automation artifact history out of chat without duplicate React child keys', () => {
    const root = renderChatFirstPage(container, {
      events: [
        {
          type: 'artifact',
          artifact: {
            artifactId: 'automation-artifact',
            data: {
              type: 'automation-status',
              status: 'running',
              command: 'refresh',
              detail: 'Running automation refresh.',
            },
          },
        },
        {
          type: 'artifact',
          artifact: {
            artifactId: 'automation-artifact',
            data: {
              type: 'automation-status',
              status: 'completed',
              command: 'refresh',
              detail: 'Automation refresh executed successfully.',
            },
          },
        },
      ] as never,
    });

    expect(container.textContent).not.toContain('Running automation refresh.');
    expect(container.textContent).not.toContain('Automation refresh executed successfully.');
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Encountered two children with the same key'),
    );

    act(() => {
      root.unmount();
    });
  });

  it('renders lifecycle artifact updates after operator-note submission', () => {
    const root = renderChatFirstPage(container, {
      events: [
        {
          type: 'artifact',
          artifact: {
            artifactId: 'lifecycle-artifact',
            data: {
              type: 'lifecycle-status',
              phase: 'onboarding',
              onboardingStep: 'delegation-note',
              operatorNote: '5',
            },
          },
        },
      ] as never,
    });

    expect(container.textContent).toContain('Lifecycle onboarding');
    expect(container.textContent).toContain('Step: delegation-note');
    expect(container.textContent).toContain('Operator note: 5');

    act(() => {
      root.unmount();
    });
  });
});
