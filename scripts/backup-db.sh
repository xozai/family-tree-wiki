#!/bin/sh
# Backup the PostgreSQL database to a timestamped gzip file.
# Requires Docker to be running with the postgres container.
#
# Usage:
#   ./scripts/backup-db.sh
#
# Environment (optional overrides):
#   POSTGRES_CONTAINER  name of the postgres container (default: family-tree-postgres)
#   POSTGRES_USER       database user               (default: familytree)
#   POSTGRES_DB         database name               (default: familytree)
#   BACKUP_DIR          directory for backup files  (default: ./backups)
#   RETENTION_DAYS      days to keep backups        (default: 30)
set -e

CONTAINER="${POSTGRES_CONTAINER:-family-tree-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_USER="${POSTGRES_USER:-familytree}"
DB_NAME="${POSTGRES_DB:-familytree}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y-%m-%d_%H-%M)
FILE="${BACKUP_DIR}/${DATE}.sql.gz"

echo "Backing up ${DB_NAME} from container ${CONTAINER}..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILE"
echo "Backup written to: $FILE ($(du -h "$FILE" | cut -f1))"

# Remove backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "Removed backups older than ${RETENTION_DAYS} days."
