-- =====================================================================
-- 02_seed.sql : jeu de donnees de demonstration genere en SQL pur
--   ~1 500 utilisateurs, 20 salles, 300 evenements, 900 categories,
--   ~24 000 billets. Execute AVANT les triggers (chargement en masse).
-- Mot de passe de tous les comptes de demo : password123 (hash bcrypt)
-- =====================================================================
USE billeterie;
SET SESSION cte_max_recursion_depth = 100000;

SET @pwd := '$2b$10$Hc9fdrjSrYUkgYwrtau1KOtov/DSSokyXpiPoiQhZKR4e1cTd3jmu';

-- Comptes fixes de demonstration (ids 1, 2, 3)
INSERT INTO users (lastName, name, email, password, role) VALUES
('Admin',  'Admin', 'admin@ticketmaster.local', @pwd, 'admin'),
('Dupont', 'Jean',  'jean@example.com',         @pwd, 'user'),
('Martin', 'Alice', 'alice@example.com',        @pwd, 'user');

-- 1 500 utilisateurs generes (ids 4 a 1503)
INSERT INTO users (lastName, name, email, password)
WITH RECURSIVE seq (n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 1500
)
SELECT
    ELT(1 + FLOOR(n / 20) % 20, 'Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau',
        'Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier'),
    ELT(1 + n % 20, 'Lucas','Emma','Hugo','Lea','Louis','Chloe','Jules','Manon','Adam','Camille',
        'Nathan','Sarah','Ethan','Ines','Leo','Zoe','Arthur','Lola','Paul','Juliette'),
    CONCAT('user', n, '@example.com'),
    @pwd
FROM seq;

-- 20 salles reparties en France
INSERT INTO location (name, adress, city, nbQuantity) VALUES
('Zenith Paris',        '211 Avenue Jean Jaures',           'Paris',        6300),
('Accor Arena',         '8 Boulevard de Bercy',             'Paris',       20300),
('Olympia',             '28 Boulevard des Capucines',       'Paris',        2000),
('Halle Tony Garnier',  '20 Place Docteur Hermann Gaudier', 'Lyon',        17000),
('Le Transbordeur',     '3 Boulevard de Stalingrad',        'Lyon',         1900),
('Orange Velodrome',    '3 Boulevard Michelet',             'Marseille',   67000),
('Le Dome',             '48 Avenue de Saint-Menet',         'Marseille',    8500),
('Zenith Toulouse',     '11 Avenue Raymond Badiou',         'Toulouse',    11000),
('Le Bikini',           'Rue Theodore Monod',               'Toulouse',     1500),
('Zenith Nantes',       'Boulevard Paul Chabas',            'Nantes',       9000),
('Stereolux',           '4 Boulevard Leon Bureau',          'Nantes',       1200),
('Zenith Strasbourg',   '1 Rue du Zenith',                  'Strasbourg',  12000),
('La Laiterie',         '13 Rue du Hohwald',                'Strasbourg',   1500),
('Zenith Lille',        '1 Boulevard des Cites Unies',      'Lille',        7000),
('Le Aeronef',          'Avenue Willy Brandt',              'Lille',        1500),
('Rockstore',           '20 Rue de Verdun',                 'Montpellier',   800),
('Zenith Montpellier',  'Avenue Albert Einstein',           'Montpellier',  7000),
('Le Rocher de Palmer', '1 Rue Aristide Briand',            'Bordeaux',     1200),
('Arkea Arena',         'Avenue de Lattre de Tassigny',     'Bordeaux',    11000),
('Zenith Rouen',        'Rue Gustave Eiffel',               'Rouen',        7000);

-- 300 evenements : 40 artistes en tournee (meme liste, meme ordre, dans
-- api/scripts/seed-mongo.js), dates de -100 a +299 jours autour d'aujourd'hui
INSERT INTO event (artist, idLocation, eventDate)
WITH RECURSIVE seq (n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 300
)
SELECT
    ELT(1 + (n - 1) % 40,
        'Daft Punk','Phoenix','Justice','Air','M83','Stromae','Angele','Christine and the Queens','Indochine','Jain',
        'Orelsan','Nekfeu','PNL','Aya Nakamura','Maitre Gims','Zaz','Louane','Vianney','Julien Dore','Cats on Trees',
        'Coldplay','Muse','Arctic Monkeys','Imagine Dragons','The Weeknd','Dua Lipa','Billie Eilish','Harry Styles','Ed Sheeran','Adele',
        'David Guetta','Martin Garrix','Calvin Harris','Kavinsky','Carpenter Brut','Gojira','Mass Hysteria','Shaka Ponk','Tryo','Ben Mazue'),
    1 + (n * 7) % 20,
    DATE_ADD(DATE(NOW()), INTERVAL ((n * 37 + 100) % 400 - 100) DAY) + INTERVAL 20 HOUR
FROM seq;

-- 3 categories par evenement
INSERT INTO category (idEvent, name, price, nbQuantity)
SELECT e.id,
       ELT(k.k, 'Fosse', 'Balcon', 'Carre Or'),
       ELT(k.k, 39.90, 59.90, 99.90) + (e.id % 5) * 10,
       ELT(k.k, 300, 150, 40)
FROM event e
JOIN (SELECT 1 AS k UNION ALL SELECT 2 UNION ALL SELECT 3) k;

-- 24 000 billets repartis uniformement (26 ou 27 par categorie) ; 1 sur 40 est annule
INSERT INTO ticket (idUser, idCategory, pricePaid, isDeleted, createAt)
WITH RECURSIVE seq (n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 24000
)
SELECT
    1 + (seq.n * 104729) % 1503,
    c.id,
    c.price,
    seq.n % 40 = 0,
    NOW() - INTERVAL ((seq.n * 7919) % 259200) MINUTE      -- sur les 180 derniers jours
FROM seq
JOIN category c ON c.id = 1 + (seq.n * 7919) % 900;

-- Demo "complet" : la categorie Carre Or du 1er evenement est epuisee
UPDATE category c
JOIN (SELECT idCategory, COUNT(*) AS sold FROM ticket WHERE isDeleted = FALSE GROUP BY idCategory) s
  ON s.idCategory = c.id
SET c.nbQuantity = s.sold
WHERE c.idEvent = 1 AND c.name = 'Carre Or';
