# Database Setup Guide

This guide covers setting up the PostgreSQL database for storing pregenerated Para wallets.

## Prerequisites

- PostgreSQL 12 or higher installed
- Database connection credentials

## Environment Configuration

Add the following to your `.env` file:

```bash
DATABASE_URL=postgresql://username:password@host:port/database
```

Example for local development:
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/para_wallets
```

## Database Setup

### 1. Create Database

Create a new PostgreSQL database:

```bash
createdb para_wallets
```

Or using psql:
```sql
CREATE DATABASE para_wallets;
```

### 2. Run Migrations

Generate and apply the database schema:

```bash
# Generate migration files (already done)
pnpm db:generate

# Apply migrations to database
pnpm db:migrate
```

Or push schema directly (for development):
```bash
pnpm db:push
```

### 3. Verify Setup

Check that the table was created:

```sql
\c para_wallets
\dt
```

You should see the `pregen_wallets` table.

## Database Schema

### pregen_wallets Table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (auto-generated) |
| email | text | User email (multiple wallets allowed) |
| wallet_id | text | Para wallet ID |
| wallet_address | text | Blockchain wallet address |
| wallet_type | text | Wallet type (e.g., "EVM") |
| user_share | text | Encrypted user share (sensitive!) |
| created_at | timestamp | Wallet creation timestamp |
| claimed_at | timestamp | Wallet claim timestamp (nullable) |

## Database Scripts

Available npm scripts for database management:

- `pnpm db:generate` - Generate migration files from schema
- `pnpm db:migrate` - Apply migrations to database
- `pnpm db:push` - Push schema directly (dev only)
- `pnpm db:studio` - Open Drizzle Studio (visual database browser)

## Security Considerations

### User Share Storage

The `user_share` column contains sensitive cryptographic material. Ensure:

1. **Database encryption at rest** is enabled
2. **SSL/TLS connections** are used for database access
3. **Access controls** limit who can read this table
4. **Backups are encrypted** and stored securely
5. **Audit logging** is enabled for access to this table

### Production Recommendations

For production environments:

1. Use a managed PostgreSQL service (AWS RDS, Google Cloud SQL, etc.)
2. Enable automatic backups with encryption
3. Use connection pooling (e.g., PgBouncer)
4. Implement row-level security if needed
5. Consider encrypting the `user_share` column at the application level
6. Use read replicas for scaling read operations
7. Monitor database performance and set up alerts

## Drizzle Studio

To visually browse and manage your database:

```bash
pnpm db:studio
```

This opens a web interface at `https://local.drizzle.studio`

## Troubleshooting

### Connection Issues

If you can't connect to the database:

1. Check that PostgreSQL is running
2. Verify connection string format
3. Ensure database exists
4. Check firewall/network settings
5. Verify user permissions

### Migration Issues

If migrations fail:

1. Check database connection
2. Verify user has CREATE TABLE permissions
3. Look for conflicting table names
4. Check migration logs for specific errors

### Reset Database (Development Only)

To start fresh:

```bash
# Drop and recreate database
dropdb para_wallets
createdb para_wallets

# Rerun migrations
pnpm db:push
```

## Example Queries

### Check all wallets
```sql
SELECT email, wallet_address, created_at, claimed_at
FROM pregen_wallets
ORDER BY created_at DESC;
```

### Find unclaimed wallets
```sql
SELECT email, wallet_address, created_at
FROM pregen_wallets
WHERE claimed_at IS NULL;
```

### Count wallets by status
```sql
SELECT
  COUNT(*) FILTER (WHERE claimed_at IS NULL) as unclaimed,
  COUNT(*) FILTER (WHERE claimed_at IS NOT NULL) as claimed,
  COUNT(*) as total
FROM pregen_wallets;
```

### Find all wallets for an email
```sql
SELECT wallet_address, wallet_id, created_at, claimed_at
FROM pregen_wallets
WHERE email = 'user@example.com'
ORDER BY created_at DESC;
```

### Count wallets per email
```sql
SELECT email, COUNT(*) as wallet_count
FROM pregen_wallets
GROUP BY email
ORDER BY wallet_count DESC;
```
