export type CopilotRouteRequestMetadata = {
  method?: string;
  agentId?: string;
  threadId?: string;
  command?: string;
  hasResumePayload?: boolean;
  resumePayloadLength?: number;
  resumePayloadPreview?: string;
  source?: string;
  clientMutationId?: string;
  parseError?: string;
  payloadKind?: 'object' | 'array' | 'other';
  batchLength?: number;
  topLevelKeys?: string[];
  metadataMatched?: boolean;
  rawLength?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractThreadId(payloadBody: Record<string, unknown>): string | undefined {
  const fromBody = readString(payloadBody.threadId) ?? readString(payloadBody.thread_id);
  if (fromBody) return fromBody;

  const config = payloadBody.config;
  if (!isRecord(config)) return undefined;
  const configurable = config.configurable;
  if (!isRecord(configurable)) return undefined;
  return readString(configurable.threadId) ?? readString(configurable.thread_id);
}

function readResumeMetadata(payloadBody: Record<string, unknown>): {
  hasResumePayload: boolean;
  resumePayloadLength?: number;
  resumePayloadPreview?: string;
} {
  const forwardedProps = payloadBody.forwardedProps;
  if (!isRecord(forwardedProps)) {
    return {
      hasResumePayload: false,
    };
  }

  const command = forwardedProps.command;
  if (!isRecord(command)) {
    return {
      hasResumePayload: false,
    };
  }

  const hasResumePayload = Object.prototype.hasOwnProperty.call(command, 'resume');
  const resume = command.resume;
  const resumePreview =
    typeof resume === 'string'
      ? resume.slice(0, 240)
      : hasResumePayload
        ? JSON.stringify(resume)?.slice(0, 240)
        : undefined;
  return {
    hasResumePayload,
    resumePayloadLength: typeof resumePreview === 'string' ? resumePreview.length : undefined,
    resumePayloadPreview: resumePreview,
  };
}

function readCommandMetadata(payloadBody: Record<string, unknown>): {
  command?: string;
  source?: string;
  clientMutationId?: string;
} {
  const forwardedProps = payloadBody.forwardedProps;
  if (!isRecord(forwardedProps)) return {};
  const command = forwardedProps.command;
  if (!isRecord(command)) return {};

  const update = isRecord(command.update) ? command.update : undefined;
  const namedCommand = readString(command.name);
  if (!namedCommand && !update) {
    return {};
  }

  return {
    command: namedCommand ?? (update ? 'update' : undefined),
    source: readString(command.source),
    clientMutationId: update ? readString(update.clientMutationId) : readString(command.clientMutationId),
  };
}

function parseCopilotRouteMetadataFromObject(payload: Record<string, unknown>): CopilotRouteRequestMetadata {
  const method = readString(payload.method);
  const params = isRecord(payload.params) ? payload.params : undefined;
  const payloadBody = isRecord(payload.body) ? payload.body : undefined;
  const commandMetadata = payloadBody ? readCommandMetadata(payloadBody) : {};
  const resumeMetadata = payloadBody ? readResumeMetadata(payloadBody) : { hasResumePayload: false };
  const threadId = payloadBody ? extractThreadId(payloadBody) : undefined;
  const agentId = readString(params?.agentId);
  const command = commandMetadata.command ?? (resumeMetadata.hasResumePayload ? 'resume' : undefined);
  const source = commandMetadata.source;
  const clientMutationId = commandMetadata.clientMutationId;

  return {
    method,
    agentId,
    threadId,
    command,
    hasResumePayload: resumeMetadata.hasResumePayload,
    resumePayloadLength: resumeMetadata.resumePayloadLength,
    resumePayloadPreview: resumeMetadata.resumePayloadPreview,
    source,
    clientMutationId,
    payloadKind: 'object',
    topLevelKeys: Object.keys(payload).slice(0, 20),
    metadataMatched: Boolean(
      method ||
        agentId ||
        threadId ||
        command ||
        resumeMetadata.hasResumePayload ||
        source ||
        clientMutationId,
    ),
  };
}

export function parseCopilotRouteMetadata(payload: unknown): CopilotRouteRequestMetadata {
  if (isRecord(payload)) {
    return parseCopilotRouteMetadataFromObject(payload);
  }

  if (Array.isArray(payload)) {
    const first = payload[0];
    if (isRecord(first)) {
      const parsedFirst = parseCopilotRouteMetadataFromObject(first);
      return {
        ...parsedFirst,
        payloadKind: 'array',
        batchLength: payload.length,
      };
    }
    return {
      payloadKind: 'array',
      batchLength: payload.length,
      metadataMatched: false,
    };
  }

  return {
    payloadKind: 'other',
    metadataMatched: false,
  };
}
