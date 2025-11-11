/**
 * Session Management Types
 *
 * Unified system for managing conversations and tool executions as persistent sessions
 */

export type SessionType = "conversation" | "tool-execution";

export type SessionStatus =
  | "idle" // No activity
  | "connecting" // Establishing connection
  | "active" // Active and ready
  | "working" // Processing/executing
  | "waiting" // Waiting for response
  | "completed" // Successfully completed
  | "error" // Error state
  | "paused"; // Paused/suspended

export type TaskState =
  | "pending" // Task created but not yet started
  | "working" // Task is actively processing
  | "completed" // Task completed successfully
  | "failed" // Task failed with error
  | "cancelled"; // Task was cancelled

export interface TaskInfo {
  taskId: string;
  state: TaskState;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string; // Error message if failed
}

export interface ArtifactData {
  artifactId: string;
  toolName: string;
  input: any;
  output: any;
  append?: boolean; // If true, keep this artifact alongside others; if false, replace previous artifacts of same type
  isLoading?: boolean; // If true, shows loading state (empty data with more chunks expected)
}

export interface SessionMessage {
  id: string;
  sender: "user" | "agent" | "agent-progress" | "agent-error";
  content: string;
  timestamp: Date;
  validationErrors?: string[];
  isHtml?: boolean;
  isStreaming?: boolean;
  reasoning?: string;
  toolInvocation?: {
    toolName: string;
    input: any;
    output: any;
  };
  // New: Support multiple artifacts with IDs
  artifacts?: Record<string, ArtifactData>; // Key is artifactId
  // Status data for input-required/auth-required states
  statusData?: {
    awaitingInput?: boolean;
    awaitingInputType?: string;
    inputSchema?: any;
    statusMessage?: any;
  };
  awaitingUserAction?: boolean; // Quick flag for checking if user action is needed
}

export interface ToolExecutionMetadata {
  toolName: string;
  taskId: string;
  workflowName?: string;
  description?: string;
  parentSessionId?: string; // Reference to conversation that spawned this
  startedAt: Date;
  completedAt?: Date;
}

export interface Session {
  id: string;
  type: SessionType;
  status: SessionStatus;
  title: string;
  subtitle?: string; // Optional subtitle for display
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;

  // A2A connection state
  contextId: string | null; // Server-side session ID
  agentEndpoint: string | null;
  tasks: TaskInfo[]; // Task history (oldest to newest)

  // Message history
  messages: SessionMessage[];

  // Tool execution specific
  toolMetadata?: ToolExecutionMetadata;

  // UI state
  isMinimized: boolean;
  scrollPosition?: number;

  // Persistence flag - if true, don't save to localStorage (e.g., child workflow tabs)
  isTemporary?: boolean;

  // Main chat flag - if true, this is the primary chat session that never moves
  isMainChat?: boolean;

  // Parent session reference for child workflows
  parentSessionId?: string;
}

export interface SessionState {
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  sessionOrder: string[]; // Order of tabs in sidebar
}

export interface CreateSessionOptions {
  type: SessionType;
  title: string;
  contextId?: string | null;
  agentEndpoint?: string | null;
  toolMetadata?: ToolExecutionMetadata;
  parentSessionId?: string;
  isTemporary?: boolean; // If true, don't persist to localStorage
  isMainChat?: boolean; // If true, this is the primary chat session
}

// Status color mapping for UI
export const STATUS_COLORS: Record<
  SessionStatus,
  { bg: string; text: string; border: string; icon: string }
> = {
  idle: {
    bg: "bg-gray-500/10",
    text: "text-gray-400",
    border: "border-gray-500/20",
    icon: "○",
  },
  connecting: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/20",
    icon: "◐",
  },
  active: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    border: "border-green-500/20",
    icon: "●",
  },
  working: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/20",
    icon: "◉",
  },
  waiting: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    border: "border-yellow-500/20",
    icon: "◎",
  },
  completed: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    border: "border-green-500/20",
    icon: "✓",
  },
  error: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/20",
    icon: "✗",
  },
  paused: {
    bg: "bg-gray-500/10",
    text: "text-gray-400",
    border: "border-gray-500/20",
    icon: "❙❙",
  },
};

// Helper to generate session IDs
export function generateSessionId(type: SessionType): string {
  const prefix = type === "conversation" ? "conv" : "tool";
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to determine status from task state
export function mapTaskStateToStatus(state: string): SessionStatus {
  switch (state) {
    case "pending":
      return "waiting";
    case "working":
    case "running":
      return "working";
    case "completed":
    case "success":
      return "completed";
    case "failed":
    case "error":
      return "error";
    case "paused":
      return "paused";
    default:
      return "active";
  }
}

// Helper to get the latest incomplete task from a session
export function getLatestIncompleteTask(tasks: TaskInfo[]): TaskInfo | null {
  // Search from newest to oldest
  for (let i = tasks.length - 1; i >= 0; i--) {
    const task = tasks[i];
    if (task.state === "pending" || task.state === "working") {
      return task;
    }
  }
  return null;
}

// Helper to get the latest task (regardless of state)
export function getLatestTask(tasks: TaskInfo[]): TaskInfo | null {
  if (tasks.length === 0) return null;
  return tasks[tasks.length - 1];
}

// Helper to find a task by ID
export function findTaskById(
  tasks: TaskInfo[],
  taskId: string
): TaskInfo | null {
  return tasks.find((task) => task.taskId === taskId) || null;
}

// Helper to create a new task info
export function createTaskInfo(
  taskId: string,
  state: TaskState = "pending"
): TaskInfo {
  const now = new Date();
  return {
    taskId,
    state,
    createdAt: now,
    updatedAt: now,
  };
}
