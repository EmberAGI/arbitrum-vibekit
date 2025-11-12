---
inclusion: always
---

# Development Server Manual Start Policy

**CRITICAL**: Never automatically execute development server commands. Users must start servers manually to maintain control over resource usage and development workflow.

## Prohibited Commands

Do not auto-execute these development server commands:
- `pnpm dev`, `yarn dev`, `npm start`, `bun dev`
- Framework-specific: `next dev`, `vite`, `ng serve`, `vue-cli-service serve`
- Static servers: `serve`, `http-server`, `python -m http.server`

## Allowed Actions

- **Suggest** the appropriate start command
- **Provide** setup instructions for development servers
- **Configure** server settings and environment variables
- **Execute** build commands (`pnpm build`, `yarn build`)
- **Execute** test commands (`pnpm test`, `yarn test`)

## Response Pattern

When development server startup is needed:
```
To start the development server, run: `pnpm dev`
```

Never execute the command automatically. This policy ensures users control when servers consume system resources and prevents unwanted background processes.
