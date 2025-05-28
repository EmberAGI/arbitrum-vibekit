/* ------------------------------------------------------------------
   arbitrum-vibekit – Core Library (consolidated single-file version)
   ------------------------------------------------------------------ */

/* =========================  Hook Type Helpers  ========================= */

/**
 * Context passed into every tool and hook, carrying args, metadata, headers, and helpers.
 */
export interface ToolCtx<Args = any, Res = any> {
  args: Args;
  headers: Record<string, string | string[]>;
  meta: Record<string, any>;
  result?: Res;
  tool: string;
  /** Retrieve task-scoped state (if a threadId was provided) */
  getTaskState: <T>() => T | undefined;
  /** Persist task-scoped state */
  setTaskState: (v: any) => void;
}

/** Hook that runs before the main tool logic */
export type BeforeHook<Args = any> = (
  ctx: ToolCtx<Args, any>
) => void | Promise<void>;
/** Hook that runs after the main tool logic */
export type AfterHook<Args = any, Res = any> = (
  ctx: ToolCtx<Args, Res>,
  result: Res
) => void | Promise<void>;

/* =========================  Error Handling  ========================= */

export class AgentError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const wrapAsync = <T extends (...args: any[]) => Promise<any>>(
  fn: T
) => {
  return (req: any, res: any, next: any) => fn(req, res, next).catch(next);
};

export function createErrorMiddleware() {
  // Express-style error handler
  return (err: any, _req: any, res: any, _next: any) => {
    if (err instanceof AgentError) {
      res.status(err.status).json({ error: err.code, message: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Internal", message: String(err) });
    }
  };
}

/* =========================  Paywall (x402)  ========================= */

interface PaywallOpts {
  flat?: number;
  pct?: number;
}

export function withPaywall<T extends (ctx: any) => Promise<any>>(
  tool: T,
  opts: PaywallOpts
): T {
  return async function paywalled(ctx: any) {
    if (!ctx.headers["x402-paid"]) {
      const base = Number(ctx.args?.amountUsd ?? 0);
      const fee = (opts.flat ?? 0) + (opts.pct ? base * opts.pct : 0);
      const link = `https://pay.example.com/invoice?amt=${fee}`;
      throw new AgentError("PaymentRequired", `Pay $${fee} first`, 402);
    }
    return tool(ctx);
  } as T;
}

/* =========================  Global Store (Immer)  ========================= */

import { Draft, produce } from "immer";

type Updater<S> = (draft: Draft<S>) => void;

export function createGlobalStore<S extends object>(initial: S) {
  let state = initial;
  const subscribers = new Set<(s: S) => void>();

  function getState() {
    return state;
  }
  function update(fn: Updater<S>) {
    state = produce(state, fn);
    subscribers.forEach((s) => s(state));
  }
  function subscribe(fn: (s: S) => void) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }
  return { getState, update, subscribe } as const;
}

// Default store instance -------------------------------------------------
export interface FrameworkState {
  llm: { meta: any; ctx: Record<string, any> };
  metrics: { toolCalls: Record<string, number> };
}

export const {
  getState: store,
  update,
  subscribe,
} = createGlobalStore<FrameworkState>({
  llm: { meta: {}, ctx: {} },
  metrics: { toolCalls: {} },
});

/* =========================  A2A Helpers  ========================= */

type LoopFn = () => Promise<void> | void;
const loops = new Map<string, NodeJS.Timeout>();

export function createLoopTask(id: string, everySec: number, fn: LoopFn) {
  if (loops.has(id)) clearInterval(loops.get(id)!);
  const timer = setInterval(fn, everySec * 1000);
  loops.set(id, timer);
}

export function cancelLoopTask(id: string) {
  const t = loops.get(id);
  if (t) clearInterval(t);
  loops.delete(id);
}

/* =========================  Server Bootstrap  ========================= */

import express from "express";

export interface ToolDef {
  name: string;
  schema: any;
  impl: (ctx: any) => Promise<any>;
  before?: BeforeHook<any>;
  after?: AfterHook<any, any>;
}

export function startAgent({
  tools,
  port = 3000,
}: {
  tools: ToolDef[];
  port?: number;
}) {
  const app = express();
  app.use(express.json());

  // List tools (MCP endpoint)
  app.get("/mcp/list_tools", (_req, res) => {
    res.json(tools.map((t) => t.schema));
  });

  // Invoke tool
  app.post("/mcp/invoke_tool/:name", async (req, res, next) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) return res.status(404).json({ error: "UnknownTool" });

    const ctx: ToolCtx<any, any> = {
      args: req.body,
      headers: req.headers,
      meta: {},
      tool: tool.name,
      getTaskState: () => undefined,
      setTaskState: () => {},
    };
    try {
      await tool.before?.(ctx);
      const result = await tool.impl(ctx);
      ctx.result = result;
      await tool.after?.(ctx, result);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Error middleware
  app.use(createErrorMiddleware());

  app.listen(port, () => console.log(`🟢 Agent up on :${port}`));
}

/* =========================  Provider Exports (stub)  ========================= */

export const priceProvider = {
  name: "priceProvider.getPrice",
  schema: { name: "getPrice", parameters: { symbol: "string" } },
  impl: async ({ args }: { args: { symbol: string } }) => ({ usd: 2000.0 }),
};
