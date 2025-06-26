## Contributing to Vibekit

Thanks for your interest in contributing to Vibetkit! This guide explains how to make valuable contributions to the project.

## Getting Started

Before you start your work, checkout [open issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) to see if someone is already working on the same topic. For big changes or new features, create an issue first to avoid duplicate work, though it's not required for smaller updates.

## Expanding Protocol Support (Integrating New Plugins)

Vibekit primarily interacts with DeFi protocols through the MCP server powered by [EmberAI](https://www.emberai.xyz/), which supports a specific set of protocols at launch. Vibekit and Ember are designed for extensibility, and we highly encourage contributions that integrate support for additional protocols via new plugins.

If you're looking to add support for a new protocol:

1.  **Identify Protocol & Similar Integrations:**
    Begin by identifying the protocol you wish to integrate. Look for the most similar existing integration within Vibekit. This can serve as a valuable reference for design patterns and shared abstractions. For instance, if you're aiming to integrate a DEX similar to Uniswap, the Camelot integration could be a good starting point.

2.  **Create an Issue:**
    Navigate to the [Vibekit issues board](https://github.com/EmberAGI/arbitrum-vibekit/issues) to create a new issue detailing the protocol you intend to integrate. Describe the protocol, highlight its similarities to any existing integrations, and outline your proposed integration plan. This helps in tracking progress and discussing the approach.

## Development Steps

**1. Fork & Clone the Repository:**

- **Fork the Repository:** Start by creating your own copy of the [Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit) on GitHub.

- **Clone Your Fork:** After forking, clone your forked repository to your local machine to begin development. You can do this by running `git clone https://github.com/YOUR_USERNAME/arbitrum-vibekit.git` (replace `YOUR_USERNAME` with your GitHub username).

**2. Review MCP Tools Guidelines:** Checkout the [README.md](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/mcp-tools) file in the `mcp-tools` directory for guidance on developing MCP tools.

**3. Implement Changes:** Add new tools or improve existing ones.

**4. Create Documentation:** Create a `README` file for your new MCP tool that clearly explains its functionality and setup process.

**5. Create Example Agents:** Consider adding a demo agent to the [templates directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates) to showcase your new features.

**6. Update CHANGELOG:** Document your modifications in [CHANGELOG.md](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CHANGELOG.md) to keep the project's history clear.

## Submitting Your Work

When preparing your pull request (PR), be sure to link any relevant issues to provide context. Make sure your code passes all testing and linting requirements as well.

## Review Process

After you submit your PR, we'll acknowledge it within 2–3 days to let you know it's being reviewed. You can expect initial feedback or requested changes from us within 5 days. Once all feedback is addressed and your PR is approved, your contribution will be merged.

## Getting Support

If you need assistance at any step of the contribution process:

- Search [existing issues](https://github.com/EmberAGI/arbitrum-vibekit/issues) for similar questions or problems.
- If your concern isn't already covered, create a new issue with detailed information.
- Reach out to our team for guidance.
- Join our [support Discord](https://discord.com/invite/bgxWQ2fSBR) and connect with other builders.
