## Contributing to Vibekit

Thanks for your interest in contributing to Vibekit! This guide explains how to make valuable contributions to the project.

## Getting Started

Before you start your work, checkout [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to see if someone is already working on the same topic. For big changes or new features, create an issue first to avoid duplicate work, though it's not required for smaller updates.

## Types of Contributions

We welcome several types of contributions, all of which follow the same development workflow outlined below:

### 🐛 Bug Reports and Fixes

Found a bug? Help us improve Vibekit by reporting it and contributing a fix.

**Reporting Bugs:**

1. **Search Existing Issues**: Check [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to see if the bug has already been reported.
2. **Create a Detailed Bug Report**: If not found, [create a new issue](https://github.com/EmberAGI/arbitrum-vibekit/issues/new) with:
   - Clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Environment details (OS, Node version, browser, etc.)
   - Code snippets or screenshots if applicable
   - Any error messages or logs

**Contributing Bug Fixes:**

- Comment on the issue to let others know you're working on it
- Follow the development workflow below to implement and submit your fix
- Reference the issue number in your PR (e.g., "Fixes #123")
- Include any relevant test cases

### 🔌 Expanding Protocol Support

Vibekit supports DeFi protocol integrations through the Ember plugin system. This standardized architecture enables adding support for protocols with swap, lending, and liquidity capabilities.

**What You Can Add:**

- **Swap Operations**: Token swapping across DEXs
- **Lending Operations**: Borrow, repay, supply, and withdraw on lending protocols
- **Liquidity Operations**: Provide and withdraw liquidity from pools

**Getting Started:**

1. **Create an Issue**: Navigate to the [Vibekit issues board](https://github.com/EmberAGI/arbitrum-vibekit/issues) to create a new issue detailing the protocol you intend to integrate.
2. **Review Plugin Documentation**: Check the comprehensive [Ember API README](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/ember-api) for detailed implementation guidelines, architecture overview, and code examples.
3. **Study Existing Implementations**: Examine existing plugins and action implementations in the `typescript/lib/ember-api/` directory for reference patterns.
4. Follow the development workflow below to implement your protocol integration.

### 🚀 Adding New Functionality

Whether you're adding new MCP tools, agent capabilities, or framework features:

1. **Review MCP Tools Guidelines**: Checkout the [README.md](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools) file in the `mcp-tools` directory for guidance on developing MCP tools.
2. **Study Existing Patterns**: Review existing implementations and templates for reference.
3. Follow the development workflow below to implement your new functionality.

## Development Workflow

**All contributions follow this unified development process:**

### 1. Fork & Clone the Repository

- **Fork the Repository:** Create your own copy of the [Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit) on GitHub.
- **Clone Your Fork:** Clone your forked repository to your local machine: `git clone https://github.com/YOUR_USERNAME/arbitrum-vibekit.git` (replace `YOUR_USERNAME` with your GitHub username).

### 2. Implement Changes

- Create a new branch for your work
- Implement your bug fix, protocol integration, or new functionality
- Ensure your code follows existing patterns and conventions

### 3. Create Documentation

- Create or update `README` files to clearly explain functionality and setup process
- Document any new APIs, configuration options, or usage patterns
- Include code examples where helpful

### 4. Add Example Usage

- Consider adding a demo agent to the [templates directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates) to showcase your new features
- Update existing examples if your changes affect them

### 5. Provide Comprehensive Testing

- Ensure your implementation includes thorough testing coverage
- Run existing tests to make sure you haven't broken anything
- Add new tests for your functionality
- Testing is a key quality metric we evaluate

### 6. Update CHANGELOG

- Document your modifications in [CHANGELOG.md](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CHANGELOG.md) to keep the project's history clear
- Follow the existing format and categorization

### 7. Submit Your Pull Request

- Create a clear, descriptive PR title
- Link any relevant issues in your PR description
- Provide a detailed description of what you've implemented and why
- Ensure your code passes all testing and linting requirements

## Review Process

After you submit your PR, we'll acknowledge it within 2–3 days to let you know it's being reviewed. You can expect initial feedback or requested changes from us within 5 days. Once all feedback is addressed and your PR is approved, your contribution will be merged.

## Getting Support

If you need assistance at any step of the contribution process:

- Search [existing issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) for similar questions or problems.
- If your concern isn't already covered, create a new issue with detailed information.
- Reach out to our team for guidance.
- Join our [support Discord](https://discord.com/invite/bgxWQ2fSBR) and connect with other builders.
