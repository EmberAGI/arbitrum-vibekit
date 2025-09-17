import type { ReservesDataHumanized, UserReserveDataHumanized } from '@aave/contract-helpers';
import {
  formatReserves,
  formatUserSummary,
  type FormatUserSummaryResponse,
  type FormatReserveUSDResponse,
} from '@aave/math-utils';

function formatNumeric(value: string): string {
  const num = parseFloat(value);
  if (Number.isInteger(num)) return num.toString();
  return parseFloat(num.toFixed(2)).toString();
}

export class UserSummary {
  public reserves: FormatUserSummaryResponse<FormatReserveUSDResponse>;

  /**
   * @param userReservesResponse - The response from getUserReservesHumanized.
   * @param reservesResponse - The response from getReservesHumanized.
   */
  constructor(
    userReservesResponse: {
      userReserves: UserReserveDataHumanized[];
      userEmodeCategoryId: number;
    },
    reservesResponse: ReservesDataHumanized
  ) {
    const currentTimestamp = Date.now() / 1000;

    const formattedReserves = formatReserves({
      reserves: reservesResponse.reservesData,
      currentTimestamp,
      marketReferenceCurrencyDecimals:
        reservesResponse.baseCurrencyData.marketReferenceCurrencyDecimals,
      marketReferencePriceInUsd:
        reservesResponse.baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    });

    this.reserves = formatUserSummary({
      currentTimestamp,
      marketReferencePriceInUsd:
        reservesResponse.baseCurrencyData.marketReferenceCurrencyPriceInUsd,
      marketReferenceCurrencyDecimals:
        reservesResponse.baseCurrencyData.marketReferenceCurrencyDecimals,
      userReserves: userReservesResponse.userReserves,
      formattedReserves,
      userEmodeCategoryId: userReservesResponse.userEmodeCategoryId,
    });
  }

  public toHumanReadable(): string {
    let output = 'User Positions:\n';
    output += `Total Liquidity (USD): ${formatNumeric(this.reserves.totalLiquidityUSD)}\n`;
    output += `Total Collateral (USD): ${formatNumeric(this.reserves.totalCollateralUSD)}\n`;
    output += `Total Borrows (USD): ${formatNumeric(this.reserves.totalBorrowsUSD)}\n`;
    output += `Net Worth (USD): ${formatNumeric(this.reserves.netWorthUSD)}\n`;
    output += `Health Factor: ${formatNumeric(this.reserves.healthFactor)}\n\n`;
    output += 'Deposits:\n';
    for (const entry of this.reserves.userReservesData) {
      if (parseFloat(entry.scaledATokenBalance) > 0) {
        const underlying = entry.underlyingBalance;
        const underlyingUSD = entry.underlyingBalanceUSD
          ? formatNumeric(entry.underlyingBalanceUSD)
          : 'N/A';
        output += `- ${entry.reserve.symbol}: ${underlying} (USD: ${underlyingUSD})\n`;
      }
    }
    output += '\nLoans:\n';
    for (const entry of this.reserves.userReservesData) {
      const borrow = entry.totalBorrows || '0';
      if (parseFloat(borrow) > 0) {
        const totalBorrows = entry.totalBorrows;
        const totalBorrowsUSD = entry.totalBorrowsUSD
          ? formatNumeric(entry.totalBorrowsUSD)
          : 'N/A';
        output += `- ${entry.reserve.symbol}: ${totalBorrows} (USD: ${totalBorrowsUSD})\n`;
      }
    }
    return output;
  }
}
