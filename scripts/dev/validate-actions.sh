#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

echo "Validating GitHub Actions workflows in .github/workflows"

if command -v actionlint >/dev/null 2>&1; then
  echo "Running actionlint on workflow files..."
  rc=0
  for f in .github/workflows/*.{yml,yaml}; do
    [ -e "$f" ] || continue
    echo "-- $f"
    actionlint "$f" || rc=$?
  done
  if [[ $rc -ne 0 ]]; then
    echo "actionlint reported issues (exit code $rc)"
  else
    echo "actionlint passed for all workflow files"
  fi
else
  echo "actionlint not found. To install (macOS Homebrew):"
  echo "  brew install actionlint"
  echo "Or via Go:"
  echo "  go install github.com/rhysd/actionlint/cmd/actionlint@latest"
fi

if command -v act >/dev/null 2>&1; then
  echo "\n'act' found. Listing workflows and jobs (dry-run)."
  act -l || true
  echo "To run a specific job locally (may require secrets): act -j <job> -s GITHUB_TOKEN=xxx"
else
  echo "'act' not found. To install:"
  echo "  curl https://raw.githubusercontent.com/nektos/act/master/scripts/install.sh | bash"
  echo "Or see https://github.com/nektos/act for installation instructions."
fi

echo "Validation script complete."
