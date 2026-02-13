# Create Pregenerated Wallet Tool

MCP tool for creating pregenerated Para wallets associated with email addresses.

## Overview

The `create-pregen-wallet` tool allows you to create Para wallets for users before they authenticate. The wallet and its user share are securely stored in a PostgreSQL database for later claiming.

## Prerequisites

1. Para Server SDK configured with API key
2. PostgreSQL database set up (see `DATABASE_SETUP.md`)
3. Environment variables configured

## Configuration

Required environment variables in `.env`:

```bash
PARA_API_KEY=your_para_api_key_here
DATABASE_URL=postgresql://user:password@localhost:5432/para_wallets
```

## Tool Specification

### Name
`create-pregen-wallet`

### Description
Create a new pregenerated Para wallet for an email address. The wallet and user share will be securely stored in the database.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Valid email address for the wallet |

### Response

#### Success Response
```json
{
  "success": true,
  "message": "Pregenerated wallet created successfully",
  "wallet": {
    "id": "uuid",
    "email": "user@example.com",
    "address": "0x...",
    "walletId": "para_wallet_id",
    "type": "EVM",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Error Response
```json
{
  "success": false,
  "error": "Error message"
}
```

## Usage Examples

### Via MCP Client

```typescript
const result = await mcpClient.callTool("create-pregen-wallet", {
  email: "user@example.com"
});

if (result.success) {
  console.log("Wallet created:", result.wallet.address);
} else {
  console.error("Error:", result.error);
}
```

### Via API (if exposed)

```bash
curl -X POST http://localhost:3012/api/tools/create-pregen-wallet \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

## How It Works

1. **Validation**: Validates the email address format
2. **Wallet Creation**: Creates an EVM wallet via Para Server SDK
3. **User Share Retrieval**: Gets the user share from Para
4. **Database Storage**: Stores wallet details and user share in PostgreSQL
5. **Response**: Returns wallet information (excluding sensitive user share)

**Note**: Multiple wallets can be created for the same email address. Each wallet is independent and has its own user share.

## Wallet Types

Currently supports:
- **EVM**: Ethereum Virtual Machine compatible wallets (Ethereum, Polygon, Arbitrum, etc.)

Future support planned for:
- SOLANA
- COSMOS

## Security Considerations

### User Share Storage

The user share is stored in the database and is **highly sensitive**:

- Required for wallet operations until claimed
- Should be encrypted at rest
- Access should be strictly controlled
- Never expose in API responses
- Backup securely

### Email Validation

- Email format is validated
- Duplicate emails are prevented
- Consider email verification before wallet creation in production

### Database Security

- Use encrypted connections (SSL/TLS)
- Enable database encryption at rest
- Implement proper access controls
- Audit database access
- Regular security updates

## Integration with Claiming

After creating a pregenerated wallet:

1. User receives notification (email, etc.)
2. User visits the claim page
3. User authenticates with Para
4. User share is retrieved from database
5. User claims wallet via `/claim-pregen-wallet` route
6. `claimed_at` timestamp is updated in database

## Error Handling

The tool handles various error scenarios:

- **Invalid email format**: Returns validation error
- **Para API errors**: Returns Para error message
- **Database errors**: Returns database error message
- **Missing configuration**: Returns configuration error

## Monitoring and Logging

Consider implementing:

- Wallet creation metrics
- Error rate monitoring
- Database query performance
- Para API response times
- Failed creation attempts

## Best Practices

1. **Validate emails** before creating wallets
2. **Rate limit** wallet creation to prevent abuse
3. **Monitor** for suspicious patterns
4. **Backup** database regularly
5. **Test** in staging environment first
6. **Document** wallet creation flows
7. **Audit** wallet access and usage

## Troubleshooting

### "PARA_API_KEY environment variable is required"
- Ensure `.env` file exists
- Verify `PARA_API_KEY` is set
- Check environment variable loading

### "DATABASE_URL environment variable is required"
- Ensure `.env` file exists
- Verify `DATABASE_URL` is set
- Check database connection string format

### Multiple wallets per email
- Multiple wallets can be created for the same email
- Each wallet is independent with its own user share
- Users can claim any wallet associated with their email

### Database connection errors
- Verify PostgreSQL is running
- Check connection string
- Verify database exists
- Check network/firewall settings

## Related Documentation

- [Database Setup Guide](./DATABASE_SETUP.md)
- [Claim Pregenerated Wallet](./src/app/claim-pregen-wallet/README.md)
- [Para Server SDK Documentation](https://docs.getpara.com/v2/server/guides/pregen)
