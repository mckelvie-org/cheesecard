#!/bin/bash

SCRIPT_DIR="$(cd -P "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

claude --resume "$(cat "$SCRIPT_DIR/.env.claude_session")" "$@" || exit $?

