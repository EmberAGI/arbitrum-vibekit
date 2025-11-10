import { createReleaseConfig } from "../../release/base.config.mjs";

export default createReleaseConfig({
  tagFormat: "@emberai/onchain-actions-registry@${version}",
  packagePlugins: [
    [
      "@semantic-release/npm",
      {
        npmPublish: true,
        pkgRoot: ".npm-publish",
      },
    ],
  ],
});
