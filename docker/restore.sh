set -euo pipefail
SRC="${1:?usage: restore.sh <dossier de sauvegarde>}"

docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" billeterie' < "$SRC/mysql.sql"

docker compose exec -T mongo sh -c \
  'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < "$SRC/mongo.archive.gz"

echo "Restauration terminee depuis $SRC"
