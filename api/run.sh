#!/usr/bin/env bash
set -euo pipefail
export LD_LIBRARY_PATH="${HOME}/.local/lib:${LD_LIBRARY_PATH:-}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -d "$ROOT/.venv" ]]; then
  echo "Create api/.venv first (see README)." >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/.venv/bin/activate"
exec uvicorn app.main:app --host 127.0.0.1 --port 8787 "$@"
