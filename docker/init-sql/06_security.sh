set -e

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<EOSQL
CREATE USER 'app_user'@'%'    IDENTIFIED BY '${APP_DB_PASSWORD}';
CREATE USER 'report_user'@'%' IDENTIFIED BY '${REPORT_DB_PASSWORD}';

-- Role applicatif : lecture partout, ecriture uniquement sur les tables
-- metier, execution des procedures. Aucun DELETE, aucun DDL, aucune
-- ecriture directe sur ticket / ticket_audit (passe par sp_buy_ticket).
GRANT SELECT ON billeterie.* TO 'app_user'@'%';
GRANT INSERT, UPDATE ON billeterie.users    TO 'app_user'@'%';
GRANT INSERT, UPDATE ON billeterie.location TO 'app_user'@'%';
GRANT INSERT, UPDATE ON billeterie.event    TO 'app_user'@'%';
GRANT INSERT, UPDATE ON billeterie.category TO 'app_user'@'%';
GRANT EXECUTE ON billeterie.* TO 'app_user'@'%';

-- Role reporting : uniquement les vues agregees
GRANT SELECT ON billeterie.v_show_event     TO 'report_user'@'%';
GRANT SELECT ON billeterie.v_category_sold  TO 'report_user'@'%';

FLUSH PRIVILEGES;
EOSQL
