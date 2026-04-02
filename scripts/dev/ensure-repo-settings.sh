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
ALLOW_MERGE=$(echo "$CURRENT" | jq -r '.allow_merge_commit')
ALLOW_REBASE=$(echo "$CURRENT" | jq -r '.allow_rebase_merge')

echo "allow_squash_merge: $ALLOW_SQUASH"
echo "allow_merge_commit: $ALLOW_MERGE"
echo "allow_rebase_merge: $ALLOW_REBASE"
echo "delete_branch_on_merge: $DELETE_BRANCH"

if [[ "$ALLOW_SQUASH" != "true" || "$DELETE_BRANCH" != "true" || "$ALLOW_MERGE" != "false" || "$ALLOW_REBASE" != "false" ]]; then
  echo "Patching repository settings to enable squash-only merges and delete branch on merge..."
  gh api -X PATCH /repos/$OWNER_REPO \
    -f allow_squash_merge=true \
    -f delete_branch_on_merge=true \
    -f allow_merge_commit=false \
    -f allow_rebase_merge=false
  echo "Patched. Verify again to confirm:"
  gh api /repos/$OWNER_REPO -q '.allow_squash_merge, .allow_merge_commit, .allow_rebase_merge, .delete_branch_on_merge'
else
  echo "Repository already configured for squash-only merges and delete-on-merge."
fi
