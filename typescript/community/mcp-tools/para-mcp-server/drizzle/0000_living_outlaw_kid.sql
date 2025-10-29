CREATE TABLE IF NOT EXISTS "pregen_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"wallet_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"wallet_type" text NOT NULL,
	"user_share" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	CONSTRAINT "pregen_wallets_email_unique" UNIQUE("email")
);
