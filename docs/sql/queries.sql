-- Requetes significatives (MySQL). Execution :
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" billeterie' < docs/sql/queries.sql
-- Les memes requetes sont exposees par l'API (api/src/services/sql.js).

-- Q1. JOINTURES internes + GROUP BY / HAVING : CA par ville (villes > 200 000 EUR)
SELECT l.city, COUNT(DISTINCT e.id) AS events, COUNT(t.id) AS tickets, SUM(t.pricePaid) AS revenue
FROM location l
JOIN event e    ON e.idLocation = l.id AND e.isDeleted = FALSE
JOIN category c ON c.idEvent = e.id
JOIN ticket t   ON t.idCategory = c.id AND t.isDeleted = FALSE
GROUP BY l.city
HAVING SUM(t.pricePaid) > 200000
ORDER BY revenue DESC;

-- Q2. CTE + fonction de fenetre : classement des meilleurs clients
WITH spend AS (
    SELECT idUser, COUNT(*) AS tickets, SUM(pricePaid) AS total
    FROM ticket WHERE isDeleted = FALSE GROUP BY idUser
)
SELECT RANK() OVER (ORDER BY s.total DESC) AS rang, u.name, u.lastName, s.tickets, s.total
FROM spend s JOIN users u ON u.id = s.idUser
ORDER BY s.total DESC LIMIT 10;

-- Q3. NOT EXISTS : evenements a venir sans aucune vente
SELECT e.id, e.artist, e.eventDate
FROM event e
WHERE e.isDeleted = FALSE AND e.eventDate > NOW()
  AND NOT EXISTS (SELECT 1 FROM ticket t JOIN category c ON c.id = t.idCategory
                  WHERE c.idEvent = e.id AND t.isDeleted = FALSE);

-- Q4. Sous-requete correlee : categories plus cheres que la moyenne de leur evenement
SELECT c.id, e.artist, c.name, c.price
FROM category c JOIN event e ON e.id = c.idEvent
WHERE c.price > (SELECT AVG(c2.price) FROM category c2 WHERE c2.idEvent = c.idEvent)
ORDER BY c.price DESC LIMIT 10;

-- Q5. JOINTURE EXTERNE (LEFT JOIN) : taux de remplissage, y compris categories sans vente
SELECT e.artist, c.name, c.nbQuantity, COUNT(t.id) AS sold,
       ROUND(100 * COUNT(t.id) / c.nbQuantity, 1) AS fill_pct
FROM category c
JOIN event e ON e.id = c.idEvent
LEFT JOIN ticket t ON t.idCategory = c.id AND t.isDeleted = FALSE
GROUP BY c.id, e.artist, c.name, c.nbQuantity
ORDER BY fill_pct DESC LIMIT 10;

-- Q6. Fonctions et vue
SELECT fn_available_seats(3) AS places_restantes, fn_event_revenue(1) AS ca_evenement_1;
SELECT * FROM v_show_event ORDER BY ticketsSold DESC LIMIT 5;
