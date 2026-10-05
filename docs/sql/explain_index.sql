-- Mesure EXPLAIN ANALYZE avant / apres l'index idx_ticket_created.
-- Execution : docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" billeterie' < docs/sql/explain_index.sql
DROP INDEX idx_ticket_created ON ticket;

-- AVANT : pas d'index sur createAt
EXPLAIN ANALYZE
SELECT DATE(createAt) AS day, COUNT(*) AS tickets, SUM(pricePaid) AS revenue
FROM ticket
WHERE createAt >= NOW() - INTERVAL 7 DAY AND isDeleted = FALSE
GROUP BY DATE(createAt);

CREATE INDEX idx_ticket_created ON ticket(createAt);

-- APRES
EXPLAIN ANALYZE
SELECT DATE(createAt) AS day, COUNT(*) AS tickets, SUM(pricePaid) AS revenue
FROM ticket
WHERE createAt >= NOW() - INTERVAL 7 DAY AND isDeleted = FALSE
GROUP BY DATE(createAt);
