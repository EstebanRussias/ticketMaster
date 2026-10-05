set -euo pipefail
OUT="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"

docker compose exec -T mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers billeterie' > "$OUT/mysql.sql"

docker compose exec -T mongo sh -c \
  'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db ticketmaster --archive --gzip' > "$OUT/mongo.archive.gz"

echo "Sauvegarde ecrite dans $OUT"
