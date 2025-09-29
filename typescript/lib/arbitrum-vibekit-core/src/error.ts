import type {
  JSONRPCError,
  A2AError,
  JSONParseError,
  InvalidRequestError,
  MethodNotFoundError,
  InvalidParamsError,
  InternalError,
  TaskNotFoundError,
  TaskNotCancelableError,
  PushNotificationNotSupportedError,
  UnsupportedOperationError,
  ContentTypeNotSupportedError,
  InvalidAgentResponseError,
} from "@google-a2a/types";

/**
 * Custom error class for internal error handling in the Arbitrum Vibekit.
 * Extends Error for proper stack traces and can be converted to A2A error interfaces.
 */
export class VibkitError extends Error {
  public code: number;
  public data?: unknown;
  public taskId?: string; // Optional task ID context

  constructor(
    name: string,
    code: number,
    message: string,
    data?: unknown,
    taskId?: string
  ) {
    super(message);
    this.name = name;
    this.code = code;
    this.data = data;
    this.taskId = taskId;
  }

  /**
   * Formats the error into a standard JSON-RPC error object structure.
   */
  toJSONRPCError(): JSONRPCError {
    const errorObject: JSONRPCError = {
      code: this.code,
      message: this.message,
    };
    if (this.data !== undefined) {
      errorObject.data = this.data;
    }
    return errorObject;
  }

  /**
   * Converts this error to a properly typed A2A error interface.
   * Use this when sending errors over the wire (JSON-RPC responses).
   */
  toA2AError(): A2AError {
    const baseError = {
      code: this.code as any,
      message: this.message,
      ...(this.data !== undefined && { data: this.data }),
    };

    // Return the properly typed error based on the code
    switch (this.code) {
      case -32700:
        return baseError as JSONParseError;
      case -32600:
        return baseError as InvalidRequestError;
      case -32601:
        return baseError as MethodNotFoundError;
      case -32602:
        return baseError as InvalidParamsError;
      case -32603:
        return baseError as InternalError;
      case -32001:
        return baseError as TaskNotFoundError;
      case -32002:
        return baseError as TaskNotCancelableError;
      case -32003:
        return baseError as PushNotificationNotSupportedError;
      case -32004:
        return baseError as UnsupportedOperationError;
      case -32005:
        return baseError as ContentTypeNotSupportedError;
      case -32006:
        return baseError as InvalidAgentResponseError;
      default:
        // For unknown codes, return as InternalError
        return { ...baseError, code: -32603 } as InternalError;
    }
  }

  // Static factory methods that return VibkitError instances

  static parseError(
    message: string = "Invalid JSON payload",
    data?: unknown
  ): VibkitError {
    return new VibkitError("JSONParseError", -32700, message, data);
  }

  static invalidRequest(
    message: string = "Request payload validation error",
    data?: unknown
  ): VibkitError {
    return new VibkitError("InvalidRequestError", -32600, message, data);
  }

  static methodNotFound(method?: string): VibkitError {
    const message = method ? `Method not found: ${method}` : "Method not found";
    return new VibkitError("MethodNotFoundError", -32601, message);
  }

  static invalidParams(
    message: string = "Invalid parameters",
    data?: unknown
  ): VibkitError {
    return new VibkitError("InvalidParamsError", -32602, message, data);
  }

  static internalError(
    message: string = "Internal error",
    data?: unknown
  ): VibkitError {
    return new VibkitError("InternalError", -32603, message, data);
  }

  static taskNotFound(taskId?: string): VibkitError {
    const message = taskId ? `Task not found: ${taskId}` : "Task not found";
    return new VibkitError(
      "TaskNotFoundError",
      -32001,
      message,
      undefined,
      taskId
    );
  }

  static taskNotCancelable(taskId?: string): VibkitError {
    const message = taskId
      ? `Task cannot be canceled: ${taskId}`
      : "Task cannot be canceled";
    return new VibkitError(
      "TaskNotCancelableError",
      -32002,
      message,
      undefined,
      taskId
    );
  }

  static pushNotificationNotSupported(): VibkitError {
    return new VibkitError(
      "PushNotificationNotSupportedError",
      -32003,
      "Push Notification is not supported"
    );
  }

  static unsupportedOperation(operation?: string): VibkitError {
    const message = operation
      ? `This operation is not supported: ${operation}`
      : "This operation is not supported";
    return new VibkitError("UnsupportedOperationError", -32004, message);
  }

  static contentTypeNotSupported(
    message: string = "Incompatible content types"
  ): VibkitError {
    return new VibkitError("ContentTypeNotSupportedError", -32005, message);
  }

  static invalidAgentResponse(
    message: string = "Invalid agent response"
  ): VibkitError {
    return new VibkitError("InvalidAgentResponseError", -32006, message);
  }
}

// Re-export the A2A error types from Google's package for convenience
export type { A2AError };
export type {
  JSONParseError,
  InvalidRequestError,
  MethodNotFoundError,
  InvalidParamsError,
  InternalError,
  TaskNotFoundError,
  TaskNotCancelableError,
  PushNotificationNotSupportedError,
  UnsupportedOperationError,
  ContentTypeNotSupportedError,
  InvalidAgentResponseError,
};
