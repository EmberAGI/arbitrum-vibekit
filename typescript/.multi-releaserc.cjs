module.exports = {
  deps: {
    bump: "inherit",
    prefix: "",
    release: "inherit",
  },
  ignorePackages: [
    "clients/**",
    "community/**",
    "examples/**",
    "templates/**",
    "lib/community-mcp-tools/**",
    "lib/ember-api/**",
    "lib/mcp-tools/**",
    "lib/test-utils/**",
  ],
  // eslint-disable-next-line no-template-curly-in-string
  tagFormat: "${name}@${version}",
};
