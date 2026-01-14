# Claim Pregenerated Wallet Route

This route allows users to claim ownership of pregenerated Para wallets using the stable Para Web SDK.

## Overview

Wallet pregeneration allows you to create wallets for users before they authenticate. Users can later claim these wallets by:

1. Authenticating with Para
2. Loading their user share
3. Claiming the wallet

## How It Works

### Prerequisites

- User must be fully authenticated with Para
- User must have the user share from the pregenerated wallet
- The wallet's identifier must match the authenticated user's identifier

### Claiming Process

1. **User Authentication**: The user must first authenticate with Para using their preferred method (email, phone, social login, etc.)

2. **Load User Share**: The user share (obtained when the wallet was pregenerated) is loaded into the Para client using `setUserShare()`

3. **Claim Wallet**: The `claimPregenWallets()` method transfers ownership of the wallet to the user's Para account

4. **Recovery Secret**: After successful claiming, a recovery secret is returned that should be stored securely

## API Endpoint

### POST `/claim-pregen-wallet/api`

Claims a pregenerated wallet for the authenticated user.

**Request Body:**
```json
{
  "userShare": "base64_encoded_user_share_string"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "recoverySecret": "recovery_secret_string",
  "message": "Wallet claimed successfully"
}
```

**Error Responses:**
- `400`: Missing user share
- `401`: User not authenticated
- `500`: Server error during claiming

## Configuration

Set the following environment variables in your `.env` file:

```bash
PARA_API_KEY=your_para_api_key_here
PARA_ENVIRONMENT=BETA  # or PROD for production
```

Get your API key from the [Para Developer Portal](https://developer.getpara.com).

## Usage Example

### Client-Side

```typescript
const response = await fetch('/claim-pregen-wallet/api', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userShare: 'your_user_share_here'
  }),
});

const data = await response.json();

if (data.success) {
  console.log('Wallet claimed!');
  console.log('Recovery secret:', data.recoverySecret);
  // Store recovery secret securely
}
```

## Security Considerations

1. **User Share Storage**: The user share should be transmitted securely and never logged or stored in plain text
2. **Recovery Secret**: The recovery secret returned after claiming should be stored securely by the user
3. **Authentication**: Always verify the user is fully authenticated before allowing wallet claiming
4. **HTTPS**: This endpoint should only be accessible over HTTPS in production

## Documentation

For more information about Para's wallet pregeneration feature, see:

- [Para Web SDK Documentation](https://docs.getpara.com/v2/web/guides/pregen)
- [Claiming Pregenerated Wallets](https://docs.getpara.com/v2/react/guides/pregen)
- [Wallet Pregeneration Overview](https://docs.getpara.com/v2/general/pregen)

## Implementation Details

This implementation uses the **stable Para Web SDK** (`@getpara/web-sdk`), not the alpha version.

Key methods used:
- `para.isFullyLoggedIn()`: Checks if user is authenticated
- `para.setUserShare(userShare)`: Loads the user share into the client
- `para.claimPregenWallets()`: Claims the wallet and returns recovery secret
