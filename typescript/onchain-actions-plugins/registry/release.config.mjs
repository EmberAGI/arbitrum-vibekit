import { createReleaseConfig } from "../../release/base.config.mjs";

const SHOULD_PUBLISH = process.env.RELEASE_DRY_RUN !== "true";

export default createReleaseConfig({
  tagFormat: "@emberai/onchain-actions-registry@${version}",
  packagePlugins: [
    [
      "@semantic-release/npm",
      {
        npmPublish: SHOULD_PUBLISH,
        pkgRoot: ".npm-publish",
      },
    ],
  ],
});
