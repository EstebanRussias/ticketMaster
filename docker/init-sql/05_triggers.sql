-- =====================================================================
-- 05_triggers.sql : declencheurs (cree APRES le peuplement en masse)
-- =====================================================================
USE billeterie;

DELIMITER $$

-- Garde-fou : meme un INSERT direct ne peut pas depasser le stock
CREATE TRIGGER trg_ticket_before_insert
BEFORE INSERT ON ticket
FOR EACH ROW
BEGIN
    IF fn_available_seats(NEW.idCategory) <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock epuise pour cette categorie';
    END IF;
END$$

-- Audit des achats
CREATE TRIGGER trg_ticket_after_insert
AFTER INSERT ON ticket
FOR EACH ROW
BEGIN
    INSERT INTO ticket_audit (idTicket, idUser, action) VALUES (NEW.id, NEW.idUser, 'PURCHASE');
END$$

-- Audit des annulations
CREATE TRIGGER trg_ticket_after_update
AFTER UPDATE ON ticket
FOR EACH ROW
BEGIN
    IF OLD.isDeleted = FALSE AND NEW.isDeleted = TRUE THEN
        INSERT INTO ticket_audit (idTicket, idUser, action) VALUES (NEW.id, NEW.idUser, 'CANCEL');
    END IF;
END$$

-- Suppression logique d'un evenement : cascade sur categories et billets
CREATE TRIGGER trg_event_after_update
AFTER UPDATE ON event
FOR EACH ROW
BEGIN
    IF OLD.isDeleted = FALSE AND NEW.isDeleted = TRUE THEN
        UPDATE ticket t JOIN category c ON c.id = t.idCategory
        SET t.isDeleted = TRUE
        WHERE c.idEvent = NEW.id AND t.isDeleted = FALSE;

        UPDATE category SET isDeleted = TRUE WHERE idEvent = NEW.id;
    END IF;
END$$

DELIMITER ;
