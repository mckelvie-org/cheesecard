#!/bin/bash
# Prints the Supabase project ID for the current git branch.
# Reads STAGE_<BRANCH_UPPER>_SUPABASE_PROJECT_ID from .env.local.
# Example .env.local entries:
#   STAGE_MAIN_SUPABASE_PROJECT_ID=abcdefghijklmnop
#   STAGE_TEST_SUPABASE_PROJECT_ID=qrstuvwxyzabcdef
set -eo pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
source "$SCRIPT_DIR/env.sh"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
UPPER=$(echo "$BRANCH" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
VAR="STAGE_${UPPER}_SUPABASE_PROJECT_ID"
PROJECT_ID="${!VAR}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: $VAR not set in $ENV_FILE" >&2
  exit 1
fi

echo "$PROJECT_ID"
