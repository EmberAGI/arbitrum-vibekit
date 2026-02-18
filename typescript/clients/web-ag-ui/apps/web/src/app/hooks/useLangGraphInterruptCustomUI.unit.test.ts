import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangGraphInterruptCustomUI } from './useLangGraphInterruptCustomUI';

const useLangGraphInterruptMock = vi.fn();

vi.mock('@copilotkit/react-core', () => {
  return {
    useLangGraphInterrupt: (input: unknown) => useLangGraphInterruptMock(input),
  };
});

type InterruptHookInput = {
  enabled: (input: { eventValue: unknown }) => boolean;
  render: (input: { resolve: (value: string) => void }) => React.ReactElement;
};

function Probe(props: { onEnabledValue: (value: unknown) => void }) {
  useLangGraphInterruptCustomUI({
    enabled: (eventValue): eventValue is { type: string } => {
      props.onEnabledValue(eventValue);
      return false;
    },
  });
  return React.createElement('div');
}

describe('useLangGraphInterruptCustomUI', () => {
  beforeEach(() => {
    useLangGraphInterruptMock.mockReset();
  });

  it('normalizes JSON-string interrupt payloads before enabled predicate', () => {
    let seenValue: unknown = null;

    useLangGraphInterruptMock.mockImplementation((input: InterruptHookInput) => {
      input.render({ resolve: vi.fn() });
      input.enabled({
        eventValue: JSON.stringify({
          type: 'pendle-delegation-signing-request',
          message: 'Approve delegations',
        }),
      });
      return null;
    });

    renderToStaticMarkup(
      React.createElement(Probe, {
        onEnabledValue: (value) => {
          seenValue = value;
        },
      }),
    );

    expect(seenValue).toEqual({
      type: 'pendle-delegation-signing-request',
      message: 'Approve delegations',
    });
  });
});
