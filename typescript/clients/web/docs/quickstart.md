# Vibekit's Web Interface Quickstart

This guide explains how to quickly set up and run the Vibekit frontend that serves as a user interface for interacting with your AI agents. The primary way to run the frontend is locally using Docker Compose.

### Prerequisites

Ensure that [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/) are installed on your system.

**Note:** If your are on an M-series Mac, you need to install Docker using the [dmg package](https://docs.docker.com/desktop/setup/install/mac-install/) supplied officially by Docker rather than through Homebrew or other means to avoid build issues.

### Running the Frontend

**1.** Clone the [Arbitrum Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit) if you haven't already:

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

**2.** Configure Environment Variables:

Navigate to the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory and create a `.env` file by copying the example template:

```bash
cd typescript &&
cp .env.example .env
```

Open the `.env` file and fill in the required values. This typically includes:

- Your preferred LLM provider API key (e.g., `OPENROUTER_API_KEY`).
- Generate a secure `AUTH_SECRET` (you can use `openssl rand -hex 32` or a similar tool).
- Set a `POSTGRES_PASSWORD`.

**3.** Start Services with Docker Compose:

From the [typescript](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript) directory, run the following command to build and start the frontend and its associated services (including the lending agent, and the database):

```bash
# Ensure you are in the typescript/ directory
docker compose up
```

**Note**: If you get a `permission denied error`, try running the above command with `sudo`:

```
sudo docker compose up

```

**4.** Access Vibekit's Web Interface:

Open your web browser and navigate to http://localhost:3000. To be able to use the web interface, you need to connect your wallet first. Click on "Connect Wallet" to get started:

<p align="left">
  <img src="../../../../img/wallet.png" width="700px" alt="wallet"/>
</p>

After setting up your wallet, you can interact with Lending agent through the chat interface:

<p align="left">
  <img src="../../../../img/frontend.png" width="700px" alt="frontend"/>
</p>
