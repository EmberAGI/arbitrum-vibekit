import fs from "fs/promises";
import path from "path";
import type * as schema from "@google-a2a/types";
import { VibkitError } from "./error.js";
import { isObject } from "./utils.js";
// import {
//   getCurrentTimestamp,
//   isArtifactUpdate,
//   isTaskStatusUpdate,
// } from "./utils.js";

// Helper type for the simplified store
export interface TaskAndHistory {
  task: schema.Task;
  history: schema.Message[];
}

/**
 * Simplified interface for task storage providers.
 * Stores and retrieves both the task and its full message history together.
 */
export interface TaskStore {
  /**
   * Saves a task and its associated message history.
   * Overwrites existing data if the task ID exists.
   * @param data An object containing the task and its history.
   * @returns A promise resolving when the save operation is complete.
   */
  save(data: TaskAndHistory): Promise<void>;

  /**
   * Loads a task and its history by task ID.
   * @param taskId The ID of the task to load.
   * @returns A promise resolving to an object containing the Task and its history, or null if not found.
   */
  load(taskId: string): Promise<TaskAndHistory | null>;
}

// ========================
// InMemoryTaskStore
// ========================

// Use TaskAndHistory directly for storage
export class InMemoryTaskStore implements TaskStore {
  private store: Map<string, TaskAndHistory> = new Map();

  async load(taskId: string): Promise<TaskAndHistory | null> {
    const entry = this.store.get(taskId);
    // Return copies to prevent external mutation
    return entry
      ? { task: { ...entry.task }, history: [...entry.history] }
      : null;
  }

  async save(data: TaskAndHistory): Promise<void> {
    // Store copies to prevent internal mutation if caller reuses objects
    this.store.set(data.task.id, {
      task: { ...data.task },
      history: [...data.history],
    });
  }
}

// ========================
// FileStore
// ========================

export class FileStore implements TaskStore {
  private baseDir: string;

  constructor(options?: { dir?: string }) {
    // Default directory relative to the current working directory
    this.baseDir = options?.dir || ".a2a-tasks";
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw VibkitError.internalError(
        `Failed to create directory ${this.baseDir}: ${message}`,
        error
      );
    }
  }

  private getTaskFilePath(taskId: string): string {
    // Sanitize taskId to prevent directory traversal
    const safeTaskId = path.basename(taskId);
    return path.join(this.baseDir, `${safeTaskId}.json`);
  }

  private getHistoryFilePath(taskId: string): string {
    // Sanitize taskId
    const safeTaskId = path.basename(taskId);
    if (safeTaskId !== taskId || taskId.includes("..")) {
      throw VibkitError.invalidParams(`Invalid Task ID format: ${taskId}`);
    }
    return path.join(this.baseDir, `${safeTaskId}.history.json`);
  }

  // Type guard for history file content
  private isHistoryFileContent(
    content: unknown
  ): content is { messageHistory: schema.Message[] } {
    if (!isObject(content)) {
      return false;
    }
    const mh = (content as Record<string, unknown>).messageHistory;
    if (!Array.isArray(mh)) {
      return false;
    }
    return mh.every(
      (msg): msg is schema.Message =>
        isObject(msg) &&
        typeof msg.role === "string" &&
        Array.isArray(msg.parts)
    );
  }

  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const data = await fs.readFile(filePath, "utf8");
      return JSON.parse(data) as T;
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return null; // File not found is not an error for loading
      }
      const message = error instanceof Error ? error.message : String(error);
      throw VibkitError.internalError(
        `Failed to read file ${filePath}: ${message}`,
        error
      );
    }
  }

  private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    try {
      await this.ensureDirectoryExists();
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw VibkitError.internalError(
        `Failed to write file ${filePath}: ${message}`,
        error
      );
    }
  }

  async load(taskId: string): Promise<TaskAndHistory | null> {
    const taskFilePath = this.getTaskFilePath(taskId);
    const historyFilePath = this.getHistoryFilePath(taskId);

    // Read task file first - if it doesn't exist, the task doesn't exist.
    const task = await this.readJsonFile<schema.Task>(taskFilePath);
    if (!task) {
      return null; // Task not found
    }

    // Task exists, now try to read history. It might not exist yet.
    let history: schema.Message[] = [];
    try {
      const historyContent = await this.readJsonFile<unknown>(historyFilePath);
      // Validate the structure slightly
      if (this.isHistoryFileContent(historyContent)) {
        history = historyContent.messageHistory;
      } else if (historyContent !== null) {
        // Log a warning if the history file exists but is malformed
        console.warn(
          `[FileStore] Malformed history file found for task ${taskId} at ${historyFilePath}. Ignoring content.`
        );
        // Proceed with empty history.
      }
      // If historyContent is null (file not found), history remains []
    } catch (error: unknown) {
      // Log error reading history but proceed with empty history
      console.error(
        `[FileStore] Error reading history file for task ${taskId}:`,
        error
      );
      // Proceed with empty history
    }

    return { task, history };
  }

  async save(data: TaskAndHistory): Promise<void> {
    const { task, history } = data;
    const taskFilePath = this.getTaskFilePath(task.id);
    const historyFilePath = this.getHistoryFilePath(task.id);

    // Ensure directory exists (writeJsonFile does this, but good practice)
    await this.ensureDirectoryExists();

    // Write both files - potentially in parallel
    await Promise.all([
      this.writeJsonFile(taskFilePath, task),
      this.writeJsonFile(historyFilePath, { messageHistory: history }),
    ]);
  }
}
