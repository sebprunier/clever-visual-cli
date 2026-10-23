#!/usr/bin/env bash
# Builds the site published on GitHub Pages (#27) into one folder:
#   <out>/            the latest release, built from its tag, with its documentation under docs/
#   <out>/snapshot/   main (the current checkout), with its own documentation under snapshot/docs/
# Pages serves one artifact per repository, so every deployment carries both.
#
# Usage: scripts/site/build.sh [out]   (default _site)
# CVC_SITE_BASE is the path the site is served under (default /clever-visual-cli/);
# CVC_RELEASE_TAG skips the lookup of the latest release (which needs gh).
set -euo pipefail

out=${1:-_site}
base=${CVC_SITE_BASE:-/clever-visual-cli/}
tag=${CVC_RELEASE_TAG:-$(gh release view --repo sebprunier/clever-visual-cli --json tagName --jq .tagName)}
root=$(git rev-parse --show-toplevel)
if [ -n "$(ls -A "$out" 2>/dev/null)" ]; then
  echo "$out is not empty: remove it first" >&2
  exit 1
fi
release=$(mktemp -d)/release

cleanup() { git -C "$root" worktree remove --force "$release" 2>/dev/null || true; }
trap cleanup EXIT

echo "Release $tag at $base"
git -C "$root" worktree add --detach "$release" "$tag"
(
  cd "$release"
  pnpm install --frozen-lockfile
  CVC_BASE=$base pnpm build
  CVC_BASE=$base pnpm docs:build
)

echo "Snapshot $(git -C "$root" rev-parse --short HEAD) at ${base}snapshot/"
(
  cd "$root"
  CVC_BASE=${base}snapshot/ CVC_CHANNEL=snapshot pnpm build
  CVC_BASE=${base}snapshot/ CVC_CHANNEL=snapshot pnpm docs:build
)

mkdir -p "$out"
cp -R "$release/dist/." "$out/"
mkdir -p "$out/snapshot"
cp -R "$root/dist/." "$out/snapshot/"
echo "Site ready in $out"
