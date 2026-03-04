# !/bin/bash

# Meant to be sourced, not executed directly. Loads environment variables from .env.local
# so they can be used in other scripts. PROJECT_DIR is set to the root of the project, and can be used by other
# scripts to find files relative to the project root.

_SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PROJECT_DIR="$(dirname "$_SCRIPT_DIR")"

_ENV_FILE="$PROJECT_DIR/.env.local"
if [ -f "$_ENV_FILE" ]; then
  source "$_ENV_FILE"
fi

unset _SCRIPT_DIR
unset _ENV_FILE
