#!/usr/bin/env bash
# Populate a Hugging Face Space repo with the UrbanLens engine.
#
#   bash deploy/hf-space/assemble.sh ../urbanlens-space
#
# The target should be a fresh clone of your Space:
#   git clone https://huggingface.co/spaces/<user>/<space> ../urbanlens-space
#
# Copies only what the engine reads. The GitHub repo is private, so the data
# cannot be cloned at build time and travels in the Space repo instead; HF is
# git-LFS native, which is what makes that practical.
set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: bash deploy/hf-space/assemble.sh <path-to-space-clone>" >&2
  exit 2
fi
if [ ! -d "$TARGET/.git" ]; then
  echo "error: $TARGET is not a git clone. Clone your Space there first." >&2
  exit 2
fi

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "source: $SRC"
echo "target: $TARGET"

# LFS must be configured before the large files are staged, or they go in as
# plain blobs and the push is rejected.
git -C "$TARGET" lfs install --local
cat > "$TARGET/.gitattributes" <<'ATTR'
*_streets.json filter=lfs diff=lfs merge=lfs -text
*_buildings.json filter=lfs diff=lfs merge=lfs -text
*.tif filter=lfs diff=lfs merge=lfs -text
*.json.gz filter=lfs diff=lfs merge=lfs -text
*.pkl.gz filter=lfs diff=lfs merge=lfs -text
ATTR

cp "$SRC/deploy/engine/Dockerfile" "$TARGET/Dockerfile"
cp "$SRC/deploy/hf-space/README.md"  "$TARGET/README.md"

# backend/ minus the local SQLite cache and build detritus. The DB is a cache,
# not a source: absent it, the loader reads the GeoJSON layers directly.
# tar rather than rsync -- Git Bash on Windows ships tar but not rsync.
copy_tree() {  # copy_tree <relative-path> [extra tar --exclude args...]
  local rel="$1"; shift
  rm -rf "${TARGET:?}/$rel"
  mkdir -p "$TARGET/$(dirname "$rel")"
  tar -cf - -C "$SRC"       --exclude='__pycache__' --exclude='.pytest_cache'       "$@" "$rel" | tar -xf - -C "$TARGET"
}

copy_tree backend   --exclude='urbanlens.db' --exclude='urbanlens.db-shm'   --exclude='urbanlens.db-wal' --exclude='backend/cache'

# DEM / GHSL / Esri raster tiles read by flood.py and the growth model.
copy_tree datasets

# OSM + census layers. Not web/public/data -- those are the frontend's prebuilt
# bootstrap payloads and Vercel serves them.
copy_tree web/data/engine

echo
echo "assembled:"
du -sh "$TARGET/backend" "$TARGET/datasets" "$TARGET/web/data/engine" 2>/dev/null
echo
echo "next:"
echo "  cd $TARGET"
echo "  git add -A && git commit -m 'UrbanLens engine'"
echo "  git push          # username = your HF username, password = a WRITE token"
