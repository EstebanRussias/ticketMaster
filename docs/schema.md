# TicketMaster
Plateforme de billetterie de concerts bâtie sur **deux familles de bases de données** :

- **MySQL 8** 
- **MongoDB 7** 

Une **API REST JSON** (Node.js / Express) et un **front web** (EJS) consomment les deux bases plusieurs.

🎬 [Vidéo de présentation](docs/video/)

## Prérequis

- Docker Desktop (ou Docker Engine + plugin Compose v2), ports libres : `3000`, `3306`, `27017`.

Uniquement docker il n'y a pas de Node, MySQL ni MongoDB à installer docker s'occupe de tous.

## Démarrage

```bash
docker compose up --build
```

Au premier lancement (1 à 2 minutes) le build :
1. démarre MySQL et exécute `docker/init-sql/*`
    - insertion des schema
    - insertion des views
    - insertion des functions
2. démarre MongoDB et exécute `docker/init-nosql/01_init.js`
    - collections
    - validateurs 
    - index
    - utilisateur
3. lance le job `seed` qui peuple MongoDB
    - 300 contenus
    - 7 000 avis 
    - 8 000 activités 
4. démarre l'API et le front.

Les valeurs de démonstration par défaut permettent de lancer la pile sans configuration.

## Accès


| Service | URL | USER | Password | BDD |
|---|---|---|---|---|
| Front web | http://localhost:3000 |
| API REST | http://localhost:3000/api (santé : `/api/health`) |
| MySQL | `localhost:3306` (base `billeterie`) |
| MongoDB | `localhost:27017` (base `ticketmaster`) |
| Adminer (interface MySQL) | http://localhost:8081/ | root | demo_root_pwd | billeterie
| MongoExpress (interface MongoDB) | http://localhost:8082/ | admin | demo_me_pwd


## Comptes de démonstration


| E-Mail | Password | Rôle |
|---|---|---|
| jean@example.com | password123 | utilisateur
| alice@example.com | password123 | utilisateur
| admin@ticketmaster.local | password123 | admin

ajout voir mettre a jour et supprimer 

**Repartir de zéro** : `docker compose down -v && docker compose up --build`.

(Si vous avez défini un `.env`, remplacez `demo_mongo_root_pwd` par votre `MONGO_ROOT_PASSWORD`.)

## Sauvegarde

```bash
./docker/backup.sh                          # -> backups/<horodatage>/{mysql.sql, mongo.archive.gz}
./docker/restore.sh backups/<horodatage>
```

## Outils d'IA utilisés

Ce projet a été développé avec l'assistance de **Claude Code** (Anthropic) pour le front et la documentation et la génération de fake data.

## Notes

- Les scripts d'initialisation ne s'exécutent qu'au **premier** démarrage (volumes vides).
- Le mot de passe est haché (bcrypt) côté API ; l'application se connecte à MySQL avec `app_user` (droits limités) et à MongoDB avec un utilisateur `readWrite` sur une seule base.