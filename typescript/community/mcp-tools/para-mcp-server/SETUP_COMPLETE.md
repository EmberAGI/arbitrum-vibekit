# Para MCP Server - Setup Complete

## Overview

The Para MCP Server now includes complete functionality for creating and claiming pregenerated Para wallets with PostgreSQL database storage.

## What Was Created

### 1. Create Pregenerated Wallet Tool (`create-pregen-wallet`)

**Location**: `src/tools/create-pregen-wallet.ts`

An MCP tool that creates EVM wallets for email addresses using Para's Server SDK.

**Features**:
- Email validation
- Multiple wallets per email supported
- Secure user share storage in PostgreSQL
- Comprehensive error handling

### 2. Claim Pregenerated Wallet Route

**Location**: `src/app/claim-pregen-wallet/`

A Next.js route with UI for users to claim their pregenerated w.

**Components**:
- `page.tsx` - Client-side claiming interface
- `api/route.ts` - Server-side claiming logic
- `README.md` - Detailed documentation

### 3. Database Infrastructure

**Schema**: `src/db/schema.ts`
- `pregen_wallets` table with email, wallet details, and encrypted user shares

**Connection**: `src/db/index.ts`
- Drizzle ORM configuration with PostgreSQL

**Migrations**: `drizzle/`
- Initial migration for pregen_wallets table

### 4. Para SDK Clients

**Web Client**: `src/lib/para-client.ts`
- For client-side operations (claiming)

**Server Client**: `src/lib/para-server-client.ts`
- For server-side operations (wallet creation)

### 5. Documentation

- `DATABASE_SETUP.md` - PostgreSQL setup guide
- `CREATE_PREGEN_WALLET_TOOL.md` - Tool documentation
- `CLAIM_PREGEN_WALLET.md` - Claiming feature docs
- `.env.example` - Environment variable template

## Environment Configuration

Required variables in `.env`:

```bash
# Para SDK Configuration
PARA_API_KEY=your_para_api_key_here
PARA_ENVIRONMENT=BETA  # or PROD

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/para_wallets
```

## Setup Steps

### 1. Install Dependencies

```bash
pnpm install
```

Dependencies added:
- `@getpara/server-sdk` - Para server operations
- `@getpara/web-sdk` - Para client operations
- `drizzle-orm` - Database ORM
- `postgres` - PostgreSQL client
- `drizzle-kit` - Database migrations

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Setup Database

```bash
# Create database
createdb para_wallets

# Run migrations
pnpm db:push
```

### 4. Start Development Server

```bash
pnpm dev
```

## Usage

### Creating a Pregenerated Wallet

Via MCP tool:
```typescript
const result = await mcpClient.callTool("create-pregen-wallet", {
  email: "user@example.com"
});
```

### Claiming a Wallet

1. User visits: `http://localhost:3012/claim-pregen-wallet`
2. User authenticates with Para
3. User pastes their user share
4. User clicks "Claim Wallet"
5. Receives recovery secret

## Database Schema

### pregen_wallets Table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| email | text | User email (multiple allowed) |
| wallet_id | text | Para wallet ID |
| wallet_address | text | Blockchain address |
| wallet_type | text | Wallet type (EVM) |
| user_share | text | Encrypted user share |
| created_at | timestamp | Creation time |
| claimed_at | timestamp | Claim time (nullable) |

## Available Scripts

### Development
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server

### Code Quality
- `pnpm lint` - Check code quality
- `pnpm format` - Format code

### Database
- `pnpm db:generate` - Generate migrations
- `pnpm db:migrate` - Apply migrations
- `pnpm db:push` - Push schema (dev)
- `pnpm db:studio` - Open Drizzle Studio

## Security Considerations

### Critical: User Share Protection

The `user_share` column contains sensitive cryptographic material:

1. **Database Security**
   - Enable encryption at rest
   - Use SSL/TLS connections
   - Implement access controls
   - Enable audit logging

2. **Application Security**
   - Never expose user shares in API responses
   - Consider additional encryption layer
   - Implement rate limiting
   - Monitor for suspicious activity

