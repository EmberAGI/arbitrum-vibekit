import { z } from "zod";

const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/u, "address must be an EVM address")
  .transform((value) => value.toLowerCase() as `0x${string}`);

const ChainIdSchema = z
  .string()
  .regex(/^\d+$/u, "chainId must be a decimal string")
  .transform((value) => value.trim());

const TokenIdentifierSchema = z.object({
  chainId: ChainIdSchema,
  address: AddressSchema,
});

const PoolIdentifierSchema = z.object({
  chainId: ChainIdSchema,
  address: AddressSchema,
});

const ClmmRangeSchema = z.union([
  z.object({ type: z.literal("full") }),
  z.object({
    type: z.literal("limited"),
    minPrice: z.string(),
    maxPrice: z.string(),
  }),
]);

const PayableTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
});

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("supply") }),
  z.object({ type: z.literal("withdraw") }),
  z.object({
    type: z.literal("swap"),
    amount: z.string(),
    amountType: z.enum(["exactIn", "exactOut"]),
    fromTokenUid: TokenIdentifierSchema,
    toTokenUid: TokenIdentifierSchema,
  }),
]);

export const EmberClmmIntentSchema = z
  .object({
    chainId: ChainIdSchema,
    walletAddress: AddressSchema,
    poolIdentifier: PoolIdentifierSchema,
    poolTokenUid: PoolIdentifierSchema.optional(),
    range: ClmmRangeSchema,
    payableTokens: z.array(PayableTokenSchema).min(2),
    actions: z.array(ActionSchema).min(1),
  })
  .refine((value) => value.poolIdentifier.chainId === value.chainId, {
    message: "poolIdentifier.chainId must match chainId",
    path: ["poolIdentifier", "chainId"],
  })
  .refine((value) => value.poolTokenUid?.chainId === value.chainId, {
    message: "poolTokenUid.chainId must match chainId",
    path: ["poolTokenUid", "chainId"],
  })
  .refine(
    (value) => value.payableTokens.every((token) => token.tokenUid.chainId === value.chainId),
    { message: "payableTokens[*].tokenUid.chainId must match chainId", path: ["payableTokens"] },
  )
  .refine(
    (value) => {
      const allowedTokens = new Set(
        value.payableTokens.map((token) => `${token.tokenUid.chainId}:${token.tokenUid.address}`),
      );
      return value.actions.every((action) => {
        if (action.type !== "swap") {
          return true;
        }
        const fromKey = `${action.fromTokenUid.chainId}:${action.fromTokenUid.address}`;
        const toKey = `${action.toTokenUid.chainId}:${action.toTokenUid.address}`;
        return allowedTokens.has(fromKey) && allowedTokens.has(toKey);
      });
    },
    {
      message: "swap from/to tokens must be within payableTokens token set",
      path: ["actions"],
    },
  );

export type EmberClmmIntent = z.infer<typeof EmberClmmIntentSchema>;
