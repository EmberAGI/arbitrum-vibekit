# Vibekit's Web Interface Quickstart

This guide explains how to quickly set up and run the Vibekit frontend that serves as a user interface for interacting with your AI agents. The primary way to run the frontend is locally using Docker Compose.

### Prerequisites

1. [Docker](https://docs.docker.com/engine/install/)
2. [Docker Compose](https://docs.docker.com/compose/install/)

**Note:** If your are on an M-series Mac, you need to install Docker using the [dmg package](https://docs.docker.com/desktop/setup/install/mac-install/) supplied officially by Docker rather than through Homebrew or other means to avoid build issues.

### Running the Frontend

**1. Clone the [Arbitrum Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit) if you haven't already:**

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

**2. Configure environment variables:**

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and create a `.env` file by copying the example template:

```bash
cd typescript &&
cp .env.example .env
```

Open the `.env` file and fill in the required values. This typically includes:

- Your preferred LLM provider API key (e.g., `OPENROUTER_API_KEY`).
- Generate a secure `AUTH_SECRET` (you can use https://generate-secret.vercel.app/32 or `openssl rand -base64 32`).
- Set a `POSTGRES_PASSWORD`.

**3. Start services with Docker Compose:**

From the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory, run the following command to build and start the frontend and its associated services (including the lending agent, and the database):

```bash
# Ensure you are in the typescript/ directory
docker compose up
```

**Note**: If you get a `permission denied error`, try running the above command with `sudo`:

```
sudo  docker compose up
```

**4. Access Vibekit's web interface:**

Open your web browser and navigate to http://localhost:3000. To be able to use the web interface, you need to connect your wallet first. Click on "Connect Wallet" to get started:

<p align="left">
  <img src="../../../../img/wallet.png" width="700px" alt="wallet"/>
</p>

After setting up your wallet, you can interact with the lending agent through the chat interface:

<p align="left">
  <img src="../../../../img/frontend.png" width="700px" alt="frontend"/>
</p>

#### Integrating a Custom Agent

To integrate another example agent or a custom agent into the frontend, refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/README.md#agent-configuration).
