import { expect } from 'vitest';

type SnapshotLike = {
  thread?: {
    id?: unknown;
    lifecycle?: {
      phase?: unknown;
    };
    task?: {
      taskStatus?: {
        state?: unknown;
        message?: unknown;
      };
    };
  };
};

export function assertSharedThreadSnapshotContract(snapshot: unknown): void {
  expect(snapshot).toEqual(
    expect.objectContaining({
      thread: expect.objectContaining({
        id: expect.any(String),
        lifecycle: expect.objectContaining({
          phase: expect.any(String),
        }),
        task: expect.objectContaining({
          taskStatus: expect.objectContaining({
            state: expect.any(String),
          }),
        }),
      }),
    }),
  );

  const taskMessage = (snapshot as SnapshotLike).thread?.task?.taskStatus?.message;

  if (taskMessage === undefined) {
    return;
  }

  expect(taskMessage).toEqual(
    expect.objectContaining({
      content: expect.any(String),
    }),
  );
}
