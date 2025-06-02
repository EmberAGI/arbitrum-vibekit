ALTER TABLE "User" ADD COLUMN "address" varchar(42) NOT NULL;--> statement-breakpoint
ALTER TABLE "User" DROP COLUMN IF EXISTS "email";--> statement-breakpoint
ALTER TABLE "User" DROP COLUMN IF EXISTS "password";--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_address_unique" UNIQUE("address");