3. **Backup Security**
   - Encrypt all backups
   - Secure backup storage
   - Test recovery procedures
   - Document backup policies

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Para MCP Server                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │  MCP Tool        │         │  Web Route       │          │
│  │  create-pregen-  │         │  /claim-pregen-  │          │
│  │  wallet          │         │  wallet          │          │
│  └────────┬─────────┘         └────────┬─────────┘          │
│           │                            │                     │
│           │                            │                     │
│  ┌────────▼─────────┐         ┌───────▼──────────┐          │
│  │  Para Server SDK │         │  Para Web SDK    │          │
│  │  (create wallet) │         │  (claim wallet)  │          │
│  └────────┬─────────┘         └───────┬──────────┘          │
│           │                            │                     │
│           └────────────┬───────────────┘                     │
│                        │                                     │
│                 ┌──────▼───────┐                             │
│                 │  PostgreSQL  │                             │
│                 │  Database    │                             │
│                 │  (Drizzle)   │                             │
│                 └──────────────┘                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Workflow

### Wallet Creation Flow

1. MCP tool receives email
2. Check for existing wallet
3. Create wallet via Para Server SDK
4. Retrieve user share
5. Store in PostgreSQL
6. Return wallet details

### Wallet Claiming Flow

1. User authenticates with Para
2. User provides user share
3. Load user share into Para client
4. Call `claimPregenWallets()`
5. Update `claimed_at` in database
6. Return recovery secret

## Testing

### Manual Testing

1. **Create Wallet**
   ```bash
   # Via MCP tool
   create-pregen-wallet email="test@example.com"
   ```

2. **Verify Database**
   ```bash
   pnpm db:studio
   # Check pregen_wallets table
   ```

3. **Claim Wallet**
   - Visit `/claim-pregen-wallet`
   - Authenticate
   - Paste user share
   - Claim wallet

### Database Queries

```sql
-- Check all wallets
SELECT email, wallet_address, created_at, claimed_at
FROM pregen_wallets;

-- Find unclaimed wallets
SELECT * FROM pregen_wallets WHERE claimed_at IS NULL;

-- Count by status
SELECT
  COUNT(*) FILTER (WHERE claimed_at IS NULL) as unclaimed,
  COUNT(*) FILTER (WHERE claimed_at IS NOT NULL) as claimed
FROM pregen_wallets;
```

## Troubleshooting

### Common Issues

1. **"PARA_API_KEY environment variable is required"**
   - Check `.env` file exists
   - Verify PARA_API_KEY is set
   - Restart development server

2. **"DATABASE_URL environment variable is required"**
   - Check `.env` file exists
   - Verify DATABASE_URL is set
   - Test database connection

3. **Database connection errors**
   - Verify PostgreSQL is running
   - Check connection string format
   - Verify database exists
   - Check firewall settings

4. **"A wallet already exists for this email"**
   - This is expected (duplicate prevention)
   - Check existing wallet in database
   - Use different email or claim existing wallet

## Next Steps

### Recommended Enhancements

1. **Email Notifications**
   - Send email when wallet is created
   - Include claiming instructions
   - Add recovery information

2. **Wallet Management UI**
   - List all wallets
   - View wallet details
   - Resend user shares
   - Track claiming status

3. **Additional Wallet Types**
   - Add Solana support
   - Add Cosmos support
   - Multi-chain wallets

4. **Security Enhancements**
   - Add rate limiting
   - Implement 2FA for claiming
   - Add audit logging
   - Encrypt user shares at app level

5. **Monitoring**
   - Track wallet creation metrics
   - Monitor claiming success rate
   - Alert on errors
   - Database performance monitoring

## Resources

- [Para Documentation](https://docs.getpara.com)
- [Para Server SDK](https://docs.getpara.com/v2/server/guides/pregen)
- [Drizzle ORM](https://orm.drizzle.team)
- [Next.js Documentation](https://nextjs.org/docs)

## Support

For issues or questions:
1. Check documentation files
2. Review Para SDK docs
3. Check database logs
4. Review application logs

