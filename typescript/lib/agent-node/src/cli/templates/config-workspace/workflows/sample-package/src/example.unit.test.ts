import type { WorkflowContext } from '@emberai/agent-node/workflow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./workflow-logger.js', () => ({
  logWorkflowEvent: vi.fn(),
}));

import { logWorkflowEvent } from './workflow-logger.js';

import plugin from './index.js';

const createContext = (): WorkflowContext =>
  ({
    taskId: 'unit-test-task',
    parameters: {
      message: 'unit-test',
      count: 1,
    },
  }) as WorkflowContext;

describe('sample workflow plugin', () => {
  it('logs lifecycle boundaries', async () => {
    const iterator = plugin.execute(createContext());

    await iterator.next();
    await iterator.next();
    await iterator.next();
    await iterator.next();
    await iterator.next();
    await iterator.next({ confirmed: true });
    await iterator.next();
    await iterator.next();
    await iterator.next();

    expect(logWorkflowEvent).toHaveBeenCalledWith('sample workflow received request: unit-test');
    expect(logWorkflowEvent).toHaveBeenCalledWith('sample workflow finalized successfully');
  });
});
