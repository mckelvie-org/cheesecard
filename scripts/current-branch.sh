#!/bin/bash

# Prints the current git branch name. This is used in various places to determine which stage to deploy to, 
# which Supabase project to connect to, among other things.

set -eo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "$BRANCH"
