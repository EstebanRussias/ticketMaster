#!/usr/bin/env bash
# Restaure les deux bases depuis un dossier cree par backup.sh.
#   ./docker/restore.sh backups/20261005-103000
set -euo pipefail
SRC="${1:?usage: restore.sh <dossier de sauvegarde>}"

# MySQL : le dump contient DROP TABLE / CREATE TABLE, triggers et procedures
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" billeterie' < "$SRC/mysql.sql"

# MongoDB : --drop remplace les collections existantes
docker compose exec -T mongo sh -c \
  'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < "$SRC/mongo.archive.gz"

echo "Restauration terminee depuis $SRC"
