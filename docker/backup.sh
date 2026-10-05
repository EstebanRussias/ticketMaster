#!/usr/bin/env bash
# Sauvegarde logique des deux bases dans backups/<horodatage>/ (depuis la racine du depot).
#   ./docker/backup.sh            -> backups/20261005-103000/
set -euo pipefail
OUT="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"

# MySQL : transaction unique = copie coherente sans verrouiller les ecritures
docker compose exec -T mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers billeterie' > "$OUT/mysql.sql"

# MongoDB : archive compressee de la base applicative
docker compose exec -T mongo sh -c \
  'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db ticketmaster --archive --gzip' > "$OUT/mongo.archive.gz"

echo "Sauvegarde ecrite dans $OUT"
