#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXPORT_PATH="/tmp/website_trials_catalog_$(date -u +%Y%m%d_%H%M%S).json"

python3 "$ROOT_DIR/production_ready_pipeline/website_export.py" --out "$EXPORT_PATH" "$@"
php "$ROOT_DIR/scripts/import_website_catalog.php" "$EXPORT_PATH"

echo "Website catalog synced from $EXPORT_PATH"
