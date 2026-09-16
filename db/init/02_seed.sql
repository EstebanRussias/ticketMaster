USE billeterie;

-- password hash below is bcrypt for "password123" (used by the Node app to authenticate)
INSERT INTO users (lastName, name, password) VALUES
('Dupont', 'Jean', '$2b$10$Hc9fdrjSrYUkgYwrtau1KOtov/DSSokyXpiPoiQhZKR4e1cTd3jmu'),
('Martin', 'Alice', '$2b$10$Hc9fdrjSrYUkgYwrtau1KOtov/DSSokyXpiPoiQhZKR4e1cTd3jmu');

INSERT INTO location (adress, name, nbQuantity) VALUES
('1 Rue de la Musique, Paris', 'Zenith Paris', 6000),
('12 Avenue du Stade, Lyon', 'Halle Tony Garnier', 4500);

INSERT INTO event (artist, idLocation) VALUES
('Daft Punk', 1),
('Phoenix', 2),
('Justice', 1);

INSERT INTO category (price, nbQuantity, name, numPlace) VALUES
(49.90, 3000, 'Fosse', 'F'),
(89.90, 1000, 'Carre Or', 'C'),
(69.90, 1500, 'Balcon', 'B');

INSERT INTO ticket (idEvent, idUser, idCategory) VALUES
(1, 1, 1),
(1, 2, 2),
(2, 1, 3);
