#!/bin/bash

# Saves the current supabase schema

set -eo pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
source "$SCRIPT_DIR/env.sh"

SUPABASE_PROJECT_ID="$("$SCRIPT_DIR/supabase-project-id.sh")"
if [ -z "$SUPABASE_PROJECT_ID" ]; then
  echo "Error: Supabase project ID not set" >&2
  exit 1
fi

OFILE="$PROJECT_DIR/sql/schema.sql"

echo "Saving schema from supabase project $SUPABASE_PROJECT_ID to $OFILE"

npx supabase link --project-ref "$SUPABASE_PROJECT_ID" || exit $?
npx supabase db dump --file="$OFILE" || exit $?
