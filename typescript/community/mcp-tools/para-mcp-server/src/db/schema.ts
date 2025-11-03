import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const pregenWallets = pgTable("pregen_wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  walletId: text("wallet_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  walletType: text("wallet_type").notNull(),
  userShare: text("user_share").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  claimedAt: timestamp("claimed_at"),
});
