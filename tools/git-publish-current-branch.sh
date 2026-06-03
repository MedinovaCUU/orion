#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REMOTE_NAME="origin"
DEFAULT_REMOTE_URL="https://github.com/MedinovaCUU/orion.git"

REMOTE_NAME="${GIT_REMOTE_NAME:-$DEFAULT_REMOTE_NAME}"
REMOTE_URL="${GIT_REMOTE_URL:-$DEFAULT_REMOTE_URL}"
BRANCH_NAME="$(git branch --show-current)"

if [[ -z "$BRANCH_NAME" ]]; then
  echo "No active branch detected. Checkout a branch before publishing." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This command must be run inside a Git repository." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has uncommitted changes. Commit or stash them before publishing." >&2
  git status --short
  exit 1
fi

if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  CURRENT_URL="$(git remote get-url "$REMOTE_NAME")"
  if [[ "$CURRENT_URL" != "$REMOTE_URL" ]]; then
    echo "Remote '$REMOTE_NAME' already exists with a different URL:" >&2
    echo "  $CURRENT_URL" >&2
    echo "Expected:" >&2
    echo "  $REMOTE_URL" >&2
    echo "Set GIT_REMOTE_URL to the desired URL, or update the remote manually." >&2
    exit 1
  fi
else
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

echo "Publishing branch '$BRANCH_NAME' to '$REMOTE_NAME' ($REMOTE_URL)..."
git push -u "$REMOTE_NAME" "HEAD:$BRANCH_NAME"
