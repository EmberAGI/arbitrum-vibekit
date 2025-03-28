# Base Node.js image
FROM node:20-slim

# Set up workspace
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json ./

# Install dependencies
RUN pnpm install

# Copy source code and scripts
COPY . .

# Expose port for SSE MCP server
EXPOSE 3001

# Start the lending agent
CMD ["pnpm", "start"]