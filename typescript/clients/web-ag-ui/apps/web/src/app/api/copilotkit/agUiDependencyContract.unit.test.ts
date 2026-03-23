import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { EventType } from '@ag-ui/core';
import { lastValueFrom, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';

function packageRootFromEntry(entryPath: string): string {
  const distSegment = `${path.sep}dist${path.sep}`;
  const distIndex = entryPath.indexOf(distSegment);
  return distIndex === -1 ? path.dirname(entryPath) : entryPath.slice(0, distIndex);
}

function createEventStream(events: unknown[]) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      controller.close();
    },
  });
}

describe('CopilotKit AG-UI dependency contract', () => {
  it('resolves current AG-UI versions through all browser-facing CopilotKit packages', () => {
    const browserPackages = [
      { label: '@copilotkit/react-core', resolver: createRequire(require.resolve('@copilotkit/react-core')) },
      { label: '@copilotkit/react-ui', resolver: createRequire(require.resolve('@copilotkit/react-ui')) },
      { label: '@copilotkit/runtime', resolver: createRequire(require.resolve('@copilotkit/runtime')) },
      { label: '@copilotkit/shared', resolver: createRequire(require.resolve('@copilotkit/shared')) },
      { label: '@copilotkitnext/core', resolver: createRequire(require.resolve('@copilotkitnext/core')) },
      {
        label: '@copilotkitnext/react via @copilotkit/react-ui',
        resolver: createRequire(
          createRequire(require.resolve('@copilotkit/react-ui')).resolve('@copilotkitnext/react'),
        ),
      },
      {
        label: '@copilotkitnext/shared via @copilotkit/react-ui',
        resolver: createRequire(
          createRequire(require.resolve('@copilotkit/react-ui')).resolve('@copilotkitnext/shared'),
        ),
      },
      {
        label: '@copilotkitnext/web-inspector via @copilotkit/react-ui',
        resolver: createRequire(
          createRequire(require.resolve('@copilotkit/react-ui')).resolve('@copilotkitnext/web-inspector'),
        ),
      },
      {
        label: '@copilotkitnext/runtime via @copilotkit/runtime',
        resolver: createRequire(
          createRequire(require.resolve('@copilotkit/runtime')).resolve('@copilotkitnext/runtime'),
        ),
      },
    ];

    for (const pkg of browserPackages) {
      const agUiClientEntry = pkg.resolver.resolve('@ag-ui/client');
      const agUiClientRoot = packageRootFromEntry(agUiClientEntry);
      const agUiClientPackageJson = JSON.parse(
        fs.readFileSync(path.join(agUiClientRoot, 'package.json'), 'utf8'),
      ) as { version: string };

      expect(agUiClientPackageJson.version, `${pkg.label} should use the current AG-UI client`).toBe(
        '0.0.47',
      );
    }
  });

  it('resolves an AG-UI client through react-core that accepts reasoning events', async () => {
    const reactCoreEntry = require.resolve('@copilotkit/react-core');
    const reactCoreRequire = createRequire(reactCoreEntry);
    const agUiClientEntry = reactCoreRequire.resolve('@ag-ui/client');
    const agUiClientRoot = packageRootFromEntry(agUiClientEntry);
    const agUiClientPackageJson = JSON.parse(
      fs.readFileSync(path.join(agUiClientRoot, 'package.json'), 'utf8'),
    ) as { version: string };

    const agUiClientModule = (await import(pathToFileURL(agUiClientEntry).href)) as {
      transformHttpEventStream: (
        source$: import('rxjs').Observable<{
          type: 'headers' | 'data';
          status?: number;
          headers?: Headers;
          data?: Uint8Array;
        }>,
      ) => import('rxjs').Observable<{ type: string }>;
    };

    const source$ = new (await import('rxjs')).Observable<{
      type: 'headers' | 'data';
      status?: number;
      headers?: Headers;
      data?: Uint8Array;
    }>((observer) => {
      observer.next({
        type: 'headers',
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
      });

      const stream = createEventStream([
        { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
        {
          type: EventType.REASONING_START,
          threadId: 'thread-1',
          runId: 'run-1',
          messageId: 'reasoning-1',
        },
        {
          type: EventType.REASONING_MESSAGE_START,
          threadId: 'thread-1',
          runId: 'run-1',
          messageId: 'reasoning-1',
          role: 'reasoning',
        },
        {
          type: EventType.REASONING_MESSAGE_CONTENT,
          threadId: 'thread-1',
          runId: 'run-1',
          messageId: 'reasoning-1',
          delta: 'Inspecting the request.',
        },
        {
          type: EventType.REASONING_MESSAGE_END,
          threadId: 'thread-1',
          runId: 'run-1',
          messageId: 'reasoning-1',
        },
        {
          type: EventType.REASONING_END,
          threadId: 'thread-1',
          runId: 'run-1',
          messageId: 'reasoning-1',
        },
        { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
      ]);

      const reader = stream.getReader();
      void (async () => {
        while (true) {
          const chunk = await reader.read();

          if (chunk.done) {
            observer.complete();
            return;
          }

          observer.next({ type: 'data', data: chunk.value });
        }
      })();
    });

    const events = await lastValueFrom(
      agUiClientModule.transformHttpEventStream(source$).pipe(toArray()),
    );

    expect(agUiClientPackageJson.version).toBe('0.0.47');
    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.REASONING_START,
      EventType.REASONING_MESSAGE_START,
      EventType.REASONING_MESSAGE_CONTENT,
      EventType.REASONING_MESSAGE_END,
      EventType.REASONING_END,
      EventType.RUN_FINISHED,
    ]);
  });
});
