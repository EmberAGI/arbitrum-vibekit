# VPS Deployment Guide with HTTPS

## Prerequisites

- VPS with Ubuntu 24.04 or compatible Linux distribution
- SSH access to the server (root or sudo user)
- Domain name pointing to your VPS IP address
- Local development environment with:
  - pnpm installed
  - rsync available
  - SSH client

## Server Setup

### 1. Install Docker and Docker Compose

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Update system packages
apt update && apt upgrade -y

# Install Docker using the official script
curl -fsSL https://get.docker.com | sh

# Verify installation
docker --version
docker compose version
```

### 2. Configure Firewall

```bash
# Open required ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS

# Enable firewall
ufw --force enable

# Verify status
ufw status
```

## Deployment Steps

### 1. Initialize Configuration (Local Machine)

Before deploying, you must initialize and validate your agent configuration:

```bash
# Navigate to agent-node directory
cd /path/to/agent-node

# Initialize config workspace (creates ./config directory)
pnpm cli init

# Customize your agent configuration
# Edit config/agent.md - Define agent personality and capabilities
# Edit config/skills/ - Add or modify skill modules
# Edit config/mcp.json - Configure MCP servers
# Edit config/workflow.json - Register workflow plugins

# Validate configuration
pnpm cli doctor

# Verify configuration
pnpm cli print-config
```

**Important:** The `config/` directory is required for the agent to start. Docker Compose mounts this directory as a volume (`./config:/app/config:ro`), so changes to workflows and skills don't require rebuilding the Docker image.

### 2. Prepare Server Directory

```bash
# On server: Create project directory
ssh root@YOUR_SERVER_IP "mkdir -p /opt/no-context"
```

### 3. Transfer Project Files

```bash
# From local machine: Copy project files using rsync
rsync -avz --exclude-from=.dockerignore \
  /path/to/no-context/ \
  root@YOUR_SERVER_IP:/opt/no-context/

# Copy config directory (REQUIRED - agent won't start without this)
rsync -avz config/ root@YOUR_SERVER_IP:/opt/no-context/config/

# Copy .env file separately
scp .env root@YOUR_SERVER_IP:/opt/no-context/.env

# Copy Docker configuration files
scp docker-compose*.yaml Dockerfile* Caddyfile root@YOUR_SERVER_IP:/opt/no-context/
```

**Note:** The `config/` directory transfer is critical. The Docker containers mount this directory as a volume, and the agent will fail to start if it's missing.

### 4. Verify Domain Configuration

```bash
# Ensure your domain's A record points to your server IP
# Caddyfile is already configured for dev.emberai.xyz
# Update if using a different domain:
ssh root@YOUR_SERVER_IP "cat /opt/no-context/Caddyfile"
```

### 5. Build and Deploy

```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Navigate to project directory
cd /opt/no-context

# Build the Docker image
docker compose -f docker-compose.prod.yaml build

# Start services in detached mode
docker compose -f docker-compose.prod.yaml up -d

# View logs to ensure everything started correctly
docker compose -f docker-compose.prod.yaml logs -f
```

## What Happens During Deployment

1. **Docker Build**: Creates a Node.js Alpine image with your application
2. **Caddy Setup**: Automatically requests SSL certificates from Let's Encrypt
3. **HTTPS Configuration**: Enables HTTPS immediately (cert provisioning takes 30-60 seconds)
4. **Traffic Routing**: HTTP traffic is automatically redirected to HTTPS
5. **Security**: Headers are added to all responses for enhanced security
6. **Performance**: Gzip compression is enabled automatically

## Verify Deployment

### Check Services Status

```bash
docker compose -f docker-compose.prod.yaml ps
```

### Verify SSL Certificate

```bash
# Check certificate details
echo | openssl s_client -connect YOUR_DOMAIN:443 -servername YOUR_DOMAIN 2>/dev/null | openssl x509 -noout -text | grep -A 2 "Subject:"
```

### Test Endpoints

- Visit `https://YOUR_DOMAIN` - API server (may return 404 for root, which is expected)
- Visit `http://YOUR_DOMAIN` - Should redirect to HTTPS
- Check the padlock icon in your browser to verify SSL

### View Application Logs

```bash
# App logs
docker compose -f docker-compose.prod.yaml logs app --tail=50

# Caddy logs (SSL certificate status)
docker compose -f docker-compose.prod.yaml logs caddy --tail=50
```

## Troubleshooting

### TypeScript Build Errors

If you encounter TypeScript compilation errors during build:

1. Use the simplified Dockerfile that runs TypeScript directly:

```bash
# Create Dockerfile.simple (already included in project)
# This uses tsx to run TypeScript without compilation
```

