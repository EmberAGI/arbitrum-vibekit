import { v7 as uuidv7 } from 'uuid';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

type Address = `0x${string}`;
type HexString = `0x${string}`;

const normalizeBaseUrl = (raw: string): string => (raw.endsWith('/') ? raw.slice(0, -1) : raw);

const defaultPort = 8125;
const defaultOnchainActionsUrl = 'https://api.emberai.xyz';

const resolveLocalLangGraphPort = (): number => {
  const raw = process.env['LANGGRAPH_SMOKE_PORT'] ?? process.env['LANGGRAPH_PORT'];
  if (!raw) {
    return defaultPort;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid LANGGRAPH_SMOKE_PORT/LANGGRAPH_PORT: ${raw}`);
  }
  return parsed;
};

const resolveGraphId = (): string => process.env['LANGGRAPH_GRAPH_ID'] ?? 'agent-pendle';

const resolveThreadId = (): string => process.env['PENDLE_SMOKE_THREAD_ID'] ?? uuidv7();

const resolveOperatorWallet = (): Address | undefined => {
  const raw = process.env['PENDLE_SMOKE_OPERATOR_WALLET'];
  if (!raw) {
    return undefined;
  }
  if (!raw.startsWith('0x')) {
    throw new Error(`PENDLE_SMOKE_OPERATOR_WALLET must be a 0x address, got: ${raw}`);
  }
  return raw as Address;
};

const resolveOnchainActionsBaseUrl = (): string =>
  process.env['ONCHAIN_ACTIONS_API_URL'] ?? defaultOnchainActionsUrl;

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LangGraph API request failed (${response.status}): ${text}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
};

const ensureThread = async (baseUrl: string, threadId: string, graphId: string) => {
  const metadata = { graph_id: graphId };
  const response = await fetch(`${baseUrl}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, if_exists: 'do_nothing', metadata }),
  });
  await parseJson(response);

  const patchResponse = await fetch(`${baseUrl}/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });
  await parseJson(patchResponse);
};

const patchThreadState = async (params: { baseUrl: string; threadId: string; values: unknown }) => {
  const response = await fetch(`${params.baseUrl}/threads/${params.threadId}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      values: params.values,
      as_node: 'syncState',
    }),
  });
  return parseJson(response);
};

