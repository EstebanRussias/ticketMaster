-- =====================================================================
-- 04_functions.sql : logique serveur (fonctions + procedures stockees)
-- Les procedures s'executent avec les droits de leur definisseur
-- (SQL SECURITY DEFINER) : l'application n'a donc pas besoin de droits
-- d'ecriture directs sur la table `ticket`.
-- =====================================================================
USE billeterie;

DELIMITER $$

-- Places restantes dans une categorie
CREATE FUNCTION fn_available_seats(p_category INT) RETURNS INT
READS SQL DATA
BEGIN
    DECLARE v_total INT DEFAULT 0;
    DECLARE v_sold  INT DEFAULT 0;
    SELECT nbQuantity INTO v_total FROM category WHERE id = p_category;
    SELECT COUNT(*) INTO v_sold FROM ticket WHERE idCategory = p_category AND isDeleted = FALSE;
    RETURN COALESCE(v_total, 0) - v_sold;
END$$

-- Chiffre d'affaires d'un evenement (billets non annules)
CREATE FUNCTION fn_event_revenue(p_event INT) RETURNS DECIMAL(12,2)
READS SQL DATA
BEGIN
    DECLARE v_rev DECIMAL(12,2);
    SELECT COALESCE(SUM(t.pricePaid), 0) INTO v_rev
    FROM ticket t JOIN category c ON c.id = t.idCategory
    WHERE c.idEvent = p_event AND t.isDeleted = FALSE;
    RETURN v_rev;
END$$

-- Achat d'un billet : transaction + verrou de ligne (evite la survente)
CREATE PROCEDURE sp_buy_ticket(IN p_user INT, IN p_category INT, OUT p_ticket_id INT)
BEGIN
    DECLARE v_price DECIMAL(10,2);
    DECLARE v_found INT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT c.price, 1 INTO v_price, v_found
    FROM category c JOIN event e ON e.id = c.idEvent
    WHERE c.id = p_category AND c.isDeleted = FALSE
      AND e.isDeleted = FALSE AND e.eventDate > NOW()
    FOR UPDATE;

    IF v_found = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Categorie introuvable ou evenement termine';
    END IF;
    IF fn_available_seats(p_category) <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Plus de places disponibles pour cette categorie';
    END IF;

    INSERT INTO ticket (idUser, idCategory, pricePaid) VALUES (p_user, p_category, v_price);
    SET p_ticket_id = LAST_INSERT_ID();

    COMMIT;
END$$

-- Annulation d'un billet par son proprietaire (suppression logique)
CREATE PROCEDURE sp_cancel_ticket(IN p_ticket INT, IN p_user INT)
BEGIN
    UPDATE ticket SET isDeleted = TRUE
    WHERE id = p_ticket AND idUser = p_user AND isDeleted = FALSE;

    IF ROW_COUNT() = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Billet introuvable ou deja annule';
    END IF;
END$$

DELIMITER ;
