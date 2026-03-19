#!/bin/sh
# Restore the PostgreSQL database from a gzip backup file.
# WARNING: This drops and recreates the database — all existing data is lost.
#
# Usage:
#   ./scripts/restore-db.sh <backup-file.sql.gz>
#
# Environment (optional overrides):
#   POSTGRES_CONTAINER  name of the postgres container (default: family-tree-postgres)
#   POSTGRES_USER       database user               (default: familytree)
#   POSTGRES_DB         database name               (default: familytree)
set -e

FILE="$1"
if [ -z "$FILE" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Error: File not found: $FILE"
  exit 1
fi

CONTAINER="${POSTGRES_CONTAINER:-family-tree-postgres}"
DB_USER="${POSTGRES_USER:-familytree}"
DB_NAME="${POSTGRES_DB:-familytree}"

echo ""
echo "WARNING: This will DROP and recreate the '${DB_NAME}' database."
echo "All existing data will be permanently lost."
echo ""
printf "Type 'yes' to confirm: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "Dropping and recreating database '${DB_NAME}'..."
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" \
  -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";"

echo "Restoring from ${FILE}..."
gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"

echo "Restore complete."
