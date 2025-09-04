#!/usr/bin/env bash

# CI-friendly version that doesn't require onchain-actions submodule

set -e

submodule_dir=onchain-actions

echo "CI mode: Skipping onchain-actions submodule requirement"
echo "This script is designed for CI environments where onchain-actions is not available"

# Check if the directory exists, but don't fail if it doesn't
if [ ! -d "$submodule_dir/.git" ]; then
    echo "onchain-actions submodule not found - this is expected in CI"
    echo "Continuing without submodule..."
    exit 0
fi

# If it does exist, install dependencies
pushd  "$submodule_dir"
pnpm install --ignore-workspace --no-frozen-lockfile
popd

echo "Submodule setup complete" 