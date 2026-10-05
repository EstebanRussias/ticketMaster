# Plan de la vidéo (8 à 12 minutes)

| Temps | Séquence | À montrer à l'écran |
|---|---|---|
| 0:00 – 0:45 | Présentation | Le projet, le schéma d'architecture (`docs/presentation.md` §2) |
| 0:45 – 2:30 | **Démarrage d'un environnement vierge** | `docker compose down -v` puis `docker compose up --build` ; logs de `mysql` (scripts 01→06), `mongo` (01_init.js), `seed` ("300 contenus, … avis"), `api` |
| 2:30 – 4:00 | **Preuve du peuplement** | MySQL : `SELECT COUNT(*)` sur les 5 tables, aperçu de `v_show_event` ; MongoDB (mongosh ou Compass) : `countDocuments()` des 3 collections, un document `event_content` |
| 4:00 – 6:00 | **Application** | Front : catalogue, filtre, fiche d'un événement (stock MySQL + programme/avis Mongo), connexion `alice@example.com`, achat d'un billet, « Mes billets » |
| 6:00 – 7:30 | **Écriture puis relecture** | Après l'achat : `SELECT … FROM ticket ORDER BY id DESC LIMIT 1` + `ticket_audit` (trigger) ; publier un avis depuis le front puis `db.reviews.find({userId: …})` ; refus d'un avis sans billet (403) ; catégorie complète (409) ; `GET /api/events/1/full` (lecture croisée) |
| 7:30 – 10:00 | **Requêtes avancées** | `docs/sql/queries.sql` (HAVING, CTE + RANK, NOT EXISTS, sous-requête, LEFT JOIN) ; `docs/nosql_queries.js` (filtres imbriqués, `$text`, pipeline par genre, `$lookup`, TTL) ; `docs/sql/explain_index.sql` : avant/après index |
| 10:00 – 11:30 | **Choix techniques** | Pourquoi MySQL (ACID, stock, argent) et MongoDB (contenu variable, avis, TTL) ; répartition des données ; identifiants partagés, MySQL = source de vérité ; rôle `app_user` (`DELETE` refusé) |
| 11:30 – 12:00 | Conclusion | Sauvegarde (`backup.sh`), limites, tests (`docker compose exec api npm test`) |
