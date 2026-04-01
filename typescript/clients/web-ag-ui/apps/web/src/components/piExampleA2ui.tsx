'use client';

import { A2UIViewer, initializeDefaultCatalog, type A2UIActionEvent, type ComponentInstance } from '@a2ui/react';
import { injectStyles } from '@a2ui/react/styles';
import { useEffect } from 'react';

initializeDefaultCatalog();

let didInjectStyles = false;

function ensureA2UiStyles(): void {
  if (didInjectStyles || typeof document === 'undefined') {
    return;
  }

  injectStyles();
  didInjectStyles = true;
}

export type PiExampleA2UiView = {
  root: string;
  components: ComponentInstance[];
  data: Record<string, unknown>;
};

export function buildPiExampleStatusA2UiView(params: {
  title: string;
  body: string;
}): PiExampleA2UiView {
  return {
    root: 'root',
    components: [
      {
        id: 'root',
        component: { Card: { child: 'content-column' } },
      },
      {
        id: 'content-column',
        component: {
          Column: {
            children: {
              explicitList: ['title-node', 'body-node'],
            },
          },
        },
      },
      {
        id: 'title-node',
        component: {
          Text: {
            text: { path: '/title' },
            usageHint: 'h5',
          },
        },
      },
      {
        id: 'body-node',
        component: {
          Text: {
            text: { path: '/body' },
            usageHint: 'body',
          },
        },
      },
    ],
    data: {
      title: params.title,
      body: params.body,
    },
  };
}

export function buildPiExampleInterruptA2UiView(params: {
  title: string;
  message: string;
  inputLabel: string;
  submitLabel: string;
  artifactId?: string;
}): PiExampleA2UiView {
  return {
    root: 'root',
    components: [
      {
        id: 'root',
        component: { Card: { child: 'content-column' } },
      },
      {
        id: 'content-column',
        component: {
          Column: {
            children: {
              explicitList: ['title-node', 'message-node', 'input-node', 'button-node'],
            },
          },
        },
      },
      {
        id: 'title-node',
        component: {
          Text: {
            text: { path: '/title' },
            usageHint: 'h5',
          },
        },
      },
      {
        id: 'message-node',
        component: {
          Text: {
            text: { path: '/message' },
            usageHint: 'body',
          },
        },
      },
      {
        id: 'input-node',
        component: {
          TextField: {
            label: { path: '/inputLabel' },
            text: { path: '/operatorNote' },
            type: 'longText',
          },
        },
      },
      {
        id: 'button-node',
        component: {
          Button: {
            child: 'button-label-node',
            action: {
              name: 'submitOperatorNote',
              context: [
                {
                  key: 'operatorNote',
                  value: { path: '/operatorNote' },
                },
                {
                  key: 'artifactId',
                  value: { path: '/artifactId' },
                },
                {
                  key: 'message',
                  value: { path: '/message' },
                },
              ],
            },
          },
        },
      },
      {
        id: 'button-label-node',
        component: {
          Text: {
            text: { path: '/submitLabel' },
            usageHint: 'body',
          },
        },
      },
    ],
    data: {
      title: params.title,
      message: params.message,
      inputLabel: params.inputLabel,
      submitLabel: params.submitLabel,
      artifactId: params.artifactId ?? '',
      operatorNote: '',
    },
  };
}

export function PiExampleA2UiCard(props: {
  view: PiExampleA2UiView;
  onAction?: (action: A2UIActionEvent) => void;
}) {
  useEffect(() => {
    ensureA2UiStyles();
  }, []);

  return (
    <A2UIViewer
      root={props.view.root}
      components={props.view.components}
      data={props.view.data}
      onAction={props.onAction}
      className="pi-example-a2ui-view"
    />
  );
}
