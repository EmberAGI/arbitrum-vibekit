# Quick Start: Vibekit Web Frontend

This guide explains how to quickly set up and run the Vibekit Web Frontend that serves as a user interface for interacting with your Arbitrum Vibekit on-chain AI agents. The primary way to run the Vibekit Web Frontend is locally using Docker Compose.

### Prerequisites:

Ensure that [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/) are installed on your system.

### Running the Frontend Locally:

1. Clone the [Arbitrum Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit) if you haven't already:

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit
```

2. Configure Environment Variables:

Navigate to the `typescript` directory and create a `.env` file by copying the example template:

    ```bash
    cd typescript &&
    cp .env.example .env
    ```

Open the `.env` file and fill in the required values. This typically includes:

- Your preferred LLM provider API key (e.g., `OPENROUTER_API_KEY`).
- Generate a secure `AUTH_SECRET` (you can use `openssl rand -hex 32` or a similar tool).
- Set a `POSTGRES_PASSWORD`.

3. Start Services with Docker Compose:
   From the `typescript` directory, run the following command to build and start the frontend and its associated services:

   ```bash
   docker compose up -d
   ```

   This command runs the services in detached mode (in the background).

   **Note**: If you get a `permission denied error`, try running the above command with `sudo`:

   ```
   sudo  docker compose up -d
   ```

4. Access the Vibekit Web Frontend:
   Open your web browser and navigate to http://localhost:3000.
   You can now interact with your on-chain AI agents through the web interface.
