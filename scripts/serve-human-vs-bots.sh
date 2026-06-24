#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-4180}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="$ROOT_DIR/demo/human-vs-bots"

if [[ ! -f "$DEMO_DIR/index.html" ]]; then
  echo "[serve-human-vs-bots] No se encontró $DEMO_DIR/index.html"
  echo "Asegúrate de tener el demo compilado/copiado en demo/human-vs-bots"
  exit 1
fi

echo "[serve-human-vs-bots] Serving $DEMO_DIR on http://127.0.0.1:$PORT"
python3 -m http.server "$PORT" --directory "$DEMO_DIR"