const startLocalLangGraph = async (port: number): Promise<{
  baseUrl: string;
  child?: ChildProcessWithoutNullStreams;
}> => {
  const existingBaseUrl = `http://localhost:${port}`;

  // If something is already listening, just use it (developers often have `pnpm dev` running).
  try {
    const response = await fetch(`${existingBaseUrl}/threads`, { method: 'GET' });
    // Any HTTP response implies the server is reachable (even 405).
    if (response.status) {
      return { baseUrl: existingBaseUrl };
    }
  } catch {
    // Not reachable; fall through and start it.
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(scriptDir, '..', '..');
  const langgraphDevScript = path.resolve(packageRoot, '..', '..', 'scripts', 'langgraph-dev.sh');

  const child = spawn('bash', [langgraphDevScript, String(port)], {
    cwd: packageRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const baseUrl = existingBaseUrl;
  const timeoutMs = 60_000;
  const started = Date.now();
  while (true) {
    if (child.exitCode !== null) {
      throw new Error(`LangGraph dev server exited early with code ${child.exitCode}`);
    }
    try {
      // `POST /threads` exists on the API and is used by the rest of this smoke script.
      const threadId = uuidv7();
      await ensureThread(baseUrl, threadId, process.env['LANGGRAPH_GRAPH_ID'] ?? 'agent-pendle');
      break;
    } catch {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for local LangGraph server on ${baseUrl}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  return { baseUrl, child };
};

const resolveBaseUrl = async (): Promise<{
  baseUrl: string;
  child?: ChildProcessWithoutNullStreams;
}> => {
  const raw = process.env['LANGGRAPH_DEPLOYMENT_URL'];
  if (raw) {
    return { baseUrl: normalizeBaseUrl(raw) };
  }

  const port = resolveLocalLangGraphPort();
  return startLocalLangGraph(port);
};

const createRun = async (params: {
  baseUrl: string;
  threadId: string;
  graphId: string;
  command: 'fire';
}) => {
  const response = await fetch(`${params.baseUrl}/threads/${params.threadId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistant_id: params.graphId,
      input: {
        messages: [
          {
            id: uuidv7(),
            role: 'user',
            content: JSON.stringify({ command: params.command }),
          },
        ],
      },
      config: { configurable: { thread_id: params.threadId } },
      metadata: { source: 'smoke' },
      stream_mode: ['events', 'values', 'messages'],
      stream_resumable: true,
    }),
  });
  const payload = await parseJson(response);
  const runId = payload['run_id'];
  if (typeof runId !== 'string') {
    throw new Error(`Expected run_id string, received: ${JSON.stringify(payload)}`);
  }
  return runId;
};

const fetchRunStatus = async (baseUrl: string, threadId: string, runId: string) => {
  const response = await fetch(`${baseUrl}/threads/${threadId}/runs/${runId}`);
  const payload = await parseJson(response);
  const status = payload['status'];
  return typeof status === 'string' ? status : undefined;
};

const waitForTerminalStatus = async (params: {
  baseUrl: string;
  threadId: string;
  runId: string;
  timeoutMs?: number;
}) => {
  const timeout = params.timeoutMs ?? 60_000;
  const terminal = new Set(['completed', 'success', 'failed', 'error', 'cancelled']);
  const started = Date.now();
  let status = await fetchRunStatus(params.baseUrl, params.threadId, params.runId);
  while (!status || !terminal.has(status)) {
    if (Date.now() - started > timeout) {
      throw new Error(`Timed out waiting for run status. Last status: ${status ?? 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    status = await fetchRunStatus(params.baseUrl, params.threadId, params.runId);
  }
  return status;
};

const fetchPositionsCount = async (baseUrl: string, walletAddress: Address): Promise<number | null> => {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/tokenizedYield/positions/${walletAddress}`);
  url.searchParams.append('chainIds', '42161');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const text = await response.text();
    if (!response.ok) {
      console.warn('[smoke:fire] onchain-actions positions lookup failed', {
        status: response.status,
        body: text.slice(0, 200),
      });
      return null;
    }
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const positions = payload['positions'];
    return Array.isArray(positions) ? positions.length : null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[smoke:fire] onchain-actions positions lookup errored', { error: message });
    return null;
  }
};

const waitForPositionsCount = async (params: {
  baseUrl: string;
  walletAddress: Address;
  target: number;
  timeoutMs?: number;
}): Promise<number | null> => {
  const timeout = params.timeoutMs ?? 60_000;
  const started = Date.now();
  while (true) {
    const count = await fetchPositionsCount(params.baseUrl, params.walletAddress);
    if (count === null) {
      return null;
    }
    if (count === params.target) {
      return count;
    }
    if (Date.now() - started > timeout) {
      return count;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
};

const run = async () => {
  const { baseUrl, child } = await resolveBaseUrl();
  const graphId = resolveGraphId();
  const threadId = resolveThreadId();
  const operatorWallet = resolveOperatorWallet();
  const onchainActionsUrl = resolveOnchainActionsBaseUrl();

  const stop = async () => {
    if (!child || child.exitCode !== null) {
      return;
    }
    child.kill('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  };

  try {
    // Thread must already exist and have a configured operator for "real unwind" scenarios,
    // but we allow auto-creation so this script can be used as a quick endpoint smoke too.
    await ensureThread(baseUrl, threadId, graphId);

    if (operatorWallet) {
      await patchThreadState({
        baseUrl,
        threadId,
        values: {
          view: {
            operatorConfig: {
              walletAddress: operatorWallet,
              executionWalletAddress: operatorWallet,
              baseContributionUsd: 10,
              fundingTokenAddress: operatorWallet,
              targetYieldToken: {
                marketAddress: operatorWallet,
                ptAddress: operatorWallet,
                ytAddress: operatorWallet,
                ptSymbol: 'PT',
                ytSymbol: 'YT',
                underlyingSymbol: 'USDai',
                apy: 0,
                maturity: '2030-01-01',
              },
            },
            delegationsBypassActive: true,
            setupComplete: true,
          },
        },
      });

      const before = await fetchPositionsCount(onchainActionsUrl, operatorWallet);
      if (before !== null) {
        console.log('[smoke:fire] positions before:', before);
      }
    }

    const runId = await createRun({ baseUrl, threadId, graphId, command: 'fire' });
    const status = await waitForTerminalStatus({ baseUrl, threadId, runId });

    console.log('[smoke:fire] baseUrl:', baseUrl);
    console.log('[smoke:fire] graphId:', graphId);
    console.log('[smoke:fire] threadId:', threadId);
    console.log('[smoke:fire] runId:', runId as HexString);
    console.log('[smoke:fire] status:', status);

    if (operatorWallet) {
      const after = await waitForPositionsCount({
        baseUrl: onchainActionsUrl,
        walletAddress: operatorWallet,
        target: 0,
      });
      if (after !== null) {
        console.log('[smoke:fire] positions after:', after);
      }
    }
  } finally {
    await stop();
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smoke:fire] failed:', message);
  process.exitCode = 1;
});
