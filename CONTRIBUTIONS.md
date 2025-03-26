# AgentKit Contributing Guide

We appreciate your interest in contributing to AgentKit! All contributions are valuable, regardless of their size.

## Repository Structure

The AgentKit repository follows a [monorepo](https://vercel.com/docs/vercel-platform/glossary#monorepo) organization. Each [package](https://vercel.com/docs/vercel-platform/glossary#package) exists as a subfolder with either a `package.json` (for TypeScript) or a `toml` file (for Rust crates), along with its associated code published to NPM or Cargo. For instance, `typescript/arbitrum-agentkit` represents one package, while `rust/arbitrum-agentkit` represents another.

It's worth noting that not every package has implementations in both languages. This divergence is expected and acceptable. If you're interested in developing a TypeScript version of a Rust-only package (or vice versa), such contributions would be greatly appreciated!

Here's a simplified overview of our repository structure:

```
agentkit/
├── typescript/
│   └── examples/
│       └── aave-chatbot
├── rust/
│   └── examples/
│       └── aave-chatbot
```

## Contributing Workflow

1. **Optional: Start with an Issue**

Before reporting bugs or requesting features, please check if someone has already created an issue for it. For minor bugs or features that you'd like to address yourself, feel free to skip this initial step.

2. **Development Process**

Follow these general steps to contribute changes:

- Fork the repository
- Create a feature or bugfix branch
- Write tests
- Update CHANGELOG.md

3. **Pull Request Process**

When your changes are ready for submission, complete these additional steps:

- Fill out the PR template thoroughly with comprehensive details
    - Include screenshots or videos demonstrating your changes when possible
- Reference any related issues
- Verify that all CI checks pass

4. **PR Review Expectations**

After submitting your PR, you can expect an acknowledgment within 1 day and an initial review by an assigned maintainer within 1 day. Once all feedback is addressed and approval is granted, the maintainer will merge your PR for inclusion in the next release.

## Getting Help

If you encounter difficulties, consider these options:

- Search through existing issues
- Contact the Arbitrum Agentkit team
- Open a new issue