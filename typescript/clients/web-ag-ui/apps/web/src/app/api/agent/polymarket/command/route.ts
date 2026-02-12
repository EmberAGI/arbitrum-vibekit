/**
 * Direct LangGraph Command API for Polymarket Agent
 *
 * This endpoint bypasses CopilotKit to send commands directly to the LangGraph agent.
 * Used for actions like updating approvals from the Settings tab.
 *
 * CopilotKit's `run()` doesn't work after the agent has completed its initial run,
 * so we need this direct API for sending commands to a running agent.
 *
 * The agent uses cron-based polling (not continuous waitAndLoop) to allow commands
 * to be sent between cycles. If a cycle is in progress, this API will retry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

const POLYMARKET_DEPLOYMENT_URL = process.env.LANGGRAPH_POLYMARKET_URL || 'http://localhost:8127';
const GRAPH_ID = 'agent-polymarket';

// Retry configuration
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000; // 1 second between retries

// Polling configuration for waiting on interrupt
const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 500;

interface CommandRequest {
  threadId: string;
  command: string;
  data?: Record<string, unknown>;
}

/**
 * Helper to sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for the run to complete or reach an interrupt state.
 * Returns the final state when ready.
 */
async function waitForRunCompletion(
  threadId: string,
  runId: string,
): Promise<{ success: boolean; state?: Record<string, unknown>; error?: string }> {
  const runStatusUrl = `${POLYMARKET_DEPLOYMENT_URL}/threads/${threadId}/runs/${runId}`;
  const stateUrl = `${POLYMARKET_DEPLOYMENT_URL}/threads/${threadId}/state`;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const statusResponse = await fetch(runStatusUrl);
      if (!statusResponse.ok) {
        console.error('[Polymarket Command API] Failed to get run status');
        continue;
      }

      const runStatus = await statusResponse.json();
      const status = runStatus.status;

      console.log(`[Polymarket Command API] Poll ${attempt}/${MAX_POLL_ATTEMPTS} - Run status: ${status}`);

      // Check if run has finished or is interrupted
      if (status === 'success' || status === 'interrupted' || status === 'error') {
        // Fetch the final state
        const stateResponse = await fetch(stateUrl);
        if (!stateResponse.ok) {
          return { success: false, error: 'Failed to fetch final state' };
        }

        const stateData = await stateResponse.json();
        console.log('[Polymarket Command API] Run completed with status:', status);
        return { success: true, state: stateData.values };
      }

      // Still running, continue polling
    } catch (error) {
      console.error('[Polymarket Command API] Poll error:', error);
    }
  }

  return { success: false, error: 'Timeout waiting for run completion' };
}

/**
 * Update state with retry logic for when thread is busy
 */
async function updateStateWithRetry(
  threadId: string,
  message: { id: string; role: 'user'; content: string },
  command: string,
  data?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const updateStateUrl = `${POLYMARKET_DEPLOYMENT_URL}/threads/${threadId}/state`;

  // Build the state values based on the command
  // This mimics what runCommandNode would output
  let stateValues: Record<string, unknown> = {
    messages: [message],
    view: { command },
  };

  // For updateApproval, we need to set the specific fields
  // We'll restart from updateApprovalCommand (not runCommand) with the proper state
  let asNode = 'runCommand';

  if (command === 'updateApproval' && data) {
    // Set the state as if we're the OUTPUT of updateApprovalCommand
    // This way checkApprovals will have the values it needs
    stateValues = {
      messages: [message],
      view: {
        command,
        requestedApprovalAmount: data.approvalAmount,
        forceApprovalUpdate: true,
      },
      private: {
        userWalletAddress: data.userWalletAddress,
      },
    };
    // Start from updateApprovalCommand so the edge goes directly to checkApprovals
    asNode = 'updateApprovalCommand';
    console.log('[Polymarket Command API] Setting updateApproval state:', JSON.stringify(stateValues, null, 2));
    console.log('[Polymarket Command API] Starting from node:', asNode);
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Polymarket Command API] Attempt ${attempt}/${MAX_RETRIES} - Updating state`);

    const updateResponse = await fetch(updateStateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: stateValues,
        as_node: asNode,
      }),
    });

    if (updateResponse.ok) {
      console.log('[Polymarket Command API] State updated successfully');
      return { success: true };
    }

    const errorText = await updateResponse.text();

    // Check if thread is busy (409 Conflict)
    if (updateResponse.status === 409 && errorText.includes('busy')) {
      console.log(`[Polymarket Command API] Thread busy, waiting ${RETRY_DELAY_MS}ms before retry...`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
    }

    // Non-retryable error or max retries reached
    console.error('[Polymarket Command API] Failed to update state:', errorText);
    return { success: false, error: errorText };
  }

  return { success: false, error: 'Max retries exceeded - thread still busy' };
}

export async function POST(req: NextRequest) {
  console.log('\n========================================');
  console.log('[Polymarket Command API] POST request received');
  console.log('========================================');

  try {
    const body = (await req.json()) as CommandRequest;
    const { threadId, command, data } = body;

    console.log('[Polymarket Command API] threadId:', threadId);
    console.log('[Polymarket Command API] command:', command);
    console.log('[Polymarket Command API] data:', data);

    if (!threadId) {
      return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
    }

    if (!command) {
      return NextResponse.json({ error: 'command is required' }, { status: 400 });
    }

    // Create the message to send
    const message = {
      id: uuidv7(),
      role: 'user' as const,
      content: JSON.stringify(data ? { command, data } : { command }),
    };

    console.log('[Polymarket Command API] Sending message to LangGraph:', message);

    // Step 1: Update state with retry logic
    const updateResult = await updateStateWithRetry(threadId, message, command, data);

    if (!updateResult.success) {
      return NextResponse.json(
        { error: 'Failed to update state', details: updateResult.error },
        { status: 500 },
      );
    }

    // Step 2: Invoke the graph to process the command (background mode)
    const runUrl = `${POLYMARKET_DEPLOYMENT_URL}/threads/${threadId}/runs`;
    console.log('[Polymarket Command API] Invoking graph at:', runUrl);

    const runResponse = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistant_id: GRAPH_ID,
        input: null,
      }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('[Polymarket Command API] Failed to invoke graph:', errorText);
      return NextResponse.json(
        { error: 'Failed to invoke graph', details: errorText },
        { status: 500 },
      );
    }

    const runData = await runResponse.json();
    const runId = runData.run_id;
    console.log('[Polymarket Command API] Graph invocation started, run_id:', runId);

    // Step 3: Wait for the run to complete or reach an interrupt
    const completionResult = await waitForRunCompletion(threadId, runId);

    if (!completionResult.success) {
      console.error('[Polymarket Command API] Run completion failed:', completionResult.error);
      return NextResponse.json(
        { error: 'Run failed to complete', details: completionResult.error },
        { status: 500 },
      );
    }

    console.log('[Polymarket Command API] Returning state to frontend');

    // Return success with the final state
    // Frontend can use this to update its local state
    return NextResponse.json({
      success: true,
      message: `Command "${command}" completed`,
      state: completionResult.state,
    });
  } catch (error) {
    console.error('[Polymarket Command API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to send command',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
