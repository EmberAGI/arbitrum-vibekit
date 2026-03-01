## para-mcp-server – How to Run

This folder contains the **Para MCP server + Next.js demo UI**.

---

## 1. Prerequisites

- **Node.js** 20 or higher
- **pnpm** as the package manager (this repo uses a pnpm workspace)
- **PostgreSQL** (optional, required only if you use pregenerated wallets – see `DATABASE_SETUP.md`)

---

## 2. Install Dependencies

From the **repository root** (where `pnpm-workspace.yaml` lives):

```bash
pnpm install
```

This installs all workspace dependencies, including those for `para-mcp-server`.

---

## 3. Configure Environment Variables

From this directory (`typescript/community/mcp-tools/para-mcp-server`):

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in the required values from the comments in `.env.example`:

   - **Para SDK**
     - `PARA_API_KEY`
     - `NEXT_PUBLIC_PARA_API_KEY`
     - `NEXT_PUBLIC_PARA_ENVIRONMENT` (e.g. `BETA` or `PROD`)

   - **WalletConnect**
     - `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`

   - **Coinbase Developer Platform (CDP)** – for faucet and paymaster support
     - `CDP_API_KEY_ID`
     - `CDP_API_KEY_SECRET`
     - `NEXT_PUBLIC_PAYMASTER_URL` (optional for sponsored gas)

   - **RPC URLs (optional but recommended)**
     - `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL`

3. (Optional, for pregenerated wallets) Configure the database URL as described in `DATABASE_SETUP.md`:

   ```bash
   DATABASE_URL=postgresql://username:password@host:port/database
   ```

   Then follow `DATABASE_SETUP.md` to create the database and run migrations if you need that functionality.

---

## 4. Run in Development

From this directory:

```bash
pnpm dev
```

This runs:

- `xmcp dev` – starts the MCP HTTP server based on `xmcp.config.ts`
- `next dev -p 3012` – starts the Next.js app on **http://localhost:3012**

Open your browser at:

- **Next.js UI:** http://localhost:3012

Use the xmcp documentation for details on connecting your MCP client to the running server.

---

## 5. Build and Run in Production Mode

From this directory:

1. Build the project:

   ```bash
   pnpm build
   ```

   This runs `xmcp build` and then `next build`.

2. Start the production server:

   ```bash
   pnpm start
   ```

The Next.js app will run on **http://localhost:3012** in production mode. Ensure your `.env` file contains the correct production API keys and URLs before deploying or running in production.

