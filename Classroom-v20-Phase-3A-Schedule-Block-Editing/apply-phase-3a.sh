#!/usr/bin/env bash
set -euo pipefail

BASE_COMMIT="786bab69cd0cdeeedd14dd8469faf7127a53a492"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f package.json || ! -f src/main.tsx || ! -d .git ]]; then
  echo "Run this script from the Classroom-Source repository root." >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" ]]; then
  echo "Detached HEAD is not supported." >&2
  exit 1
fi
if [[ "$BRANCH" == "main" ]]; then
  echo "Create and switch to a Phase 3A branch before applying this package." >&2
  exit 1
fi

HEAD_COMMIT="$(git rev-parse HEAD)"
if [[ "$HEAD_COMMIT" != "$BASE_COMMIT" ]]; then
  echo "This package targets main commit $BASE_COMMIT, but HEAD is $HEAD_COMMIT." >&2
  echo "Stop and re-audit rather than applying to a different source baseline." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked files have uncommitted changes. Commit or restore them first." >&2
  exit 1
fi

python3 "$SCRIPT_DIR/apply-phase-3a.py"
rm -rf "$SCRIPT_DIR"

echo
echo "Next: npm run format && npm run check && npm run test:e2e"
