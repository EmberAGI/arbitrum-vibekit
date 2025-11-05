/**
 * Task Operations Module
 * 
 * Handles task CRUD operations for sessions
 */

import React from "react";
import { SessionState, TaskState, createTaskInfo } from "@/lib/types/session";

export interface TaskOperations {
  addTask: (
    sessionId: string,
    taskId: string,
    taskState?: TaskState
  ) => void;
  updateTaskState: (
    sessionId: string,
    taskId: string,
    state: TaskState,
    error?: string
  ) => void;
  getLatestIncompleteTaskId: (sessionId: string) => string | null;
}

export function createTaskOperations(
  state: SessionState,
  setState: React.Dispatch<React.SetStateAction<SessionState>>
): TaskOperations {
  const addTask = (
    sessionId: string,
    taskId: string,
    taskState: TaskState = "pending"
  ) => {
    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) return prev;

      // Check if task already exists
      const existingTask = session.tasks.find((t) => t.taskId === taskId);
      if (existingTask) {
        return prev;
      }

      const newTask = createTaskInfo(taskId, taskState);

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            tasks: [...session.tasks, newTask],
            updatedAt: new Date(),
          },
        },
      };
    });
  };

  const updateTaskState = (
    sessionId: string,
    taskId: string,
    newState: TaskState,
    error?: string
  ) => {
    setState((prev) => {
      const session = prev.sessions[sessionId];
      if (!session) return prev;

      const taskIndex = session.tasks.findIndex((t) => t.taskId === taskId);
      if (taskIndex === -1) {
        console.warn(
          "[TaskOperations] Task not found in session",
          sessionId,
          ":",
          taskId
        );
        return prev;
      }

      const updatedTasks = [...session.tasks];
      const now = new Date();
      updatedTasks[taskIndex] = {
        ...updatedTasks[taskIndex],
        state: newState,
        updatedAt: now,
        ...(newState === "completed" ||
        newState === "failed" ||
        newState === "cancelled"
          ? { completedAt: now }
          : {}),
        ...(error ? { error } : {}),
      };

      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            tasks: updatedTasks,
            updatedAt: now,
          },
        },
      };
    });
  };

  const getLatestIncompleteTaskId = (sessionId: string): string | null => {
    const session = state.sessions[sessionId];
    if (!session) return null;

    for (let i = session.tasks.length - 1; i >= 0; i--) {
      const task = session.tasks[i];
      if (task.state === "pending" || task.state === "working") {
        return task.taskId;
      }
    }
    return null;
  };

  return {
    addTask,
    updateTaskState,
    getLatestIncompleteTaskId,
  };
}

