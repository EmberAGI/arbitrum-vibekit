## Contributing to Vibekit

Thanks for your interest in contributing to Vibekit! This guide explains how to make valuable contributions to the project.

## Getting Started

Before you start your work, checkout [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to see if someone is already working on the same topic. For any changes or new features, create an issue first to avoid duplicate work.

> [!NOTE]  
> Duplicate contributions will not get integrated.

## Types of Contributions

We welcome several types of contributions, all of which follow the same development workflow outlined below:

### 🐛 Bug Reports and Documentation Fixes

1. **Search Existing Issues**: Check [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to see if the problem has already been reported.

2. **Create a Detailed Report**: If not found, create a new issue for the [bug report](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=bug_report.yml) or the [documentation update](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=documentation.yml).

3. **Wait For Your Issue To Be Approved By The Team**: A team member will comment on your issue to let you know it is approved for contribution.

4. **Contribute Your Fix**: Follow the [development workflow](#development-workflow) below to implement and submit your fix. Make sure to reference the issue number in your PR.

### 🔌 Expanding Protocol Support

Vibekit supports DeFi protocol integrations through the Ember Plugin System.

> [!NOTE]  
> All protocol support and on-chain executions must be implemented through the [Ember Plugin System](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins). Contributions that bypass this step will not be integrated or rewarded.

1. **Create an Issue**: Navigate to the [issue board](https://github.com/EmberAGI/arbitrum-vibekit/issues) to [create a new issue](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=protocol_integration.yml) detailing the protocol you intend to integrate. Make sure that a similar issue is not already created by someone else.

2. **Review Plugin Documentation**: Check the comprehensive [Ember Plugin System documentation](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins/registry/README.md) for detailed implementation guidelines, architecture overview, and code examples.

3. **Wait For Your Issue To Be Approved By The Team**: A team member will comment on your issue to let you know it is approved for contribution.

4. **Submit Your Contribution**: Follow the [development workflow](#development-workflow) below to implement your protocol integration. Make sure to reference the issue number in your PR.

### 🚀 Adding New Functionality

1. **Search Existing Issues**: Check [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to make sure no one else is working on a similar feature.

2. **Create a Detailed Issue**: Create a detailed issue explaining your new [MCP tools](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=mcp_server.yml), [agent template](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=agent_template.yml), [UI improvement](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=ui_improvement.yml) or [framework feature](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=feature_request.yml).

3. **Study Existing Patterns**: Review existing implementations and templates for reference.

4. **Wait For Your Issue To Be Approved By The Team**: A team member will comment on your issue to let you know it is approved for contribution.

5. **Submit Your Contribution**: Follow the [development workflow](#development-workflow) below to implement your new functionality. Make sure to reference the issue number in your PR.

## Development Workflow

### 1. Fork & Clone the Repository

- **Fork the Repository:** Create your own copy of the [Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit).
- **Clone Your Fork:** Clone your forked repository to your local machine: `git clone https://github.com/YOUR_USERNAME/arbitrum-vibekit.git` (replace `YOUR_USERNAME` with your GitHub username).

### 2. Implement Changes

- Create a new branch for your work
- Implement your bug fix, protocol integration, or new functionality. If you are contributing an agent template, make sure to create it in the [`community`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community) directory.
- Ensure your code follows existing patterns and conventions

### 3. Create Documentation

- Create or update `README` files to clearly explain functionality and setup process
- Document any new APIs, configuration options, or usage patterns
- Include code examples where helpful

### 4. Add Example Usage

- Consider adding an agent to the [community directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/community) to showcase your new features.

- Consider integrating your agent into the [Vibekit UI](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/clients/web) to demo your agent's capabilities.

### 5. Provide Comprehensive Testing

- Ensure your implementation includes thorough testing coverage
- Run existing tests to make sure you haven't broken anything
- Add new tests for your functionality
- Testing is a key quality metric we evaluate

### 6. Submit Your Pull Request

- Create a clear, descriptive PR title
- Link any relevant issues in your PR description
- Provide a detailed description of what you've implemented and why
- Ensure your code passes all testing and linting requirements

## Review Process

After you submit your PR, we'll acknowledge it within 2–3 days to let you know it's being reviewed. You can expect initial feedback or requested changes from us within a week. Once all feedback is addressed and your PR is approved, your contribution will be merged.

## Getting Support

If you need assistance at any step of the contribution process:

- Search [existing issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) for similar questions or problems.
- If your concern isn't already covered, create a new issue with detailed information.
- Reach out to our team for guidance.
- Join our [support Discord](https://discord.com/invite/bgxWQ2fSBR) and connect with other builders.
