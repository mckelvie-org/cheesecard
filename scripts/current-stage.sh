#!/bin/bash

# Prints the deployment stage associated with this git branch, in uppercase.
# By default this is the uppercase git branch name, but it can be overridden by setting BRANCH_<BRANCH_UPPER>_STAGE in .env.local.
set -eo pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
source "$SCRIPT_DIR/env.sh"

BRANCH="$("$SCRIPT_DIR/current-branch.sh")"
BRANCH_UPPER=$(echo "$BRANCH" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
STAGE_VAR="BRANCH_${BRANCH_UPPER}_STAGE"
STAGE="${!STAGE_VAR}"
if [ -z "$STAGE" ]; then
  STAGE="${BRANCH_UPPER}"  # Default to uppercase branch name if specific stage var not set
fi

echo "$STAGE"