2. Update docker-compose.prod.yaml to use Dockerfile.simple:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.simple
```

3. Rebuild and deploy:

```bash
docker compose -f docker-compose.prod.yaml build
docker compose -f docker-compose.prod.yaml up -d
```

### Certificate Issues

- Ensure domain DNS is properly configured (A record pointing to VPS IP)
- Check Caddy logs: `docker compose -f docker-compose.prod.yaml logs caddy`
- Verify ports 80 and 443 are accessible through firewall

### App Not Responding

- Check app logs: `docker compose -f docker-compose.prod.yaml logs app`
- Verify .env file is properly configured and present
- Ensure all required environment variables are set

### Missing Config Directory

If you see error: `"Config workspace not found at ./config"`:

**Cause:** The agent requires a config workspace, which is mounted as a volume from the host.

**Solution:**

1. **Verify config exists on server:**

```bash
ssh root@YOUR_SERVER_IP "ls -la /opt/no-context/config"
```

Expected directory structure:

```
config/
├── agent.md
├── agent.manifest.json
├── mcp.json
├── workflow.json
├── skills/
└── workflows/
```

2. **If missing, initialize and transfer:**

```bash
# On local machine: Initialize config
cd /path/to/agent-node
pnpm cli init
pnpm cli doctor  # Validate

# Transfer to server
rsync -avz config/ root@YOUR_SERVER_IP:/opt/no-context/config/
```

3. **Restart services:**

```bash
ssh root@YOUR_SERVER_IP "cd /opt/no-context && \
  docker compose -f docker-compose.prod.yaml restart"
```

**Why this happens:** Docker Compose mounts `./config:/app/config:ro` as a volume. If the host directory doesn't exist or is empty, the container sees an empty config directory and fails to start.

### SSH Connection Issues

- Verify your SSH key is added to the server's authorized_keys
- Check SSH port (22) is open in firewall
- Use password authentication if keys aren't configured

## Management Commands

### View Status

```bash
docker compose -f docker-compose.prod.yaml ps
```

### Restart Services

```bash
# Restart all services
docker compose -f docker-compose.prod.yaml restart

# Restart specific service
docker compose -f docker-compose.prod.yaml restart app
docker compose -f docker-compose.prod.yaml restart caddy
```

### Update Application

```bash
# Transfer updated files
rsync -avz --exclude-from=.dockerignore \
  /path/to/no-context/ \
  root@YOUR_SERVER_IP:/opt/no-context/

# Rebuild and redeploy
ssh root@YOUR_SERVER_IP "cd /opt/no-context && \
  docker compose -f docker-compose.prod.yaml build && \
  docker compose -f docker-compose.prod.yaml up -d"
```

### Update Environment Variables

```bash
# Copy new .env file
scp .env root@YOUR_SERVER_IP:/opt/no-context/.env

# Restart services to apply changes
ssh root@YOUR_SERVER_IP "cd /opt/no-context && \
  docker compose -f docker-compose.prod.yaml restart"
```

### Stop Services

```bash
docker compose -f docker-compose.prod.yaml down
```

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yaml logs -f

# Specific service
docker compose -f docker-compose.prod.yaml logs -f app
docker compose -f docker-compose.prod.yaml logs -f caddy

# Last N lines
docker compose -f docker-compose.prod.yaml logs --tail=100 app
```

### Clean Up

```bash
# Stop and remove containers, networks, volumes
docker compose -f docker-compose.prod.yaml down -v

# Remove Docker images
docker image prune -a
```

## Notes

- The application runs on port 3000 internally, exposed through Caddy
- Caddy handles all SSL certificate management automatically
- SSL certificates are stored in Docker volumes and persist across restarts
- Use `docker compose` (with space) for Docker Compose V2 commands
- The A2A server provides WebSocket endpoints for real-time communication
- This is an API server; root endpoint returning 404 is expected behavior

## Reverse Proxy (Traefik) Configuration

When deploying behind Traefik (or any reverse proxy), the server now advertises the correct public A2A endpoint in its Agent Card automatically.

What the app does:

- Express `trust proxy` is enabled so `X-Forwarded-*` headers from Traefik are honored.
- The Agent Card URL prefers `A2A_BASE_URL` if set; otherwise it is built from `X-Forwarded-Proto`, `X-Forwarded-Host`, and optional `X-Forwarded-Prefix` (falling back to `req.protocol`/`Host`).

Required environment:

- Set `A2A_BASE_URL` in production to the public base URL (recommended), e.g. `https://api.example.com`.

Traefik headers (automatic):

- Traefik sets `X-Forwarded-Proto` and `X-Forwarded-Host` by default. If you mount under a path, ensure `X-Forwarded-Prefix` is set (Traefik sets it when using a PathPrefix rule).

Example Traefik labels (compose):

```yaml
services:
  app:
    labels:
      - traefik.enable=true
      - traefik.http.routers.noctx.rule=Host(`api.example.com`)
      - traefik.http.routers.noctx.entrypoints=websecure
      - traefik.http.routers.noctx.tls=true
      - traefik.http.services.noctx.loadbalancer.server.port=3000
      # If serving under a prefix like /agent, include a PathPrefix rule:
      # - traefik.http.routers.noctx.rule=Host(`api.example.com`) && PathPrefix(`/agent`)
```

Verification checklist:

- Agent Card at `https://YOUR_DOMAIN/.well-known/agent.json` has `url` pointing to your public endpoint (including any prefix), e.g. `https://YOUR_DOMAIN/a2a`.
- JSON-RPC `message/stream` requests reach the app (check proxy and app logs).
