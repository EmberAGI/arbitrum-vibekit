import type { PaymentRequirements, VerifyResponse } from "x402/types";

/**
 * The response from the X402 payment when there is an error
 */
export interface X402PaymentResponse {
  x402Version: number;
  error?: string;
  payer?: VerifyResponse["payer"];
  accepts: PaymentRequirements[];
}
