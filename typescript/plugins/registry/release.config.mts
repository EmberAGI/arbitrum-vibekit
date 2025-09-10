export default {
  branches: ['main'],
  tagFormat: 'ember-plugin-registry-v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/npm', { npmPublish: true, pkgRoot: '.npm-publish' }],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message:
          'chore(release): ember-plugin-registry-v${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    ['@semantic-release/github', {}],
  ],
};
