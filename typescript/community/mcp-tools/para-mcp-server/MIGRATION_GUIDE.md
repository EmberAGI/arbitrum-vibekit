# Migration Guide: Multiple Wallets Per Email

## Overview

The system has been updated to allow multiple pregenerated wallets for the same email address. This provides more flexibility for users who may need multiple wallets for different purposes.

## What Changed

### Database Schema
- **Removed**: `UNIQUE` constraint on the `email` column
- **Impact**: Multiple wallets can now be created for the same email address

### Tool Behavior
- **Removed**: Duplicate email check
- **New**: Each call to `create-pregen-wallet` creates a new wallet, even for existing emails

### Migration Files
- `drizzle/0000_living_outlaw_kid.sql` - Initial schema with unique constraint
- `drizzle/0001_daffy_talos.sql` - Removes unique constraint

## Migration Steps

### For New Installations

No special steps needed. Just run:

```bash
pnpm db:push
```

This will create the schema without the unique constraint.

### For Existing Installations

If you already have the database set up with the unique constraint:

#### Option 1: Using Drizzle Migrations (Recommended)

```bash
# Apply the migration
pnpm db:migrate
```

This will execute the migration that removes the unique constraint.

#### Option 2: Manual SQL

Connect to your database and run:

```sql
ALTER TABLE "pregen_wallets" DROP CONSTRAINT "pregen_wallets_email_unique";
```

#### Option 3: Fresh Start (Development Only)

```bash
# Drop and recreate database
dropdb para_wallets
createdb para_wallets

# Apply schema
pnpm db:push
```

**Warning**: This will delete all existing data!

## Verification

After migration, verify the constraint is removed:

```sql
-- Check table constraints
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'pregen_wallets'::regclass;
```

You should NOT see `pregen_wallets_email_unique` in the results.

## Testing

Test that multiple wallets can be created:

```bash
# Create first wallet
create-pregen-wallet email="test@example.com"

# Create second wallet (should succeed now)
create-pregen-wallet email="test@example.com"

# Verify both exist
```

Query the database:

```sql
SELECT email, wallet_address, created_at
FROM pregen_wallets
WHERE email = 'test@example.com';
```

You should see multiple rows.

## Use Cases

### Multiple Wallets Per User

Users can now have:
- Separate wallets for different purposes (personal, business, etc.)
- Backup wallets
- Test wallets
- Wallets for different blockchain networks

### Bulk Wallet Creation

You can now create multiple wallets for the same email in bulk operations without errors.

## Important Notes

### Claiming Behavior

When a user claims wallets:
- They can claim ALL wallets associated with their email
- Each wallet maintains its own user share
- The claiming process handles multiple wallets automatically

### User Share Management

- Each wallet has its own unique user share
- User shares are stored separately in the database
- Losing a user share means losing access to that specific wallet

### Database Queries

Update your queries to handle multiple wallets:

```sql
-- Get all wallets for an email
SELECT * FROM pregen_wallets WHERE email = 'user@example.com';

-- Get latest wallet for an email
SELECT * FROM pregen_wallets
WHERE email = 'user@example.com'
ORDER BY created_at DESC
LIMIT 1;

-- Count wallets per email
SELECT email, COUNT(*) as wallet_count
FROM pregen_wallets
GROUP BY email;
```

## Rollback

If you need to rollback to the unique constraint:

### Step 1: Remove Duplicate Emails

First, ensure only one wallet per email exists:

```sql
-- Keep only the most recent wallet per email
DELETE FROM pregen_wallets
WHERE id NOT IN (
  SELECT DISTINCT ON (email) id
  FROM pregen_wallets
  ORDER BY email, created_at DESC
);
```

### Step 2: Add Unique Constraint

```sql
ALTER TABLE "pregen_wallets"
ADD CONSTRAINT "pregen_wallets_email_unique" UNIQUE("email");
```

### Step 3: Update Code

Revert the code changes to add back the duplicate check in `create-pregen-wallet.ts`.

## Support

If you encounter issues during migration:

1. Check database logs for errors
2. Verify PostgreSQL version compatibility
3. Ensure you have proper permissions
4. Review the migration SQL files
5. Test in a development environment first

## FAQ

**Q: What happens to existing wallets?**
A: All existing wallets remain unchanged. The migration only removes the constraint.

**Q: Can I still have one wallet per email?**
A: Yes, the system supports both single and multiple wallets per email.

**Q: How do I prevent duplicate wallets?**
A: Implement application-level logic to check for existing wallets before creating new ones.

**Q: Will this affect claiming?**
A: No, the claiming process works the same way. Users can claim all their wallets.

**Q: Is this change backward compatible?**
A: Yes, existing functionality continues to work. This only adds new capability.
