import { z } from "zod";
import { LendingPositionSchema } from "./lending.js";

export const WalletPositionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("lending"),
    lendingPosition: LendingPositionSchema,
  }),
]);
export type WalletPosition = z.infer<typeof WalletPositionSchema>;

export const GetWalletPositionsResponseSchema = z.object({
  positions: z.array(WalletPositionSchema),
});
export type GetWalletPositionsResponse = z.infer<
  typeof GetWalletPositionsResponseSchema
>;

export const GetWalletPositionsRequestSchema = z.object({
  walletAddress: z.string(),
});
export type GetWalletPositionsRequest = z.infer<
  typeof GetWalletPositionsRequestSchema
>; 