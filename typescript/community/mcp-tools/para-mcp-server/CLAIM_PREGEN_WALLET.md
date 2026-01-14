# Claim Pregenerated Wallet Feature

## Overview

A new route has been created at `/claim-pregen-wallet` that allows users to claim ownership of pregenerated Para wallets using the stable Para Web SDK (`@getpara/web-sdk`).

## Files Created

1. **`src/app/claim-pregen-wallet/page.tsx`** - Client-side UI for wallet claiming
2. **`src/app/claim-pregen-wallet/api/route.ts`** - API endpoint that handles the claiming logic
3. **`src/lib/para-client.ts`** - Centralized Para client configuration
4. **`src/app/claim-pregen-wallet/README.md`** - Detailed documentation for the feature
5. **`.env.example`** - Environment variable template

## Setup

### 1. Install Dependencies

The Para Web SDK has been added to the project:

```bash
pnpm add @getpara/web-sdk
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and set your Para credentials:

```bash
PARA_API_KEY=your_para_api_key_here
PARA_ENVIRONMENT=BETA  # or PROD for production
```

Get your API key from: https://developer.getpara.com

### 3. Run the Application

```bash
pnpm dev
```

Visit http://localhost:3012/claim-pregen-wallet to access the claiming interface.

## How It Works

### Claiming Process

1. **User Authentication**: User must be fully authenticated with Para
2. **Load User Share**: The user share (from wallet pregeneration) is loaded via `setUserShare()`
3. **Claim Wallet**: The `claimPregenWallets()` method transfers ownership to the user
4. **Recovery Secret**: A recovery secret is returned for secure storage

### API Endpoint

**POST** `/claim-pregen-wallet/api`

Request:
```json
{
  "userShare": "base64_encoded_user_share_string"
}
```

Response:
```json
{
  "success": true,
  "recoverySecret": "recovery_secret_string",
  "message": "Wallet claimed successfully"
}
```

## Key Features

- ✅ Uses stable Para Web SDK (not alpha)
- ✅ Client-side UI with loading states and error handling
- ✅ Server-side API route for secure claiming
- ✅ Centralized Para client configuration
- ✅ Environment-based configuration (BETA/PROD)
- ✅ TypeScript type safety
- ✅ Responsive design with dark mode support

## Documentation

For more information about Para's wallet pregeneration:

- [Para Web SDK Documentation](https://docs.getpara.com/v2/web/guides/pregen)
- [Claiming Pregenerated Wallets](https://docs.getpara.com/v2/react/guides/pregen)
- [Wallet Pregeneration Overview](https://docs.getpara.com/v2/general/pregen)

## Security Considerations

1. User shares should be transmitted securely over HTTPS
2. Recovery secrets must be stored securely by users
3. Authentication is verified before allowing claims
4. Never log or store user shares in plain text
