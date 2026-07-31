import { createReleaseConfig } from '../../release/base.config.mjs';

const SHOULD_PUBLISH = process.env.RELEASE_DRY_RUN !== 'true';

export default createReleaseConfig({
  tagFormat: '@emberai/onchain-actions-contracts@${version}',
  packagePlugins: [
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'node ../../scripts/prepare-npm-publish.mjs --package onchain-actions-plugins/contracts/package.json',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: SHOULD_PUBLISH,
        pkgRoot: '.npm-publish',
        provenance: true,
      },
    ],
  ],
});
