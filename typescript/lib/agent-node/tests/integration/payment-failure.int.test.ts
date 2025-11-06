import type { Message, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { DefaultExecutionEventBusManager, InMemoryTaskStore } from '@a2a-js/sdk/server';
import type { AgentExecutionEvent, ExecutionEventBus } from '@a2a-js/sdk/server';
import { v7 as uuidv7 } from 'uuid';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { z } from 'zod';

import { WorkflowHandler } from '../../src/a2a/handlers/workflowHandler.js';
import { ContextManager } from '../../src/a2a/sessions/manager.js';
import { serviceConfig } from '../../src/config.js';
import * as x402Server from '../../src/utils/ap2/x402-server.js';
import { WorkflowRuntime } from '../../src/workflow/runtime.js';
import type {
  WorkflowPlugin,
  WorkflowContext,
  WorkflowState,
  PaymentSettlement,
} from '../../src/workflow/types.js';
import {
  X402_STATUS_KEY,
  X402_PAYMENT_PAYLOAD_KEY,
  X402_ERROR_KEY,
  X402_FAILURE_STAGE_KEY,
  X402_RECEIPTS_KEY,
  X402_REQUIREMENTS_KEY,
} from '../../src/workflow/x402-types.js';
import {
  createPaymentRequirements,
  requireFixturePaymentMessage,
} from '../fixtures/workflows/utils/payment.js';
import {
  verifyExpiredScenario,
  verifyInsufficientValueScenario,
  verifyInvalidRequirementsScenario,
  verifySuccessScenario,
} from '../fixtures/workflows/x402-payloads.js';

// Configure facilitator URL for tests
beforeAll(() => {
  serviceConfig.x402 = {
    facilitatorUrl: 'http://localhost:3402',
  };
});

/**
 * Workflow plugin that pauses for payment and completes after verification
 */
const paymentWorkflowPlugin: WorkflowPlugin = {
  id: 'payment_test_workflow',
  name: 'Payment Test Workflow',
  version: '1.0.0',
  description: 'Test workflow that pauses for payment',
  inputSchema: z.object({}).optional(),
  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
    yield {
      type: 'dispatch-response',
      parts: [],
    };

    yield {
      type: 'status-update',
      message: [{ kind: 'text', text: 'Starting payment workflow' }],
      metadata: {},
    };

    // Pause for payment
    const requirements = createPaymentRequirements('0x850051af81DF37ae20e6Fe2De405be96DC4b3d1f');
    const paymentSettlement: PaymentSettlement | undefined = yield requireFixturePaymentMessage(
      'Payment required to continue',
      requirements,
    );

    if (!paymentSettlement) {
      throw new Error('Payment settlement not received');
    }

    // If we get here, payment was verified successfully
    const settlementResult = await paymentSettlement.settlePayment(
      'Payment completed successfully',
      false,
    );

    yield settlementResult;

    yield {
      type: 'status-update',
      message: [{ kind: 'text', text: 'Workflow completed' }],
      metadata: {},
    };

    return { ok: true };
  },
};

function recordEvents(eventBus: ExecutionEventBus): {
  events: Array<AgentExecutionEvent>;
  stop: () => void;
} {
  const recorded: Array<AgentExecutionEvent> = [];
  const handler = (event: AgentExecutionEvent) => {
    recorded.push(event);
  };

  eventBus.on('event', handler);

  return {
    events: recorded,
    stop: () => {
      eventBus.off('event', handler);
    },
  };
}

