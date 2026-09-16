USE billeterie;
CREATE OR REPLACE VIEW v_ticket_details AS
SELECT
    t.id            AS ticketId,
    t.createAt      AS ticketCreateAt,
    u.id            AS userId,
    CONCAT(u.name, ' ', u.lastName) AS userFullName,
    e.id            AS eventId,
    e.artist        AS eventArtist,
    l.name          AS locationName,
    l.adress        AS locationAdress,
    c.id            AS categoryId,
    c.name          AS categoryName,
    c.price         AS categoryPrice
FROM ticket t
JOIN users u    ON u.id = t.idUser
JOIN event e    ON e.id = t.idEvent
JOIN location l ON l.id = e.idLocation
JOIN category c ON c.id = t.idCategory
WHERE t.isDeleted = FALSE;

CREATE OR REPLACE VIEW v_category_sold AS
SELECT
    c.id            AS categoryId,
    c.name          AS categoryName,
    c.price         AS price,
    c.nbQuantity    AS totalQuantity,
    COALESCE(sold.soldCount, 0) AS soldCount,
    c.nbQuantity - COALESCE(sold.soldCount, 0) AS availableCount
FROM category c
LEFT JOIN (
    SELECT idCategory, COUNT(*) AS soldCount
    FROM ticket
    WHERE isDeleted = FALSE
    GROUP BY idCategory
) sold ON sold.idCategory = c.id
WHERE c.isDeleted = FALSE;

CREATE OR REPLACE VIEW v_show_event AS
SELECT
    e.id            AS eventId,
    e.artist        AS artist,
    l.name          AS locationName,
    l.adress        AS locationAdress,
    e.createAt      AS eventCreateAt,
    COUNT(t.id)     AS ticketsSold
FROM event e
JOIN location l ON l.id = e.idLocation
LEFT JOIN ticket t ON t.idEvent = e.id AND t.isDeleted = FALSE
WHERE e.isDeleted = FALSE
GROUP BY e.id, e.artist, l.name, l.adress, e.createAt;
