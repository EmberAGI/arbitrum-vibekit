import type { ModelMessage } from 'ai';

export interface SessionContext {
  contextId: string;
}

export interface ContextState {
  tasks: string[];
  metadata: Record<string, unknown>;
  conversationHistory: ModelMessage[];
}

export interface Context {
  contextId: string;
  createdAt: Date;
  lastActivity: Date;
  state: ContextState;
}

export interface ContextManager {
  createContext(contextId?: string): Context;
  getContext(contextId: string): Context | null;
  listContexts(): Context[];
  updateContextState(contextId: string, updates: Partial<ContextState>): void;
  addToHistory(contextId: string, message: ModelMessage): void;
  addTask(contextId: string, taskId: string): void;
  getTasks(contextId: string): string[];
  getMetadata(contextId: string): Record<string, unknown>;
  getHistory(contextId: string): ModelMessage[];
  isContextActive(contextId: string): boolean;
  updateActivity(contextId: string): void;
  setLastActivity(contextId: string, timestamp: Date): void;
  saveContext(contextId: string): void;
  loadContext(contextId: string): Context | null;
  cleanupInactiveContexts(maxInactivityMinutes: number): void;
  deleteContext(contextId: string): void;
  getOrCreateContext(contextId?: string): Context;
  on(event: string, listener: (...args: unknown[]) => void): ContextManager;
  emit(event: string, data: unknown): boolean;
}

export interface TaskResponse {
  result?: {
    kind: 'task' | 'message';
    id?: string;
    contextId?: string;
    status?: {
      state: string;
      final?: boolean;
    };
    metadata?: Record<string, unknown>;
    parts?: unknown[];
    data?: unknown;
    tasks?: Task[];
    optimization?: {
      terminalTasksOptimized?: boolean;
      queryTime?: number;
    };
  };
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
  body?: {
    result?: TaskResponse['result'];
    error?: TaskResponse['error'];
  };
  status?: number;
}

export interface Task {
  id: string;
  contextId: string;
  createdAt: string;
  updatedAt: string;
  status: {
    state: string;
    final: boolean;
  };
  metadata?: {
    initialState?: string;
    stateTransitions?: StateTransition[];
    persistedAcrossRestart?: boolean;
    modified?: boolean;
    newProperty?: string;
  };
}

export interface StateTransition {
  from?: string;
  to: string;
  timestamp: string;
  valid: boolean;
  reason?: string;
}
