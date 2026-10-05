-- =====================================================================
-- 03_views.sql : vues utilisees par l'application
-- =====================================================================
USE billeterie;

-- Detail des billets actifs (page "Mes billets")
CREATE OR REPLACE VIEW v_ticket_details AS
SELECT
    t.id            AS ticketId,
    t.createAt      AS ticketCreateAt,
    t.pricePaid     AS pricePaid,
    u.id            AS userId,
    CONCAT(u.name, ' ', u.lastName) AS userFullName,
    e.id            AS eventId,
    e.artist        AS eventArtist,
    e.eventDate     AS eventDate,
    l.name          AS locationName,
    l.city          AS locationCity,
    c.id            AS categoryId,
    c.name          AS categoryName
FROM ticket t
JOIN users u    ON u.id = t.idUser
JOIN category c ON c.id = t.idCategory
JOIN event e    ON e.id = c.idEvent
JOIN location l ON l.id = e.idLocation
WHERE t.isDeleted = FALSE;

-- Stock par categorie (LEFT JOIN : une categorie sans vente apparait avec 0)
CREATE OR REPLACE VIEW v_category_sold AS
SELECT
    c.id            AS categoryId,
    c.idEvent       AS eventId,
    c.name          AS categoryName,
    c.price         AS price,
    c.nbQuantity    AS totalQuantity,
    COALESCE(sold.soldCount, 0)                  AS soldCount,
    c.nbQuantity - COALESCE(sold.soldCount, 0)   AS availableCount
FROM category c
LEFT JOIN (
    SELECT idCategory, COUNT(*) AS soldCount
    FROM ticket
    WHERE isDeleted = FALSE
    GROUP BY idCategory
) sold ON sold.idCategory = c.id
WHERE c.isDeleted = FALSE;

-- Catalogue des evenements avec agregats de vente (page d'accueil + API)
CREATE OR REPLACE VIEW v_show_event AS
SELECT
    e.id            AS eventId,
    e.artist        AS artist,
    e.eventDate     AS eventDate,
    l.id            AS locationId,
    l.name          AS locationName,
    l.city          AS locationCity,
    l.adress        AS locationAdress,
    e.createAt      AS eventCreateAt,
    COUNT(t.id)                       AS ticketsSold,
    COALESCE(SUM(t.pricePaid), 0)     AS revenue,
    MIN(c.price)                      AS minPrice
FROM event e
JOIN location l ON l.id = e.idLocation
LEFT JOIN category c ON c.idEvent = e.id AND c.isDeleted = FALSE
LEFT JOIN ticket t   ON t.idCategory = c.id AND t.isDeleted = FALSE
WHERE e.isDeleted = FALSE
GROUP BY e.id, e.artist, e.eventDate, l.id, l.name, l.city, l.adress, e.createAt;
