import axios, { type AxiosResponse } from 'axios';
import type { Task } from 'a2a-samples-js';

export interface TradingSignal {
  signalMessage: 'buy' | 'sell';
  tokenMentioned: string;
  tp1: number;
  tp2: number;
  sl: number;
  currentPrice?: number;
  maxExitTime: string; // ISO 8601 date string
}

export interface HyperliquidApiResponse {
  status: string;
  message?: string;
  signal_id?: string;
  order_result?: any;
  position_size?: number;
  entry_price?: number;
  tp1?: number;
  tp2?: number;
  sl?: number;
  error?: string;
  details?: any;
}

export class HyperliquidVaultAgent {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = 'http://127.0.0.1:5000') {
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  async init(): Promise<void> {
    try {
      // Test connection to the Python API
      const response = await axios.get(`${this.apiBaseUrl}/health`, { timeout: 5000 });
      console.log('HyperliquidVaultAgent initialized successfully:', response.data);
    } catch (error) {
      console.warn('Warning: Could not connect to Hyperliquid API:', error instanceof Error ? error.message : String(error));
      console.warn('Make sure the Python API is running on', this.apiBaseUrl);
    }
  }

  async processUserInput(instruction: string): Promise<Task> {
    try {
      console.log('[HyperliquidVaultAgent] Processing:', instruction);

      const signal = this.parseSignalInstruction(instruction);
      const taskId = `hyperliquid-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      return await this.executeSignal(taskId, signal);
    } catch (error) {
      console.error('[HyperliquidVaultAgent] Error:', error);
      return this.createErrorTask(
        `hyperliquid-error-${Date.now()}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private parseSignalInstruction(instruction: string): TradingSignal {
    const lowerInstruction = instruction.toLowerCase();

    // Extract signal direction (buy/sell)
    let signalMessage: 'buy' | 'sell' = 'buy';
    if (lowerInstruction.includes('sell') || lowerInstruction.includes('short') || lowerInstruction.includes('bearish')) {
      signalMessage = 'sell';
    } else if (lowerInstruction.includes('buy') || lowerInstruction.includes('long') || lowerInstruction.includes('bullish')) {
      signalMessage = 'buy';
    }

    // Extract token/symbol
    const tokenMentioned = this.extractToken(instruction);
    if (!tokenMentioned) {
      throw new Error('Could not identify token/symbol in the instruction. Please specify a token like BTC, ETH, SOL, etc.');
    }

    // Extract prices for TP1, TP2, SL
    const prices = this.extractPrices(instruction);
    if (prices.length < 3) {
      throw new Error('Please provide at least 3 price levels: Take Profit 1, Take Profit 2, and Stop Loss. Example: "Buy BTC TP1 100000 TP2 105000 SL 95000"');
    }

    // Determine which prices are TP1, TP2, and SL based on signal direction
    let tp1: number, tp2: number, sl: number;

    if (signalMessage === 'buy') {
      // For buy signals: TP1 < TP2 (both above current), SL below current
      const sortedPrices = prices.sort((a, b) => a - b);
      sl = sortedPrices[0]!;  // Lowest price is SL
      tp1 = sortedPrices[1]!; // Middle price is TP1
      tp2 = sortedPrices[2]!; // Highest price is TP2
    } else {
      // For sell signals: TP1 > TP2 (both below current), SL above current
      const sortedPrices = prices.sort((a, b) => b - a);
      sl = sortedPrices[0]!;  // Highest price is SL
      tp1 = sortedPrices[1]!; // Middle price is TP1
      tp2 = sortedPrices[2]!; // Lowest price is TP2
    }

    // Extract or generate exit time
    const maxExitTime = this.extractOrGenerateExitTime(instruction);

    return {
      signalMessage,
      tokenMentioned,
      tp1,
      tp2,
      sl,
      maxExitTime
    };
  }

  private extractToken(instruction: string): string | null {
    // Common crypto symbols
    const cryptoSymbols = [
      'BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'AVAX', 'LINK', 'UNI', 'AAVE', 'COMP',
      'SUSHI', 'SNX', 'MKR', 'YFI', 'CRV', 'ALPHA', 'BAND', 'BAL', 'ZRX', 'KNC',
      'DOGE', 'SHIB', 'MATIC', 'FTM', 'ATOM', 'LUNA', 'NEAR', 'ICP', 'VET', 'XRP',
      'AXS', 'MANA', 'SAND', 'ENJ', 'CHZ', 'BAT', 'ZEC', 'LTC', 'BCH', 'ETC',
      'VIRTUAL', 'AI16Z', 'GOAT', 'FARTCOIN', 'ZEREBRO', 'GRIFFAIN', 'CHAOS'
    ];

    const upperInstruction = instruction.toUpperCase();

    for (const symbol of cryptoSymbols) {
      // Look for the symbol as a whole word
      const regex = new RegExp(`\\b${symbol}\\b`, 'i');
      if (regex.test(instruction)) {
        return symbol;
      }
    }

    // Look for common patterns like "bitcoin", "ethereum", etc.
    const tokenMap: { [key: string]: string } = {
      'bitcoin': 'BTC',
      'btc': 'BTC',
      'ethereum': 'ETH',
      'eth': 'ETH',
      'solana': 'SOL',
      'sol': 'SOL',
      'cardano': 'ADA',
      'ada': 'ADA',
      'polkadot': 'DOT',
      'dot': 'DOT',
      'avalanche': 'AVAX',
      'avax': 'AVAX',
      'chainlink': 'LINK',
      'link': 'LINK',
      'uniswap': 'UNI',
      'uni': 'UNI',
      'dogecoin': 'DOGE',
      'doge': 'DOGE',
      'polygon': 'MATIC',
      'matic': 'MATIC'
    };

    for (const [name, symbol] of Object.entries(tokenMap)) {
      if (upperInstruction.includes(name.toUpperCase())) {
        return symbol;
      }
    }

    return null;
  }

  private extractPrices(instruction: string): number[] {
    // Extract all numeric values that could be prices
    const priceRegex = /\b\d+(?:\.\d+)?(?:k|K)?\b/g;
    const matches = instruction.match(priceRegex);

    if (!matches) {
      return [];
    }

    return matches.map(match => {
      let value = parseFloat(match.replace(/[kK]$/, ''));
      if (match.endsWith('k') || match.endsWith('K')) {
        value *= 1000;
      }
      return value;
    }).filter(price => price > 0 && price < 10000000); // Filter reasonable price ranges
  }

  private extractOrGenerateExitTime(instruction: string): string {
    // Look for time expressions in the instruction
    const timeExpressions = [
      /(\d+)\s*(hour|hours|hr|hrs)/i,
      /(\d+)\s*(day|days|d)/i,
      /(\d+)\s*(week|weeks|w)/i,
      /(\d+)\s*(minute|minutes|min|mins)/i
    ];

    let hoursToAdd = 24; // Default: 24 hours from now

    for (const regex of timeExpressions) {
      const match = instruction.match(regex);
      if (match) {
        const value = parseInt(match[1]!);
        const unit = match[2]!.toLowerCase();

        if (unit.startsWith('hour') || unit.startsWith('hr')) {
          hoursToAdd = value;
        } else if (unit.startsWith('day') || unit === 'd') {
          hoursToAdd = value * 24;
        } else if (unit.startsWith('week') || unit === 'w') {
          hoursToAdd = value * 24 * 7;
        } else if (unit.startsWith('minute') || unit.startsWith('min')) {
          hoursToAdd = value / 60;
        }
        break;
      }
    }

    // Generate exit time
    const exitTime = new Date();
    exitTime.setTime(exitTime.getTime() + (hoursToAdd * 60 * 60 * 1000));

    return exitTime.toISOString();
  }

  private async executeSignal(taskId: string, signal: TradingSignal): Promise<Task> {
    try {
      console.log('[HyperliquidVaultAgent] Executing signal:', signal);

      // Prepare the API request payload
      const payload = {
        'Signal Message': signal.signalMessage,
        'Token Mentioned': signal.tokenMentioned,
        'TP1': signal.tp1,
        'TP2': signal.tp2,
        'SL': signal.sl,
        'Max Exit Time': signal.maxExitTime,
        ...(signal.currentPrice && { 'Current Price': signal.currentPrice })
      };

      console.log('[HyperliquidVaultAgent] API payload:', payload);

      // Make the API call
      const response: AxiosResponse<HyperliquidApiResponse> = await axios.post(
        `${this.apiBaseUrl}/signal`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      const result = response.data;

      if (result.status === 'success') {
        return {
          id: taskId,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `✅ Trading signal executed successfully!\n\n` +
                    `🎯 Signal: ${signal.signalMessage.toUpperCase()} ${signal.tokenMentioned}\n` +
                    `💰 Position Size: ${result.position_size?.toFixed(8) || 'N/A'} ${signal.tokenMentioned}\n` +
                    `📈 Entry Price: $${result.entry_price?.toFixed(2) || 'N/A'}\n` +
                    `🎯 TP1: $${signal.tp1}\n` +
                    `🎯 TP2: $${signal.tp2}\n` +
                    `🛡️ Stop Loss: $${signal.sl}\n` +
                    `⏰ Max Exit Time: ${new Date(signal.maxExitTime).toLocaleString()}\n` +
                    `🆔 Signal ID: ${result.signal_id || 'N/A'}\n\n` +
                    `${result.message || 'Position is now being monitored for TP/SL conditions.'}`,
                },
              ],
            },
          },
          metadata: {
            operation: 'trade_signal',
            signal,
            apiResponse: result,
            signalId: result.signal_id,
          },
        };
      } else {
        throw new Error(result.error || result.message || 'Unknown error from Hyperliquid API');
      }
    } catch (error) {
      console.error('[HyperliquidVaultAgent] API Error:', error);

      let errorMessage = 'Failed to execute trading signal';
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Could not connect to Hyperliquid API. Please ensure the Python API server is running.';
        } else if (error.response) {
          const apiError = error.response.data?.error || error.response.data?.message || error.message;
          errorMessage = `API Error: ${apiError}`;
        } else {
          errorMessage = `Network Error: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  }

  async getStatus(): Promise<any> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/status`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getVaultBalance(): Promise<any> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/vault-balance`, { timeout: 10000 });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get vault balance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private createErrorTask(taskId: string, errorMessage: string): Task {
    return {
      id: taskId,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `❌ Error: ${errorMessage}`,
            },
          ],
        },
      },
      metadata: {
        operation: 'error',
        error: errorMessage,
      },
    };
  }
} 