module.exports = {
  branches: ["main"],
  tagFormat: "${name}-v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    ["@semantic-release/npm", { npmPublish: true }],
    ["@semantic-release/git", {
      assets: ["CHANGELOG.md", "package.json"],
      message: "chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}"
    }],
    ["@semantic-release/github", {}]
  ]
};