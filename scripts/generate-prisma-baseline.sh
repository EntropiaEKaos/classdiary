#!/usr/bin/env bash
set -euo pipefail

BASELINE_DIR="prisma/migrations/20260930_baseline"
BASELINE_SQL="$BASELINE_DIR/migration.sql"
LOCK_FILE="prisma/migrations/migration_lock.toml"

if [[ -f "$BASELINE_SQL" ]]; then
  echo "Baseline já existe em $BASELINE_SQL"
  exit 0
fi

mkdir -p "$BASELINE_DIR"

npx prisma migrate diff   --from-empty   --to-schema prisma/schema.prisma   --script > "$BASELINE_SQL"

if ! grep -q "CREATE TABLE" "$BASELINE_SQL"; then
  echo "Baseline gerada sem CREATE TABLE; abortando."
  rm -f "$BASELINE_SQL"
  exit 1
fi

if [[ ! -f "$LOCK_FILE" ]]; then
  cat > "$LOCK_FILE" <<'EOF'
provider = "postgresql"
EOF
fi

echo "Baseline gerada: $BASELINE_SQL"
