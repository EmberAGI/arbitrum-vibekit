import { describe, expect, it } from 'vitest';
import { Observable } from 'rxjs';
import { transformHttpEventStream } from '@ag-ui/client';

function createAbortError(): Error {
  // DOMException is available in Node 18+; fall back to a named Error.
  try {
    // eslint-disable-next-line no-new
    return new DOMException('aborted', 'AbortError') as unknown as Error;
  } catch {
    const error = new Error('aborted');
    (error as Error & { name: string }).name = 'AbortError';
    return error;
  }
}

describe('@ag-ui/client AbortError handling', () => {
  it('treats AbortError as a normal completion (no RUN_ERROR event emitted)', async () => {
    const source$ = new Observable<{ type: 'headers' | 'data'; status?: number; headers?: Headers; data?: Uint8Array }>(
      (observer) => {
        observer.next({
          type: 'headers',
          status: 200,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
        });
        observer.error(createAbortError());
      },
    );

    const events: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      transformHttpEventStream(source$ as any).subscribe({
        next: (event) => events.push(event),
        error: reject,
        complete: resolve,
      });
    });

    expect(events).toEqual([]);
  });
});
