#!/usr/bin/env bash

set -e

submodule_dir=onchain-actions

if [ ! -d "$submodule_dir/.git" ]; then
    echo "onchain-actions should be cloned to typescript/$submodule_dir"
    exit 1;
fi;

pushd  "$submodule_dir"

pnpm install --ignore-workspace --no-frozen-lockfile

popd
