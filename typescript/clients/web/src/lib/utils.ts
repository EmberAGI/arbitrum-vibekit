import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Address utility functions
export function copyAddressToClipboard(address: string) {
  const fullAddress = address;
  navigator.clipboard.writeText(fullAddress).then(() => {
    console.log(`Copied to clipboard! ${fullAddress}`);
    // TODO: Add proper toast notification if needed
  });
}

export function shortenAddress(address: string): string {
  if (address.length <= 6) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Percentage formatting utility
export function formatPercentage(input: string): string {
  const decimal = parseFloat(input);
  if (isNaN(decimal)) {
    return '';
  }
  return `${(decimal * 100).toFixed(2)}%`;
}

// String to decimal conversion
export function strToDecimal(input: string): number {
  const parsed = parseFloat(input);
  return isNaN(parsed) ? 0 : parsed;
}
