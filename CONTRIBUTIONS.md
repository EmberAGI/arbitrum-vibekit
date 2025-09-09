## Contributing to Vibekit

Thanks for your interest in contributing to Vibekit! This guide explains how to make valuable contributions to the project.

## Getting Started

Before you start your work, checkout [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to see if someone is already working on the same topic. For any changes or new features, create an issue first to avoid duplicate work.

> [!NOTE]  
> Duplicate contributions will not get integrated or rewarded.

## Types of Contributions

We welcome several types of contributions, all of which follow the same development workflow outlined below:

### 🐛 Bug Reports and Fixes

1. **Search Existing Issues**: Check [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to see if the bug has already been reported.

2. **Create a Detailed Bug Report**: If not found, [create a new issue](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=bug_report.yml) with:

   - Clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Environment details (OS, Node version, browser, etc.)
   - Code snippets or screenshots if applicable
   - Any error messages or logs

3. **Wait For Your Issue To Be Approved By The Team**: A team member will comment on your issue to let you know it is approved for contribution.

4. **Contribute Your Fix**: Follow the [development workflow](#development-workflow) below to implement and submit your fix. Make sure to reference the issue number in your PR.

### 🔌 Expanding Protocol Support

Vibekit supports DeFi protocol integrations through the Ember Plugin System.

> [!NOTE]  
> All protocol support and on-chain execution have to be integrated through the Ember Plugin System. Contributions that bypass this step will not be integrated or rewarded.

1. **Create an Issue**: Navigate to the [issue board](https://github.com/EmberAGI/arbitrum-vibekit/issues) to [create a new issue](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=protocol_integration.yml) detailing the protocol you intend to integrate. Make sure that a similar issue is not already created by someone else.

2. **Review Plugin Documentation**: Check the comprehensive [Ember API README](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/ember-api) for detailed implementation guidelines, architecture overview, and code examples.

3. **Wait For Your Issue To Be Approved By The Team**: A team member will comment on your issue to let you know it is approved for contribution.

4. **Submit Your Contribution**: Follow the [development workflow](#development-workflow) below to implement your protocol integration. Make sure to reference the issue number in your PR.

### 🚀 Adding New Functionality

1. **Search Existing Issues**: Check [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to make sure no one else is working on a similar feature.

2. **Create a Detailed Issue**: Create a detailed issue explaining your new [MCP tools], [agent templates](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=agent_template.yml), [UI improvements] or [framework features](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=feature_request.yml) to expand Vibekit capabilities.

3. **Wait For Your Issue To Be Approved By The Team**: A team member will comment on your issue to let you know it is approved for contribution.

4. **Study Existing Patterns**: Review existing implementations and templates for reference.

5. **Submit Your Contribution**: Follow the [development workflow](#development-workflow) below to implement your new functionality. Make sure to reference the issue number in your PR.

## Development Workflow

> [!NOTE]  
> All contributions must follow this unified development process. Any other type of contribution will not get integrated or rewarded.

### 1. Fork & Clone the Repository

- **Fork the Repository:** Create your own copy of the [Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit).
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

- Consider adding a demo agent to the [templates directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates) to showcase your new features.

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