async function waitFor<T>(
  predicate: () => T | undefined,
  timeoutMs = 2000,
  intervalMs = 50,
): Promise<T> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = predicate();
    if (result !== undefined) return result;
    if (Date.now() - start >= timeoutMs) {
      throw new Error('Timed out waiting for expected event');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe('Payment Failure Handling', () => {
  it('should emit structured failure metadata when verification fails with EXPIRED_PAYMENT', async () => {
    const runtime = new WorkflowRuntime();
    runtime.register(paymentWorkflowPlugin);

    const taskStore = new InMemoryTaskStore();
    const busManager = new DefaultExecutionEventBusManager();
    const handler = new WorkflowHandler(runtime, new ContextManager(), busManager, taskStore);

    const contextId = `ctx-${Date.now()}`;
    const parentBus = busManager.createOrGetByTaskId(uuidv7());

    // Dispatch workflow
    const { taskId } = await handler.dispatchWorkflow(
      'dispatch_workflow_payment_test_workflow',
      {},
      parentBus,
    );

    // Get the event bus for this task
    const eventBus = busManager.getByTaskId(taskId);
    if (!eventBus) {
      throw new Error(`No event bus found for task ${taskId}`);
    }
    const { events, stop } = recordEvents(eventBus);

    // Wait for workflow to pause for payment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Resume with payment that will trigger facilitator verification failure
    const taskState = runtime.getTaskState(taskId)!;
    taskState.paymentRequirements = {
      [X402_REQUIREMENTS_KEY]: {
        x402Version: 1,
        accepts: [verifyExpiredScenario.paymentRequirements],
      },
    };

    await handler.resumeWorkflow(taskId, contextId, 'resume', undefined, taskState, eventBus, {
      [X402_STATUS_KEY]: 'payment-submitted',
      [X402_PAYMENT_PAYLOAD_KEY]: verifyExpiredScenario.paymentPayload,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    stop();

    // Find the error message and status update
    const errorMessage = events.find(
      (e) =>
        e.kind === 'message' &&
        e.parts.some((p) => p.kind === 'text' && p.text.includes('x402 payment failed')),
    ) as Message | undefined;

    const statusUpdate = events.find(
      (e) => e.kind === 'status-update' && e.status?.state === 'failed',
    ) as TaskStatusUpdateEvent | undefined;

    // Assertions
    expect(errorMessage).toBeDefined();
    expect(errorMessage?.parts[0]).toMatchObject({
      kind: 'text',
    });
    expect((errorMessage?.parts[0] as { text: string }).text).toContain(
      'x402 payment failed at verify',
    );
    expect((errorMessage?.parts[0] as { text: string }).text).toContain('code: VERIFY_FAILED');

    expect(statusUpdate).toBeDefined();
    expect(statusUpdate?.status.state).toBe('failed');
    expect(statusUpdate?.final).toBe(true);

    // Verify structured metadata
    const metadata = statusUpdate?.metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    expect(metadata[X402_STATUS_KEY]).toBe('payment-failed');
    expect(metadata[X402_ERROR_KEY]).toBe('VERIFY_FAILED');
    expect(metadata[X402_FAILURE_STAGE_KEY]).toBe('verify');
    expect(metadata.http_status).toBeUndefined();

    // Verify receipts array
    const receipts = metadata[X402_RECEIPTS_KEY] as Array<{
      success: boolean;
      errorReason: string;
    }>;
    expect(receipts).toBeDefined();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].success).toBe(false);
    expect(receipts[0].errorReason).toBeDefined();

    // Verify facilitator response is captured
    expect(metadata.facilitator_response).toEqual(
      expect.objectContaining({
        invalidReason: 'invalid_exact_evm_payload_authorization_valid_before',
      }),
    );

    // Verify payment requirements and payload are included
    expect(metadata.payment_requirements).toBeDefined();
    expect(metadata.payment_payload).toBeDefined();
  });

  it('should emit structured failure metadata when verification fails with INSUFFICIENT_PAYMENT', async () => {
    const runtime = new WorkflowRuntime();
    runtime.register(paymentWorkflowPlugin);

    const taskStore = new InMemoryTaskStore();
    const busManager = new DefaultExecutionEventBusManager();
    const handler = new WorkflowHandler(runtime, new ContextManager(), busManager, taskStore);

    const contextId = `ctx-${Date.now()}-2`;
    const parentBus = busManager.createOrGetByTaskId(uuidv7());

    // Dispatch workflow
    const { taskId } = await handler.dispatchWorkflow(
      'dispatch_workflow_payment_test_workflow',
      {},
      parentBus,
    );

    // Get the event bus for this task
    const eventBus = busManager.getByTaskId(taskId);
    if (!eventBus) {
      throw new Error(`No event bus found for task ${taskId}`);
    }
    const { events, stop } = recordEvents(eventBus);

    // Wait for workflow to pause for payment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Resume with payment that will trigger facilitator verification failure due to insufficient value
    const taskState = runtime.getTaskState(taskId)!;
    taskState.paymentRequirements = {
      [X402_REQUIREMENTS_KEY]: {
        x402Version: 1,
        accepts: [verifyInsufficientValueScenario.paymentRequirements],
      },
    };

    await handler.resumeWorkflow(taskId, contextId, 'resume', undefined, taskState, eventBus, {
      [X402_STATUS_KEY]: 'payment-submitted',
      [X402_PAYMENT_PAYLOAD_KEY]: verifyInsufficientValueScenario.paymentPayload,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    stop();

    const statusUpdate = events.find(
      (e) => e.kind === 'status-update' && e.status?.state === 'failed',
    ) as TaskStatusUpdateEvent | undefined;

    // Assertions
    expect(statusUpdate).toBeDefined();
    const metadata = statusUpdate?.metadata as Record<string, unknown>;
    expect(metadata[X402_STATUS_KEY]).toBe('payment-failed');
    expect(metadata[X402_ERROR_KEY]).toBe('VERIFY_FAILED');
    expect(metadata[X402_FAILURE_STAGE_KEY]).toBe('verify');
    expect(metadata.facilitator_response).toEqual(
      expect.objectContaining({
        invalidReason: 'invalid_exact_evm_payload_authorization_value',
      }),
    );
  });

  it('should emit structured failure metadata when payment requirements are missing', async () => {
    const runtime = new WorkflowRuntime();
    runtime.register(paymentWorkflowPlugin);

    const taskStore = new InMemoryTaskStore();
    const busManager = new DefaultExecutionEventBusManager();
    const handler = new WorkflowHandler(runtime, new ContextManager(), busManager, taskStore);

    const contextId = `ctx-${Date.now()}-3`;
    const parentBus = busManager.createOrGetByTaskId(uuidv7());

    // Dispatch workflow
    const { taskId } = await handler.dispatchWorkflow(
      'dispatch_workflow_payment_test_workflow',
      {},
      parentBus,
    );

    // Get the event bus for this task
    const eventBus = busManager.getByTaskId(taskId);
    if (!eventBus) {
      throw new Error(`No event bus found for task ${taskId}`);
    }
    const { events, stop } = recordEvents(eventBus);

    // Wait for workflow to pause for payment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clear payment requirements from task state to simulate missing requirements
    const taskState = runtime.getTaskState(taskId)!;
    taskState.paymentRequirements = undefined;

    // Resume with valid payment
    await handler.resumeWorkflow(taskId, contextId, 'resume', undefined, taskState, eventBus, {
      [X402_STATUS_KEY]: 'payment-submitted',
      [X402_PAYMENT_PAYLOAD_KEY]: verifySuccessScenario.paymentPayload,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    stop();

    const statusUpdate = events.find(
      (e) => e.kind === 'status-update' && e.status?.state === 'failed',
    ) as TaskStatusUpdateEvent | undefined;

    // Assertions
    expect(statusUpdate).toBeDefined();
    const metadata = statusUpdate?.metadata as Record<string, unknown>;
    expect(metadata[X402_STATUS_KEY]).toBe('payment-failed');
    expect(metadata[X402_ERROR_KEY]).toBe('REQUIREMENTS_MISSING');
    expect(metadata[X402_FAILURE_STAGE_KEY]).toBe('requirements-load');
    expect(metadata.http_status).toBeUndefined(); // No facilitator call made
    expect(metadata.facilitator_response).toBeUndefined();
  });

  it('should not regress existing successful payment flow', async () => {
    const runtime = new WorkflowRuntime();
    runtime.register(paymentWorkflowPlugin);

    const taskStore = new InMemoryTaskStore();
    const busManager = new DefaultExecutionEventBusManager();
    const handler = new WorkflowHandler(runtime, new ContextManager(), busManager, taskStore);

    const contextId = `ctx-${Date.now()}-success`;
    const parentBus = busManager.createOrGetByTaskId(uuidv7());

    // Dispatch workflow
    const { taskId } = await handler.dispatchWorkflow(
      'dispatch_workflow_payment_test_workflow',
      {},
      parentBus,
    );

    // Get the event bus for this task
    const eventBus = busManager.getByTaskId(taskId);
    if (!eventBus) {
      throw new Error(`No event bus found for task ${taskId}`);
    }
    const { events, stop } = recordEvents(eventBus);

    // Wait for workflow to pause for payment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Resume with valid payment (no testError)
    const taskState = runtime.getTaskState(taskId)!;
    taskState.paymentRequirements = {
      [X402_REQUIREMENTS_KEY]: {
        x402Version: 1,
        accepts: [verifySuccessScenario.paymentRequirements],
      },
    };

    await handler.resumeWorkflow(taskId, contextId, 'resume', undefined, taskState, eventBus, {
      [X402_STATUS_KEY]: 'payment-submitted',
      [X402_PAYMENT_PAYLOAD_KEY]: verifySuccessScenario.paymentPayload,
    });

    // Wait for a status-update that carries payment-completed metadata
    const completedWithMetadata = await waitFor(
      () =>
        events.find((e) => {
          if (e.kind !== 'status-update') return false;
          const md = (e as TaskStatusUpdateEvent).metadata as Record<string, unknown> | undefined;
          return md?.[X402_STATUS_KEY] === 'payment-completed';
        }) as TaskStatusUpdateEvent | undefined,
      3000,
      50,
    );
    stop();

    expect(completedWithMetadata).toBeDefined();
    const metadata = completedWithMetadata?.metadata as Record<string, unknown>;
    expect(metadata?.[X402_STATUS_KEY]).toBe('payment-completed');
    expect(metadata?.[X402_RECEIPTS_KEY]).toBeDefined();

    // Should not have failed status
    const failedUpdate = events.find(
      (e) => e.kind === 'status-update' && e.status?.state === 'failed',
    );
    expect(failedUpdate).toBeUndefined();
  });

  it('should emit structured failure metadata when settlement fails', async () => {
    const runtime = new WorkflowRuntime();
    runtime.register(paymentWorkflowPlugin);

    const taskStore = new InMemoryTaskStore();
    const busManager = new DefaultExecutionEventBusManager();
    const handler = new WorkflowHandler(runtime, new ContextManager(), busManager, taskStore);

    const contextId = `ctx-${Date.now()}-settle-failure`;
    const parentBus = busManager.createOrGetByTaskId(uuidv7());

    const originalSettle = x402Server.settlePayment;
    const verifySpy = vi.spyOn(x402Server, 'verifyPayment').mockResolvedValue({
      isValid: true,
      payer: verifyExpiredScenario.paymentPayload.payload.authorization.from,
    });
    const settleSpy = vi
      .spyOn(x402Server, 'settlePayment')
      .mockImplementation(async (payload, requirements) => {
        const response = await originalSettle(payload, requirements);
        const error = new Error('Facilitator settlement failed');
        (error as Record<string, unknown>).status = 500;
        (error as Record<string, unknown>).response = response;
        throw error;
      });

    try {
      const { taskId } = await handler.dispatchWorkflow(
        'dispatch_workflow_payment_test_workflow',
        {},
        parentBus,
      );

      const eventBus = busManager.getByTaskId(taskId);
      if (!eventBus) {
        throw new Error(`No event bus found for task ${taskId}`);
      }
      const { events, stop } = recordEvents(eventBus);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const taskState = runtime.getTaskState(taskId)!;
      taskState.paymentRequirements = {
        [X402_REQUIREMENTS_KEY]: {
          x402Version: 1,
          accepts: [verifyExpiredScenario.paymentRequirements],
        },
      };

      await handler.resumeWorkflow(taskId, contextId, 'resume', undefined, taskState, eventBus, {
        [X402_STATUS_KEY]: 'payment-submitted',
        [X402_PAYMENT_PAYLOAD_KEY]: verifyExpiredScenario.paymentPayload,
      });

      const statusUpdate = await waitFor(
        () =>
          events.find(
            (event) => event.kind === 'status-update' && event.status?.state === 'failed',
          ) as TaskStatusUpdateEvent | undefined,
        3000,
        50,
      );
      stop();

      expect(statusUpdate).toBeDefined();
      // Message should convey settlement failure
      expect(statusUpdate?.status.message?.parts[0]).toEqual(
        expect.objectContaining({
          kind: 'text',
          text: expect.stringContaining('Facilitator settlement failed'),
        }),
      );
    } finally {
      verifySpy.mockRestore();
      settleSpy.mockRestore();
    }
  });
});
