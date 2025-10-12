/**
 * Binance-specific error handling and error codes
 */

export class BinanceError extends Error {
  public readonly code: number;
  public readonly binanceMsg: string;

  constructor(code: number, message: string, binanceMsg: string) {
    super(message);
    this.name = 'BinanceError';
    this.code = code;
    this.binanceMsg = binanceMsg;
  }
}

export class BinanceRateLimitError extends BinanceError {
  constructor(message: string = 'Rate limit exceeded') {
    super(-1003, message, 'Too many requests');
  }
}

export class BinanceInsufficientBalanceError extends BinanceError {
  constructor(message: string = 'Insufficient balance') {
    super(-2010, message, 'Account has insufficient balance for requested action');
  }
}

export class BinanceInvalidSymbolError extends BinanceError {
  constructor(symbol: string) {
    super(-1121, `Invalid symbol: ${symbol}`, 'Invalid symbol');
  }
}

export class BinanceInvalidQuantityError extends BinanceError {
  constructor(message: string = 'Invalid quantity') {
    super(-1013, message, 'Invalid quantity');
  }
}

export class BinanceInvalidPriceError extends BinanceError {
  constructor(message: string = 'Invalid price') {
    super(-1013, message, 'Invalid price');
  }
}

export class BinanceOrderNotFoundError extends BinanceError {
  constructor(orderId: string) {
    super(-2013, `Order not found: ${orderId}`, 'Order does not exist');
  }
}

export class BinanceAPIKeyError extends BinanceError {
  constructor(message: string = 'Invalid API key') {
    super(-1022, message, 'Signature for this request is not valid');
  }
}

export class BinancePermissionError extends BinanceError {
  constructor(message: string = 'Insufficient permissions') {
    super(-1021, message, 'Timestamp for this request is outside of the recvWindow');
  }
}

/**
 * Map Binance error codes to user-friendly messages
 */
export function mapBinanceError(error: any): BinanceError {
  if (error instanceof BinanceError) {
    return error;
  }

  // Extract error information from different possible structures
  let code = -1;
  let msg = 'Unknown error';
  
  if (error?.code !== undefined) {
    code = error.code;
  } else if (error?.error?.code !== undefined) {
    code = error.error.code;
  } else if (error?.response?.data?.code !== undefined) {
    code = error.response.data.code;
  }
  
  if (error?.msg) {
    msg = error.msg;
  } else if (error?.error?.msg) {
    msg = error.error.msg;
  } else if (error?.response?.data?.msg) {
    msg = error.response.data.msg;
  } else if (error?.message) {
    msg = error.message;
  }

  // Handle HTTP status codes
  if (error?.response?.status) {
    const status = error.response.status;
    if (status === 401) {
      return new BinanceAPIKeyError('Invalid API key or signature');
    } else if (status === 403) {
      return new BinancePermissionError('API key does not have required permissions');
    } else if (status === 429) {
      return new BinanceRateLimitError('Rate limit exceeded');
    }
  }

  switch (code) {
    case -1003:
      return new BinanceRateLimitError();
    case -2010:
      return new BinanceInsufficientBalanceError();
    case -1121:
      return new BinanceInvalidSymbolError(msg);
    case -1013:
      if (msg.includes('quantity')) {
        return new BinanceInvalidQuantityError();
      } else if (msg.includes('price')) {
        return new BinanceInvalidPriceError();
      }
      return new BinanceError(code, msg, msg);
    case -2013:
      return new BinanceOrderNotFoundError(msg);
    case -1022:
      return new BinanceAPIKeyError();
    case -1021:
      return new BinancePermissionError();
    case -2014:
      return new BinanceAPIKeyError('API-key format invalid');
    case -2015:
      return new BinanceAPIKeyError('Invalid API-key, IP, or permissions for action');
    default:
      return new BinanceError(code, msg, msg);
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof BinanceError) {
    // Rate limit errors are retryable
    return error.code === -1003;
  }
  
  // Network errors and timeouts are retryable
  return error?.code === 'ECONNRESET' || 
         error?.code === 'ETIMEDOUT' || 
         error?.message?.includes('timeout') ||
         error?.message?.includes('network');
}
