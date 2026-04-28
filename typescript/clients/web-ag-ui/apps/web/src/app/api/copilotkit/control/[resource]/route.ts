import { NextRequest } from 'next/server';

import { resolveAgentRuntimeUrl } from '../../copilotRuntimeRegistry';

type ControlResource = 'automation-runs' | 'artifacts';

function isControlResource(value: string): value is ControlResource {
  return value === 'automation-runs' || value === 'artifacts';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function findControlItem(params: {
  resource: ControlResource;
  items: unknown;
  id: string | null;
}): unknown {
  if (!params.id || !Array.isArray(params.items)) {
    return params.items;
  }

  const idField = params.resource === 'automation-runs' ? 'runId' : 'artifactId';
  return params.items.find((item) => isRecord(item) && item[idField] === params.id) ?? null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource: rawResource } = await context.params;
  if (!isControlResource(rawResource)) {
    return Response.json({ ok: false, error: 'Unsupported control resource.' }, { status: 404 });
  }

  const url = new URL(request.url);
  const agentId = readString(url.searchParams.get('agentId'));
  if (!agentId) {
    return Response.json({ ok: false, error: 'Missing agentId.' }, { status: 400 });
  }
  const threadId = readString(url.searchParams.get('threadId'));
  if (!threadId) {
    return Response.json({ ok: false, error: 'Missing threadId.' }, { status: 400 });
  }

  const id =
    rawResource === 'automation-runs'
      ? readString(url.searchParams.get('runId'))
      : readString(url.searchParams.get('artifactId'));
  const runtimeUrl = resolveAgentRuntimeUrl(process.env, agentId).replace(/\/$/, '');
  const runtimeControlUrl = new URL(`${runtimeUrl}/control/${rawResource}`);
  runtimeControlUrl.searchParams.set('threadId', threadId);
  const response = await fetch(runtimeControlUrl.toString(), {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    return Response.json(
      {
        ok: false,
        error: `Runtime control plane returned ${response.status}.`,
      },
      { status: response.status },
    );
  }

  const items: unknown = await response.json();
  const item = findControlItem({
    resource: rawResource,
    items,
    id,
  });
  if (id && item === null) {
    return Response.json({ ok: false, error: 'Control item not found.' }, { status: 404 });
  }

  return Response.json({
    ok: true,
    resource: rawResource,
    item,
  });
}
