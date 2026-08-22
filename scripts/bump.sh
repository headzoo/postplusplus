#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 <major|minor|patch>" >&2
  exit 1
}

if [[ $# -ne 1 ]]; then
  usage
fi

TYPE="$1"
case "$TYPE" in
  major|minor|patch) ;;
  *)
    echo "Error: invalid bump type '$TYPE'. Expected major, minor, or patch." >&2
    usage
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f package.json ]]; then
  echo "Error: package.json not found in $ROOT_DIR" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository" >&2
  exit 1
fi

CURRENT="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1)"

if [[ ! "$CURRENT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: current version '$CURRENT' is not a valid X.Y.Z semver" >&2
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<<"$CURRENT"

case "$TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW="${MAJOR}.${MINOR}.${PATCH}"
TAG="v${NEW}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag $TAG already exists" >&2
  exit 1
fi

sed -i "s/\"version\": \"${CURRENT}\"/\"version\": \"${NEW}\"/" package.json

if ! grep -q "\"version\": \"${NEW}\"" package.json; then
  echo "Error: failed to update version in package.json" >&2
  exit 1
fi

git add package.json
git commit -m "Bumps to version ${TAG}"
git tag "$TAG"
git push
git push --tags

echo "Bumped ${CURRENT} -> ${NEW} (${TYPE}) and pushed commit + tag ${TAG}"
