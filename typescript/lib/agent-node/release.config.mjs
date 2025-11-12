import { createReleaseConfig } from '../../release/base.config.mjs';

export default createReleaseConfig({
  tagFormat: '@emberai/agent-node@${version}',
  packagePlugins: [
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'pnpm pkg set version=${nextRelease.version}',
        publishCmd:
          "pnpm publish --no-git-checks --access public --tag ${nextRelease.channel || 'latest'}",
      },
    ],
  ],
});
