import type { Message, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { DefaultExecutionEventBusManager, InMemoryTaskStore } from '@a2a-js/sdk/server';
import type { AgentExecutionEvent, ExecutionEventBus } from '@a2a-js/sdk/server';
import { v7 as uuidv7 } from 'uuid';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { z } from 'zod';

import { WorkflowHandler } from '../../src/a2a/handlers/workflowHandler.js';
import { ContextManager } from '../../src/a2a/sessions/manager.js';
import { serviceConfig } from '../../src/config.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';
import type {
  WorkflowPlugin,
  WorkflowContext,
  WorkflowState,
  PaymentSettlement,
} from '../../src/workflows/types.js';
import {
  X402_STATUS_KEY,
  X402_PAYMENT_PAYLOAD_KEY,
  X402_ERROR_KEY,
  X402_FAILURE_STAGE_KEY,
  X402_RECEIPTS_KEY,
  X402_REQUIREMENTS_KEY,
} from '../../src/workflows/x402-types.js';
import { createPaymentRequirements, requireFixturePaymentMessage } from '../fixtures/workflows/utils/payment.js';
import {
  verifyExpiredScenario,
  verifyInsufficientValueScenario,
  verifyInvalidRequirementsScenario,
  verifySuccessScenario,
} from '../fixtures/workflows/x402-payloads.js';
import * as x402Server from '../../src/utils/ap2/x402-server.js';

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
      type: 'status',
      status: {
        state: 'working',
        message: {
          kind: 'message',
          messageId: uuidv7(),
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Starting payment workflow' }],
        },
      },
    };

    // Pause for payment
    const requirements = createPaymentRequirements('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
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
      type: 'status',
      status: {
        state: 'completed',
        message: {
          kind: 'message',
          messageId: uuidv7(),
          contextId: context.contextId,
          role: 'agent',
          parts: [{ kind: 'text', text: 'Workflow completed' }],
        },
      },
    };

    return { ok: true };
  },
};

