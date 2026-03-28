#!/usr/bin/env bash
set -euo pipefail

CARGO_TOML="Cargo.toml"

current_version() {
  grep '^version' "$CARGO_TOML" | head -1 | sed 's/.*"\(.*\)".*/\1/'
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [<version> | patch | minor | major]

Sets the release version, commits, tags, and pushes to trigger the GitHub Actions release.

  <version>   Set an explicit version (e.g. 1.2.3)
  patch       Bump patch: 0.1.0 -> 0.1.1
  minor       Bump minor: 0.1.0 -> 0.2.0
  major       Bump major: 0.1.0 -> 1.0.0

Current version: $(current_version)
EOF
  exit 1
}

[ $# -eq 1 ] || usage

CURRENT=$(current_version)
IFS='.' read -r CUR_MAJOR CUR_MINOR CUR_PATCH <<< "$CURRENT"

case "$1" in
  patch) NEW_VERSION="$CUR_MAJOR.$CUR_MINOR.$((CUR_PATCH + 1))" ;;
  minor) NEW_VERSION="$CUR_MAJOR.$((CUR_MINOR + 1)).0" ;;
  major) NEW_VERSION="$((CUR_MAJOR + 1)).0.0" ;;
  *)
    if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      NEW_VERSION="$1"
    else
      echo "Error: invalid version '$1'"
      usage
    fi
    ;;
esac

TAG="v$NEW_VERSION"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag $TAG already exists"
  exit 1
fi

echo "Version: $CURRENT -> $NEW_VERSION"
echo "Tag:     $TAG"
echo ""

# Update Cargo.toml
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "s/^version = \"$CURRENT\"/version = \"$NEW_VERSION\"/" "$CARGO_TOML"
else
  sed -i "s/^version = \"$CURRENT\"/version = \"$NEW_VERSION\"/" "$CARGO_TOML"
fi

# Update Cargo.lock
cargo generate-lockfile --quiet 2>/dev/null || cargo check --quiet 2>/dev/null || true

echo "Updated $CARGO_TOML to $NEW_VERSION"

# Commit and tag
git add "$CARGO_TOML" Cargo.lock
git commit -m "release: v$NEW_VERSION"
git tag -a "$TAG" -m "Release $TAG"

echo ""
echo "Committed and tagged $TAG"
echo ""

# Push
read -rp "Push commit and tag to origin? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  git push origin HEAD
  git push origin "$TAG"
  echo ""
  echo "Pushed. GitHub Actions release workflow will start shortly."
else
  echo ""
  echo "Skipped push. When ready, run:"
  echo "  git push origin HEAD && git push origin $TAG"
fi
