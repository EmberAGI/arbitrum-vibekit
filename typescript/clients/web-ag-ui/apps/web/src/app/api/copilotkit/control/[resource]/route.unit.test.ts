import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const resolveAgentRuntimeUrlMock = vi.fn();

vi.mock('../../copilotRuntimeRegistry', () => ({
  resolveAgentRuntimeUrl: (...args: unknown[]) => resolveAgentRuntimeUrlMock(...args),
}));

import { GET } from './route';

function buildRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('GET /api/copilotkit/control/[resource]', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resolveAgentRuntimeUrlMock.mockReset();
    resolveAgentRuntimeUrlMock.mockReturnValue('http://portfolio-runtime/ag-ui');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a single automation run through the configured runtime control plane', async () => {
    fetchMock.mockResolvedValue(
      Response.json([
        { runId: 'run-other', status: 'completed' },
        { runId: 'run-1', threadId: 'thread-record-1', status: 'canceled' },
      ]),
    );

    const response = await GET(
      buildRequest(
        '/api/copilotkit/control/automation-runs?agentId=agent-portfolio-manager&threadId=thread-1&runId=run-1',
      ),
      { params: Promise.resolve({ resource: 'automation-runs' }) },
    );

    expect(response.status).toBe(200);
    expect(resolveAgentRuntimeUrlMock).toHaveBeenCalledWith(
      process.env,
      'agent-portfolio-manager',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://portfolio-runtime/ag-ui/control/automation-runs?threadId=thread-1',
      {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      },
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      resource: 'automation-runs',
      item: { runId: 'run-1', threadId: 'thread-record-1', status: 'canceled' },
    });
  });

  it('opens a single artifact through the configured runtime control plane', async () => {
    fetchMock.mockResolvedValue(
      Response.json([
        { artifactId: 'artifact-other', artifactKind: 'current' },
        { artifactId: 'artifact-1', artifactKind: 'automation-run-snapshot' },
      ]),
    );

    const response = await GET(
      buildRequest(
        '/api/copilotkit/control/artifacts?agentId=agent-portfolio-manager&threadId=thread-1&artifactId=artifact-1',
      ),
      { params: Promise.resolve({ resource: 'artifacts' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      resource: 'artifacts',
      item: { artifactId: 'artifact-1', artifactKind: 'automation-run-snapshot' },
    });
  });

  it('rejects run or artifact opening without a root thread scope', async () => {
    const response = await GET(
      buildRequest('/api/copilotkit/control/automation-runs?agentId=agent-portfolio-manager&runId=run-1'),
      { params: Promise.resolve({ resource: 'automation-runs' }) },
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Missing threadId.',
    });
  });

  it('rejects unsupported control resources', async () => {
    const response = await GET(
      buildRequest('/api/copilotkit/control/threads?agentId=agent-portfolio-manager'),
      { params: Promise.resolve({ resource: 'threads' }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Unsupported control resource.',
    });
  });
});
