# Contributing to Agentkit

Thank you for your interest in contributing to Agentkit! This guide outlines how you can make meaningful contributions to our project.

## Repository Organization

Agentkit uses a monorepo structure primarily focused on TypeScript packages, with a Rust implementation planned for release in the coming weeks.

The repository is organized as follows:

```
agentkit/
├── typescript/
│   └── examplest/
│       └── lending-agent/
│----── mcp-tools/
│       └── emberal-mcp/
|           └── src/
├── CHANGELOG.md
├── CONTRIBUTIONS.md
├── LICENSE
├── README.md
```

## How to Contribute

### 1. Preliminary Steps

While not mandatory for minor changes, consider creating an issue first for significant bugs or feature requests. Check existing issues to avoid duplication.

### 2. Development Guidelines

To contribute effectively:

- Fork the repository
- Check the README.md file on the mcp-tools for additional information on developing MCP tools
- Develop your new tools or add functionality
- Consider creating example agents that demonstrate your tools
- Document your changes in CHANGELOG.md

### 3. Submitting Your Work

When preparing your pull request:

- Link to any related issues
- Ensure all continuous integration checks pass
- Provide clear documentation of your changes

### 4. Review Process

After submission, you can expect:

- An acknowledgment within 2-3 days
- Initial review by a maintainer within 5 days
- Merging after all feedback is addressed and approval is granted

## Getting Support

If you need assistance:

- Review existing issues for similar problems
- Reach out to the Arbitrum Agentkit team
- Open a new issue with a detailed description