function recordEvents(eventBus: ExecutionEventBus): { events: Array<AgentExecutionEvent>; stop: () => void } {
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
      contextId,
      parentBus,
    );

    // Wait for workflow to pause for payment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the event bus for this task
    const eventBus = busManager.getByTaskId(taskId)!;
    const { events, stop } = recordEvents(eventBus);

    // Resume with payment that will trigger facilitator verification failure
    const taskState = runtime.getTaskState(taskId)!;
    taskState.paymentRequirements = {
      [X402_REQUIREMENTS_KEY]: {
        x402Version: 1,
        accepts: [verifyExpiredScenario.paymentRequirements],
      },
    };

    await handler.resumeWorkflow(
      taskId,
      contextId,
      'resume',
      {
        [X402_STATUS_KEY]: 'payment-submitted',
        [X402_PAYMENT_PAYLOAD_KEY]: verifyExpiredScenario.paymentPayload,
      },
      { state: taskState.state },
      eventBus,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    stop();
    console.log('saved task', await taskStore.load(taskId));
    console.log('events length', events.length, events);

    // Find the error message and status update
    const errorMessage = events.find(
      (e) => e.kind === 'message' && e.parts.some((p) => p.kind === 'text' && p.text.includes('x402 payment failed')),
    ) as Message | undefined;

    const statusUpdate = events.find(
      (e) => e.kind === 'status-update' && e.status?.state === 'failed',
    ) as TaskStatusUpdateEvent | undefined;

    // Assertions
    expect(errorMessage).toBeDefined();
    expect(errorMessage?.parts[0]).toMatchObject({
      kind: 'text',
    });
    expect((errorMessage?.parts[0] as { text: string }).text).toContain('x402 payment failed at verify');
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
    const receipts = metadata[X402_RECEIPTS_KEY] as Array<{ success: boolean; errorReason: string }>;
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
      contextId,
      parentBus,
    );

    // Wait for workflow to pause for payment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the event bus for this task
    const eventBus = busManager.getByTaskId(taskId)!;
    const { events, stop } = recordEvents(eventBus);

    // Resume with payment that will trigger facilitator verification failure due to insufficient value
    const taskState = runtime.getTaskState(taskId)!;
    taskState.paymentRequirements = {
      [X402_REQUIREMENTS_KEY]: {
        x402Version: 1,
        accepts: [verifyInsufficientValueScenario.paymentRequirements],
      },
    };

    await handler.resumeWorkflow(
      taskId,
      contextId,
      'resume',
      {
        [X402_STATUS_KEY]: 'payment-submitted',
        [X402_PAYMENT_PAYLOAD_KEY]: verifyInsufficientValueScenario.paymentPayload,
      },
      { state: taskState.state },
      eventBus,
    );

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
      contextId,
      parentBus,
    );

    // Wait for workflow to pause for payment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clear payment requirements from task state to simulate missing requirements
    const taskState = runtime.getTaskState(taskId)!;
    taskState.paymentRequirements = undefined;

    // Get the event bus for this task
    const eventBus = busManager.getByTaskId(taskId)!;
    const { events, stop } = recordEvents(eventBus);

    // Resume with valid payment
    await handler.resumeWorkflow(
      taskId,
      contextId,
      'resume',
      {
        [X402_STATUS_KEY]: 'payment-submitted',
        [X402_PAYMENT_PAYLOAD_KEY]: verifySuccessScenario.paymentPayload,
      },
      { state: taskState.state },
      eventBus,
    );

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
      contextId,
      parentBus,
    );

    // Wait for workflow to pause for payment
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the event bus for this task
    const eventBus = busManager.getByTaskId(taskId)!;
    const { events, stop } = recordEvents(eventBus);

    // Resume with valid payment (no testError)
    const taskState = runtime.getTaskState(taskId)!;
    taskState.paymentRequirements = {
      [X402_REQUIREMENTS_KEY]: {
        x402Version: 1,
        accepts: [verifySuccessScenario.paymentRequirements],
      },
    };

    await handler.resumeWorkflow(
      taskId,
      contextId,
      'resume',
      {
        [X402_STATUS_KEY]: 'payment-submitted',
        [X402_PAYMENT_PAYLOAD_KEY]: verifySuccessScenario.paymentPayload,
      },
      { state: taskState.state },
      eventBus,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    stop();

    // Should have completed status update with payment-completed metadata
    const completedUpdate = events.find(
      (e) => e.kind === 'status-update' && e.status?.state === 'completed',
    ) as TaskStatusUpdateEvent | undefined;

    expect(completedUpdate).toBeDefined();
    const metadata = completedUpdate?.metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    expect(metadata[X402_STATUS_KEY]).toBe('payment-completed');
    expect(metadata[X402_RECEIPTS_KEY]).toBeDefined();

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
    const verifySpy = vi
      .spyOn(x402Server, 'verifyPayment')
      .mockResolvedValue({ isValid: true, payer: verifyExpiredScenario.paymentPayload.payload.authorization.from });
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
        contextId,
        parentBus,
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const eventBus = busManager.getByTaskId(taskId)!;
      const { events, stop } = recordEvents(eventBus);

      const taskState = runtime.getTaskState(taskId)!;
      taskState.paymentRequirements = {
        [X402_REQUIREMENTS_KEY]: {
          x402Version: 1,
          accepts: [verifyExpiredScenario.paymentRequirements],
        },
      };

      await handler.resumeWorkflow(
        taskId,
        contextId,
        'resume',
        {
          [X402_STATUS_KEY]: 'payment-submitted',
          [X402_PAYMENT_PAYLOAD_KEY]: verifyExpiredScenario.paymentPayload,
        },
        { state: taskState.state },
        eventBus,
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
      stop();

      const statusUpdate = events.find(
        (event) => event.kind === 'status-update' && event.status?.state === 'failed',
      ) as TaskStatusUpdateEvent | undefined;

      expect(statusUpdate).toBeDefined();
      expect(statusUpdate?.status.message?.parts[0]).toEqual(
        expect.objectContaining({
          kind: 'text',
          text: expect.stringContaining('code: FACILITATOR_ERROR'),
        }),
      );

      const metadata = statusUpdate?.metadata as Record<string, unknown>;
      expect(metadata[X402_STATUS_KEY]).toBe('payment-failed');
      expect(metadata[X402_FAILURE_STAGE_KEY]).toBe('settle');
      expect(metadata[X402_ERROR_KEY]).toBe('FACILITATOR_ERROR');
      expect(metadata.http_status).toBe(500);
      expect(metadata.facilitator_response).toEqual(
        expect.objectContaining({
          success: false,
          errorReason: 'invalid_exact_evm_payload_authorization_valid_before',
        }),
      );
    } finally {
      verifySpy.mockRestore();
      settleSpy.mockRestore();
    }
  });
});
