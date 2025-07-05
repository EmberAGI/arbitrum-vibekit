#!/usr/bin/env bash

# This script can be used to update the API schemas for the Ember API. It assumes that the onchain-actions repo is available
# in the ember-sdk-typescript folder, located alongside the arbitrum-vibekit repo.

mkdir -p ./lib/ember-api/src/schemas/
cp -r ../../ember-sdk-typescript/onchain-actions/src/types/* ./lib/ember-api/src/schemas/