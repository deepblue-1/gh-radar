#!/usr/bin/env bash
# Vercel "Ignored Build Step" — exit 0 → SKIP webapp build, non-zero → BUILD.
#
# Build when webapp/, packages/shared/, or pnpm-lock.yaml changed since the
# PREVIOUSLY DEPLOYED commit (not just the tip commit — GSD pushes batches whose
# tip is often a docs-only commit, which the naive `HEAD^ HEAD` check skipped,
# leaving the frontend stuck). Robust to Vercel's shallow clone: fetch the
# previous SHA; if it (or either ref) isn't resolvable, BUILD to be safe —
# never let a git error abort the deploy (must exit 0 or 1 only).
#
# Invoked from webapp/ (rootDirectory) via:  cd .. && bash scripts/vercel-ignore-build.sh
# vercel.json's ignoreCommand has a 256-char limit, hence this script.

PREV="$VERCEL_GIT_PREVIOUS_SHA"
CUR="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

# Deepen the shallow clone enough to resolve the previous deploy commit.
git fetch --depth=1 origin "$PREV" 2>/dev/null || true

if git cat-file -e "${PREV}^{commit}" 2>/dev/null && git cat-file -e "${CUR}^{commit}" 2>/dev/null; then
  # Both refs resolvable → skip (exit 0) only if no relevant paths changed.
  git diff --quiet "$PREV" "$CUR" -- webapp/ packages/shared/ pnpm-lock.yaml
else
  # Can't determine the range (first deploy / unreachable SHA) → build.
  exit 1
fi
