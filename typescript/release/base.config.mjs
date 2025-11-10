const SHARED_BRANCHES = [
  "main",
  {
    channel: "next",
    name: "next",
    prerelease: "next",
  },
];

const CORE_PLUGINS = [
  [
    "@semantic-release/commit-analyzer",
    {
      preset: "conventionalcommits",
    },
  ],
  [
    "@semantic-release/release-notes-generator",
    {
      preset: "conventionalcommits",
    },
  ],
];

const GITHUB_PLUGIN = ["@semantic-release/github", {}];

/**
 * Builds a package-specific semantic-release config that reuses the shared
 * branch policy and conventional commit plugins.
 * @param {object} params
 * @param {string} params.tagFormat Custom tag format for the package.
 * @param {Array} [params.packagePlugins] Additional plugins injected before GitHub.
 * @param {object} [params.overrides] Extra semantic-release options.
 * @returns {object}
 */
export function createReleaseConfig({ tagFormat, packagePlugins = [], ...overrides } = {}) {
  if (!tagFormat) {
    throw new Error("tagFormat is required when creating a release config");
  }

  return {
    branches: SHARED_BRANCHES,
    tagFormat,
    ...overrides,
    plugins: [...CORE_PLUGINS, ...packagePlugins, GITHUB_PLUGIN],
  };
}

export const sharedBranches = SHARED_BRANCHES;
export const sharedCorePlugins = CORE_PLUGINS;

export default {
  branches: SHARED_BRANCHES,
  plugins: [...CORE_PLUGINS, GITHUB_PLUGIN],
};
