/**
 * Typed error classes for the Uniswap MCP server.
 * Provides clear, agent-readable error messages with structured error codes.
 */

export class UniswapMCPError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'UniswapMCPError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends UniswapMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class TokenError extends UniswapMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TOKEN_ERROR', details);
    this.name = 'TokenError';
  }
}

export class RoutingError extends UniswapMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ROUTING_ERROR', details);
    this.name = 'RoutingError';
  }
}

export class LiquidityError extends UniswapMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'LIQUIDITY_ERROR', details);
    this.name = 'LiquidityError';
  }
}

export class TransactionError extends UniswapMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TRANSACTION_ERROR', details);
    this.name = 'TransactionError';
  }
}

export class ConfigurationError extends UniswapMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

export class BalanceError extends UniswapMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BALANCE_ERROR', details);
    this.name = 'BalanceError';
  }
}

export class ApprovalError extends UniswapMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'APPROVAL_ERROR', details);
    this.name = 'ApprovalError';
  }
}

