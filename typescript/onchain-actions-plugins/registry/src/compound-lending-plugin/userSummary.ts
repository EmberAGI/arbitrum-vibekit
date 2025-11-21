import { ethers } from 'ethers';

// Compound V3 user position data structure
export type CompoundUserPosition = {
  // Collateral positions
  collateral: Array<{
    asset: string;
    balance: ethers.BigNumber;
    balanceUsd: string;
  }>;
  // Borrow position (single borrowable asset in Compound V3)
  borrowBalance: ethers.BigNumber;
  borrowBalanceUsd: string;
  // Calculated metrics
  totalCollateralUsd: string;
  totalBorrowsUsd: string;
  netWorthUsd: string;
  healthFactor: string;
  currentLoanToValue: string;
  currentLiquidationThreshold: string;
  availableBorrowsUsd: string;
};

function formatNumeric(value: string | ethers.BigNumber): string {
  const num = typeof value === 'string' ? parseFloat(value) : parseFloat(value.toString());
  if (Number.isNaN(num)) return '0';
  if (Number.isInteger(num)) return num.toString();
  return parseFloat(num.toFixed(2)).toString();
}

export class UserSummary {
  public position: CompoundUserPosition;

  constructor(position: CompoundUserPosition) {
    this.position = position;
  }

  public toHumanReadable(): string {
    let output = 'User Positions:\n';
    output += `Total Collateral (USD): ${formatNumeric(this.position.totalCollateralUsd)}\n`;
    output += `Total Borrows (USD): ${formatNumeric(this.position.totalBorrowsUsd)}\n`;
    output += `Net Worth (USD): ${formatNumeric(this.position.netWorthUsd)}\n`;
    output += `Health Factor: ${formatNumeric(this.position.healthFactor)}\n`;
    output += `Loan to Value: ${formatNumeric(this.position.currentLoanToValue)}\n`;
    output += `Available to Borrow (USD): ${formatNumeric(this.position.availableBorrowsUsd)}\n\n`;

    output += 'Collateral:\n';
    for (const collateral of this.position.collateral) {
      if (parseFloat(collateral.balanceUsd) > 0) {
        const balance = formatNumeric(collateral.balance);
        output += `- ${collateral.asset}: ${balance} (USD: ${formatNumeric(collateral.balanceUsd)})\n`;
      }
    }

    output += '\nBorrows:\n';
    if (parseFloat(this.position.totalBorrowsUsd) > 0) {
      const borrowBalance = formatNumeric(this.position.borrowBalance);
      output += `- Base Asset: ${borrowBalance} (USD: ${formatNumeric(this.position.borrowBalanceUsd)})\n`;
    } else {
      output += '- No borrows\n';
    }

    return output;
  }
}
