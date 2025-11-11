# EmberAi A2A Client

Modern chat interface for Agent-to-Agent (A2A) communication with Node.js backend.

## Architecture

```
Frontend (Next.js) → Backend (Node.js/Socket.IO) → A2A Agent
     :3000              :5001                    dev.emberai.xyz
```

The backend handles A2A protocol communication (JSONRPC over HTTP) and exposes Socket.IO for the frontend.

## Quick Start

### 1. Start Backend Server

```bash
cd server
npm install
npm start
```

The backend will run on `http://localhost:5001`

### 2. Start Frontend

In a new terminal:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Connect & Chat

1. The EmberAi agent URL is pre-configured: `https://dev.emberai.xyz`
2. Click "Connect"
3. Start chatting!

## How It Works

1. **Frontend** fetches agent card from `https://dev.emberai.xyz/.well-known/agent-card.json`
2. **Frontend** connects to **Backend** via Socket.IO (`localhost:5001`)
3. **Backend** sends JSONRPC requests to `https://dev.emberai.xyz/a2a`
4. **Backend** forwards responses back to **Frontend**

This architecture matches the a2a-inspector pattern where:

- Backend handles A2A protocol (JSONRPC over HTTP)
- Frontend provides the UI
- Socket.IO enables real-time communication

## Features

- **A2A Protocol**: Full JSONRPC support via backend
- **Real-time Chat**: Socket.IO-based messaging
- **Settings Panel**: Configure HTTP headers and metadata
- **Debug Console**: View all requests/responses
- **EmberAi Styling**: Dark theme with orange accent

## Development

**Backend:**

```bash
cd server
npm run dev  # Auto-restart on changes
```

**Frontend:**

```bash
npm run dev  # Next.js dev server
```

## Project Structure

```
ember/
├── server/          # Node.js backend
│   ├── server.js    # Socket.IO + A2A client
│   └── package.json
├── src/             # Next.js frontend
│   ├── app/
│   ├── components/
│   └── lib/
└── README.md
```

## Why a Backend?

The A2A protocol uses JSONRPC over HTTP, which requires proper request/response handling. The backend:

- Manages JSONRPC message formatting
- Handles context/session management
- Proxies requests to the A2A agent
- Provides debug logging

This mirrors the a2a-inspector architecture where Python handles the protocol.

## License

Part of the EmberAi ecosystem.
