import {
  HttpAgent,
  runHttpRequest,
  transformHttpEventStream,
  type BaseEvent,
  type HttpAgentConfig,
  type RunAgentInput,
} from '@ag-ui/client';
import type { Observable } from 'rxjs';

type PiRuntimeHttpAgentConfig = Omit<HttpAgentConfig, 'url'> & {
  runtimeUrl: string;
};

export class PiRuntimeHttpAgent extends HttpAgent {
  runtimeUrl: string;
  private activeRunId?: string;

  constructor(config: PiRuntimeHttpAgentConfig) {
    if (!config.agentId) {
      throw new Error('PiRuntimeHttpAgent requires an agentId.');
    }

    const runtimeUrl = config.runtimeUrl.replace(/\/$/, '');

    super({
      ...config,
      url: `${runtimeUrl}/agent/${encodeURIComponent(config.agentId)}/run`,
    });

    this.runtimeUrl = runtimeUrl;
  }

  override connect(input: RunAgentInput): Observable<BaseEvent> {
    this.rememberActiveRun(input);

    const httpEvents = runHttpRequest(
      `${this.runtimeUrl}/agent/${encodeURIComponent(this.agentId ?? '')}/connect`,
      this.requestInit(input),
    );

    return transformHttpEventStream(httpEvents);
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    this.rememberActiveRun(input);
    return super.run(input);
  }

  override abortRun(): void {
    const agentId = this.agentId;
    const threadId = this.threadId;
    const activeRunId = this.activeRunId;
    const headers = this.headers;

    super.abortRun();

    if (!agentId || !threadId || !activeRunId || typeof fetch === 'undefined') {
      return;
    }

    void fetch(`${this.runtimeUrl}/agent/${encodeURIComponent(agentId)}/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        threadId,
        runId: activeRunId,
      }),
    }).catch(() => undefined);
  }

  override clone(): PiRuntimeHttpAgent {
    const cloned = super.clone() as PiRuntimeHttpAgent;
    cloned.runtimeUrl = this.runtimeUrl;
    cloned.activeRunId = this.activeRunId;
    return cloned;
  }

  private rememberActiveRun(input: RunAgentInput): void {
    this.threadId = input.threadId;
    this.activeRunId = input.runId;
  }
}
