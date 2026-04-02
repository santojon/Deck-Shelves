#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com/"
  exit 1
fi

OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Checking repository settings for $OWNER_REPO"

CURRENT=$(gh api -H "Accept: application/vnd.github.v3+json" /repos/$OWNER_REPO)
ALLOW_SQUASH=$(echo "$CURRENT" | jq -r '.allow_squash_merge')
DELETE_BRANCH=$(echo "$CURRENT" | jq -r '.delete_branch_on_merge')

echo "allow_squash_merge: $ALLOW_SQUASH"
echo "delete_branch_on_merge: $DELETE_BRANCH"

if [[ "$ALLOW_SQUASH" != "true" || "$DELETE_BRANCH" != "true" ]]; then
  echo "Patching repository settings to enable squash merges and delete branch on merge..."
  gh api -X PATCH /repos/$OWNER_REPO -f allow_squash_merge=true -f delete_branch_on_merge=true
  echo "Patched. Verify again to confirm:"
  gh api /repos/$OWNER_REPO -q '.allow_squash_merge, .delete_branch_on_merge'
else
  echo "Repository already configured."
fi
