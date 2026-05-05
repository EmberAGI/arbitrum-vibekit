#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

cluster=""
database_url=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --cluster)
      cluster="${2:-}"
      shift 2
      ;;
    --url)
      database_url="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$cluster" ] || [ -z "$database_url" ]; then
  echo "Usage: bash scripts/smoke/ensure-session-postgres.sh --cluster <pi-runtime|shared-ember> --url postgresql://..." >&2
  exit 1
fi

find_session_root() {
  local dir="$ROOT_DIR"
  while [ "$dir" != "/" ]; do
    if [ "$(basename "$dir")" = "worktrees" ]; then
      dirname "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

SESSION_ROOT="$(find_session_root || true)"
if [ -z "${SESSION_ROOT:-}" ]; then
  echo "Unable to resolve session root from $ROOT_DIR" >&2
  exit 1
fi

eval "$(
  python3 - "$database_url" <<'PY'
import sys
from urllib.parse import urlparse
url = urlparse(sys.argv[1])
host = url.hostname or ""
port = url.port or 5432
user = url.username or ""
db = (url.path or "/").lstrip("/")
if not host or not user or not db:
    raise SystemExit("invalid database url")
print(f"DB_HOST='{host}'")
print(f"DB_PORT='{port}'")
print(f"DB_USER='{user}'")
print(f"DB_NAME='{db}'")
PY
)"

if [ "$DB_HOST" != "127.0.0.1" ] && [ "$DB_HOST" != "localhost" ]; then
  echo "Session Postgres bootstrap only supports localhost targets, got $DB_HOST" >&2
  exit 1
fi

RUNTIME_DIR="$SESSION_ROOT/runtime"
DEBS_DIR="$RUNTIME_DIR/postgres-debs"
PG_RUNTIME_DIR="$RUNTIME_DIR/postgres-runtime"
PG_BIN_DIR="$PG_RUNTIME_DIR/usr/lib/postgresql/17/bin"
PG_BASE_DIR="$RUNTIME_DIR/local-postgres/$cluster"
PG_DATA_DIR="$PG_BASE_DIR/data"
PG_LOG_DIR="$PG_BASE_DIR/logs"
PG_LOG_FILE="$PG_LOG_DIR/postgres.log"
PG_SOCKET_DIR="/tmp/${USER:-user}-$(basename "$SESSION_ROOT")-$cluster"

mkdir -p "$DEBS_DIR" "$PG_LOG_DIR" "$PG_SOCKET_DIR"

if [ ! -x "$PG_BIN_DIR/postgres" ]; then
  if ! command -v apt >/dev/null 2>&1 || ! command -v dpkg-deb >/dev/null 2>&1; then
    echo "Need apt and dpkg-deb to bootstrap session Postgres runtime." >&2
    exit 1
  fi

  (
    cd "$DEBS_DIR"
    apt download postgresql-17 postgresql-client-17 >/dev/null
  )

  rm -rf "$PG_RUNTIME_DIR"
  mkdir -p "$PG_RUNTIME_DIR"
  dpkg-deb -x "$DEBS_DIR"/postgresql-17_*.deb "$PG_RUNTIME_DIR"
  dpkg-deb -x "$DEBS_DIR"/postgresql-client-17_*.deb "$PG_RUNTIME_DIR"
fi

if [ ! -f "$PG_DATA_DIR/PG_VERSION" ]; then
  mkdir -p "$PG_DATA_DIR"
  "$PG_BIN_DIR/initdb" \
    -D "$PG_DATA_DIR" \
    --username="$DB_USER" \
    --auth-host=trust \
    --auth-local=trust \
    --encoding=UTF8 \
    --locale=C.UTF-8 >/dev/null
fi

if ! "$PG_BIN_DIR/pg_isready" -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1; then
  "$PG_BIN_DIR/pg_ctl" \
    -D "$PG_DATA_DIR" \
    -l "$PG_LOG_FILE" \
    -o "-p $DB_PORT -h 127.0.0.1 -k $PG_SOCKET_DIR" \
    start >/dev/null
fi

for _ in $(seq 1 40); do
  if "$PG_BIN_DIR/pg_isready" -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

database_exists="$(
  "$PG_BIN_DIR/psql" "postgresql://$DB_USER@127.0.0.1:$DB_PORT/postgres" -tAc \
    "select 1 from pg_database where datname = '$DB_NAME'"
)"

if [ "$database_exists" != "1" ]; then
  "$PG_BIN_DIR/createdb" -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
fi

echo "READY cluster=$cluster url=$database_url"
