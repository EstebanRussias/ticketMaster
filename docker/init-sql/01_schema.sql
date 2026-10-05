-- =====================================================================
-- 01_schema.sql : MPD de la base relationnelle (MySQL 8) - billetterie
-- La base `billeterie` est creee par la variable MYSQL_DATABASE.
-- =====================================================================
USE billeterie;

-- Utilisateurs de la plateforme (role = droits fonctionnels dans l'API)
CREATE TABLE users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    lastName    VARCHAR(100) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(190) NOT NULL,
    password    VARCHAR(255) NOT NULL,                 -- hash bcrypt, jamais en clair
    role        ENUM('user','admin') NOT NULL DEFAULT 'user',
    isDeleted   BOOLEAN NOT NULL DEFAULT FALSE,        -- suppression logique
    createAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updateAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email CHECK (email LIKE '%_@_%._%')
);

-- Salles de spectacle
CREATE TABLE location (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    adress      VARCHAR(255) NOT NULL,
    city        VARCHAR(100) NOT NULL,
    nbQuantity  INT NOT NULL,                          -- capacite maximale de la salle
    isDeleted   BOOLEAN NOT NULL DEFAULT FALSE,
    createAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updateAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_location_name UNIQUE (name),
    CONSTRAINT ck_location_capacity CHECK (nbQuantity > 0)
);

-- Evenements (concerts). Le contenu editorial (description, line-up, avis)
-- est stocke dans MongoDB, indexe par cet `id`.
CREATE TABLE event (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    artist      VARCHAR(150) NOT NULL,
    idLocation  INT NOT NULL,
    eventDate   DATETIME NOT NULL,
    isDeleted   BOOLEAN NOT NULL DEFAULT FALSE,
    createAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updateAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_event_location FOREIGN KEY (idLocation) REFERENCES location(id)
);

-- Categories de places, propres a chaque evenement (Fosse, Balcon...)
CREATE TABLE category (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    idEvent     INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    price       DECIMAL(10,2) NOT NULL,
    nbQuantity  INT NOT NULL,                          -- stock de places de la categorie
    isDeleted   BOOLEAN NOT NULL DEFAULT FALSE,
    createAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updateAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_category_event FOREIGN KEY (idEvent) REFERENCES event(id),
    CONSTRAINT uq_category_event_name UNIQUE (idEvent, name),
    CONSTRAINT ck_category_price CHECK (price >= 0),
    CONSTRAINT ck_category_qty CHECK (nbQuantity > 0)
);

-- Billets vendus. L'evenement se deduit de la categorie (3NF).
CREATE TABLE ticket (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    idUser      INT NOT NULL,
    idCategory  INT NOT NULL,
    pricePaid   DECIMAL(10,2) NOT NULL,                -- prix fige au moment de l'achat
    isDeleted   BOOLEAN NOT NULL DEFAULT FALSE,        -- TRUE = billet annule
    createAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updateAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ticket_user FOREIGN KEY (idUser) REFERENCES users(id),
    CONSTRAINT fk_ticket_category FOREIGN KEY (idCategory) REFERENCES category(id),
    CONSTRAINT ck_ticket_price CHECK (pricePaid >= 0)
);

-- Journal d'audit alimente par des triggers (achats / annulations)
CREATE TABLE ticket_audit (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    idTicket    INT NOT NULL,
    idUser      INT NOT NULL,
    action      ENUM('PURCHASE','CANCEL') NOT NULL,
    createAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index sur les cles etrangeres et les colonnes filtrees
CREATE INDEX idx_event_location  ON event(idLocation);
CREATE INDEX idx_event_date      ON event(eventDate);
CREATE INDEX idx_category_event  ON category(idEvent);
CREATE INDEX idx_ticket_user     ON ticket(idUser);
CREATE INDEX idx_ticket_category ON ticket(idCategory, isDeleted);
-- Index "volontaire" mesure avec EXPLAIN ANALYZE avant/apres (voir docs/sql/explain_index.sql)
CREATE INDEX idx_ticket_created  ON ticket(createAt);
