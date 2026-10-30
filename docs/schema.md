# Schéma des deux bases (MySQL + MongoDB)

## Schéma global

```mermaid
erDiagram
    %% ============ MySQL : billeterie ============
    users {
        INT id PK
        VARCHAR lastName
        VARCHAR name
        VARCHAR email UK
        VARCHAR password
        ENUM role
        BOOLEAN isDeleted
        DATETIME createAt
        DATETIME updateAt
    }
    location {
        INT id PK
        VARCHAR name UK
        VARCHAR adress
        VARCHAR city
        INT nbQuantity
        BOOLEAN isDeleted
    }
    event {
        INT id PK
        VARCHAR artist
        INT idLocation FK
        DATETIME eventDate
        BOOLEAN isDeleted
    }
    category {
        INT id PK
        INT idEvent FK
        VARCHAR name
        DECIMAL price
        INT nbQuantity
        BOOLEAN isDeleted
    }
    ticket {
        INT id PK
        INT idUser FK
        INT idCategory FK
        DECIMAL pricePaid
        BOOLEAN isDeleted
        DATETIME createAt
    }
    ticket_audit {
        BIGINT id PK
        INT idTicket
        INT idUser
        ENUM action
        DATETIME createAt
    }

    location ||--o{ event : "accueille"
    event ||--o{ category : "Contient plusieurs"
    category ||--o{ ticket : "est vendu en"
    users ||--o{ ticket : "achète"
    ticket ||--o{ ticket_audit : "trigger"

    %% ============ MongoDB : ticketmaster ============
    event_content {
        INT _id PK
        STRING artist
        STRING genre
        STRING description
        ARRAY tags
        ARRAY lineup
        OBJECT venueInfo
        OBJECT media
        OBJECT rating
        DATE createdAt
        DATE updatedAt
    }
    reviews {
        OBJECTID _id PK
        INT eventId
        INT userId
        INT rating
        STRING comment
        DATE createdAt
    }
    activity_log {
        OBJECTID _id PK
        STRING type 
        INT userId
        INT eventId 
        OBJECT meta
        DATE at
    }

    %% ============ Liens entre les deux bases ============
    event ||--o| event_content : "même id (1-1)"
    event ||--o{ reviews : "eventId"
    users ||--o{ reviews : "userId (1 avis max / event)"
    event ||--o{ activity_log : "eventId"
    users ||--o{ activity_log : "userId"
```

## Légende

| Base | Table/Collections | Rôle |
|---|---|---|
| MySql | `users`, `location`, `event`, `category`, `ticket`, `ticket_audit` | Données transactionnelles (achats, stock, prix) |
| MongoDB |`event_content`, `reviews`, `activity_log` | Contenu éditorial, avis, journal d'activité |

---

# Documentation détaillée côté base de données

Cette partie explique **pourquoi chaque table et chaque collection est dans MySQL ou dans MongoDB**, et décrit **tout ce qui s'exécute côté base** (vues, fonctions, procédures, triggers, droits).

## 1. Choix SQL ou NoSQL pour chaque table et collection

Pour chaque table et collection on se demande quelles requêtes on lui pose, quelle forme a la donnée, quelle cohérence est exigée. 
Dans notre cas on a une persistance polyglotte, il y a une seule source de vérité : ici MySQL, qui porte tout ce qui touche à l'argent. MongoDB ne contient aucune donnée dont dépend une vente.

| Table / collection | Base | Forme de la donnée | Cohérence exigée | Pourquoi ce choix |
|---|---|---|---|---|
| `users` | MySQL | expression régulière, schéma fixe | forte (ACID) | Référencée par `ticket` : la clé étrangère et l'email `UNIQUE` sont garantis par le schéma. Les données personnelles restent à un seul endroit (pas copiées dans MongoDB). |
| `location` | MySQL | expression régulière, donnée de référence | forte | Une salle accueille plusieurs événements : relation 1-N stockée une seule fois et recombinée par jointure. |
| `event` | MySQL | expression régulière | forte | Pivot des ventes. Ses lectures croisent beaucoup d'entités (salle, catégories, billets) donc le document est déconseillé |
| `category` | MySQL | expression régulière | forte | Porte le prix et le stock : montants exacts (`DECIMAL`) et contraintes `CHECK`. |
| `ticket` | MySQL | expression régulière, très écrites | forte : stock | Le stock à besoin d'une cohérence forte quitte à refuser sous panne. Achat atomique, isolation par verrou de ligne, prix figé (**ACID**). |
| `ticket_audit` | MySQL | journal d'événements liés à `ticket` | forte (atomicité) | Écrit par trigger dans la même transaction que l'achat : « billet et trace, ou rien ». |
| `event_content` | MongoDB | **agrégat autonome**, structure variable | cohérence à terme tolérée | Fiche éditoriale (line-up, tags, accès, affiche) **lue en bloc par une clé** (`_id` = `event.id`). Les sous-objets sont **embarqués** (bornés, jamais lus seuls). Schéma dynamique encadré par `$jsonSchema`. |
| `reviews` | MongoDB | document, croissance **sans borne** | cohérence à terme tolérée | Le « tableau sans limite » est un piège à éviter : les avis sont donc **référencés** (`eventId`) et non embarqués dans `event_content`. La note moyenne est un **précalcul**. |
| `activity_log` | MongoDB | événements applicatifs, schéma mouvant, écriture massive | aucune (donnée jetable) | Insertions rapides sans contrainte, et un index **TTL** (30 jours) supprime les entrées sans tâche de purge. |

**Pourquoi pas les autres familles ?**
- **Clé-valeur (Redis)** : utile pour un cache ou des sessions. Aucun besoin mesuré à ce volume (≈ 300 événements, ≈ 24 000 billets) et les lectures principales passent par des vues indexées : on n'ajoute pas un magasin « au cas où ».
- **Graphe (Neo4j)** : nos questions portent sur des **valeurs** (prix, stock, notes), pas sur des **chemins** de profondeur variable. Les relations sont de profondeur fixe : SQL suffit.
- **Tout dans MongoDB** : l'achat exige des contraintes fortes et des transactions multi-entités.
- **Tout dans MySQL** : à ce volume, une colonne JSON pourrait suffire. La séparation est assumée parce que MongoDB apporte nativement l'index, l'agrégation, le **TTL** et le schéma dynamique, et isole le contenu éditorial de la chaîne de vente.

**Liaison entre les deux bases** : pas de clé étrangère possible entre deux SGBD. Le lien est une **référence logique** (`event_content._id` = `event.id`, `reviews.eventId`, `activity_log.eventId`). Il n'y a pas de contrainte d'intégrité référentielle côté MongoDB : c'est l'application qui la tient ([voir §4](#4-cohérence-entre-mysql-et-mongodb)).

---

## 2. Vues MySQL

Une vue est une **requête nommée** : elle ne stocke rien, chaque lecture relance sa définition, donc elle est **toujours à jour**. Les quatre bénéfices d'une VIEW sont : 
- **simplifier** (jointures et agrégats deviennent une « table » lisible) 
- **réutiliser** (une seule définition de « places vendues » ou de « chiffre d'affaires » pour l'API et le reporting)
- **sécuriser** (`report_user` n'a accès qu'à deux vues, ([voir §5](#4-cohérence-entre-mysql-et-mongodb)))
- **découpler** (le schéma peut évoluer derrière une vue stable). 

**Pourquoi pas des vues matérialisées ?** Elles sont figées jusqu'au `REFRESH` (fraîcheur contre vitesse). Le stock restant doit être exact à chaque lecture, sinon on afficherait des places qui n'existent plus : on garde des vues simples, rapides grâce aux index `idx_ticket_category` et `idx_category_event`. MySQL n'a de toute façon pas de vue matérialisée native.

| Vue | À quoi elle sert | Détails de conception |
|---|---|---|
| **`v_ticket_details`** | Page « Mes billets » : acheteur, événement, salle, catégorie, prix payé.| Cette view permet d'eviter de repeter a chaque fois les 4 JOIN (ticket → users, category → event → location) avec le filtre `t.isDeleted = FALSE` afin de ne pas afficher les billets annulés. |
| **`v_category_sold`** | Stock par catégorie : total, vendu, disponible. | La view permet de faire le comptage en sous-requête avant la jointure pour éviter de multiplier les lignes. |
| **`v_show_event`** | Catalogue : un événement par ligne avec salle, `ticketsSold`, `revenue`, `minPrice` (prix « à partir de »). Alimente l'accueil et l'API. | `LEFT JOIN` pour garder les événements sans catégorie ou sans vente. Les filtres isDeleted sont placés dans le `ON` (et pas dans le `WHERE`) pour ne pas perdre ces événements. |

---

## 3. Fonctions, procédures stockées et triggers MySQL

Pourquoi de la logique dans la base ? La règle est **appliquée pour tous les clients** (API, script, console SQL), elle s'exécute dans une seule transaction (atomicité) et elle permet une **sécurité par `EXECUTE`** sans accès direct aux tables. Les limites (logique « cachée ») sont compensées par ce document et par les fichiers versionnés `04_functions.sql` et `05_triggers.sql` qui eux serviront de garde fou dans différents cas de figure.

Principe « contraintes d'abord» : tout ce qu'un `CHECK`, une clé étrangère ou un `UNIQUE` sait exprimer l'est déjà dans le schéma. Seules les règles qui lisent d'autres lignes (stock disponible, audit, cascade d'annulation) passent en fonction, procédure ou trigger.

### 3.1 Fonctions

| Fonction | Signature | Rôle |
|---|---|---|
| **`fn_available_seats`** | `(p_category INT) → INT` | Places restantes = `category.nbQuantity − COUNT(billets non annulés)`. Renvoie `COALESCE(total, 0) − vendus` : une catégorie inexistante donne ≤ 0, donc « pas de place » (comportement sûr par défaut). `READS SQL DATA` : déclare qu'elle ne modifie rien (nécessaire pour qu'elle soit utilisable dans des triggers avec le binlog activé). S'appuie sur `idx_ticket_category`. |
| **`fn_event_revenue`** | `(p_event INT) → DECIMAL(12,2)` | CA d'un événement : somme des `pricePaid` des billets non annulés de toutes ses catégories. `DECIMAL(12,2)` (plus large que le prix unitaire) pour éviter tout dépassement lors de la somme. `COALESCE(…, 0)` renvoie 0 plutôt que `NULL` pour un événement sans vente. |

Ces deux fonctions factorisent un calcul réutilisé par la procédure d'achat et le trigger : une seule définition de « place disponible ». Une fonction calcule et renvoie une valeur, utilisable dans une requête ou un trigger.

### 3.2 Procédures stockées

Une **procédure** exécute une action (`CALL`) et peut gérer sa propre transaction, ce qu'une fonction ne fait pas : c'est l'outil du « processus métier » comme l'achat. Elles s'exécutent en **`SQL SECURITY DEFINER`** (défaut MySQL), avec les droits de leur propriétaire. L'utilisateur applicatif n'a **aucun droit d'écriture** sur `ticket`, la procédure est le seul chemin d'écriture et elle contrôle tout (stock, statut de l'événement, montant).

#### `sp_buy_ticket(IN p_user INT, IN p_category INT, OUT p_ticket_id INT)`

Achat d'un billet. Étapes :

1. **`EXIT HANDLER FOR SQLEXCEPTION`** : en cas d'erreur, `ROLLBACK` puis `RESIGNAL` (l'erreur est propagée au client, mais aucune écriture partielle ne subsiste).
2. **`START TRANSACTION`**.
3. **`SELECT … FOR UPDATE`** sur la catégorie (jointe à l'événement), en vérifiant dans la même requête que : la catégorie n'est pas supprimée, l'événement n'est pas supprimé, **`eventDate > NOW()`** (pas d'achat pour un événement passé). Le prix est lu dans cette même requête.
   - **Verrou de ligne** : deux acheteurs simultanés sur la même catégorie sont **sérialisés** ; le second attend la fin de la transaction du premier avant de compter le stock. Cela supprime la course « les deux voient 1 place restante, les deux achètent ».
   - Si aucune ligne n'est trouvée, `v_found` reste à 0.
4. Si `v_found = 0` → `SIGNAL SQLSTATE '45000'` « Catégorie introuvable ou événement terminé ».
5. Si `fn_available_seats(p_category) <= 0` → `SIGNAL` « Plus de places disponibles pour cette catégorie ». Le calcul est fait **sous verrou**, donc fiable.
6. `INSERT INTO ticket` avec `pricePaid = v_price` (**prix figé** à cet instant) ; `p_ticket_id := LAST_INSERT_ID()` renvoyé en paramètre `OUT`.
7. `COMMIT`.

Les erreurs métier utilisent `SQLSTATE '45000'` (« exception définie par l'utilisateur ») avec un message lisible.

#### `sp_cancel_ticket(IN p_ticket INT, IN p_user INT)`

Annule un billet (suppression logique) :

- `UPDATE ticket SET isDeleted = TRUE WHERE id = p_ticket AND idUser = p_user AND isDeleted = FALSE`.
- Le test `idUser = p_user` garantit qu'**on ne peut annuler que ses propres billets** (contrôle d'appartenance dans la base, pas seulement dans l'API).
- `ROW_COUNT() = 0` → `SIGNAL` « Billet introuvable ou déjà annulé » : couvre à la fois un id inexistant, un billet d'un autre utilisateur et une double annulation, sans révéler lequel des cas.
- Aucune transaction explicite : La trace d'audit est créée par `trg_ticket_after_update`.
- Ne vérifie pas la date de l'événement : l'annulation reste possible après coup (règle métier à durcir si besoin).

### 3.3 Triggers

| Trigger | Moment / table | Rôle |
|---|---|---|
| **`trg_ticket_before_insert`** | `BEFORE INSERT ON ticket` | **Garde-fou de stock** : si `fn_available_seats(NEW.idCategory) <= 0`, affiche « Stock épuisé pour cette catégorie » et annule l'insertion. Il protège contre toute insertion qui contournerait `sp_buy_ticket` (script, console SQL, autre application). Le verrou `FOR UPDATE` de la procédure est ce qui garantit l'absence de course ; le trigger est la deuxième ligne de défense (défense en profondeur). |
| **`trg_ticket_after_insert`** | `AFTER INSERT ON ticket` | Écrit `(NEW.id, NEW.idUser, 'PURCHASE')` dans `ticket_audit`. `AFTER` : l'`id` du billet n'existe qu'une fois l'insertion réussie. |
| **`trg_ticket_after_update`** | `AFTER UPDATE ON ticket` | Si `OLD.isDeleted = FALSE AND NEW.isDeleted = TRUE` (comparaison `OLD` / `NEW`), écrit `'CANCEL'` dans `ticket_audit`. La condition sur la transition (et non juste « un update a eu lieu ») évite de journaliser des modifications sans rapport (changement de `updateAt`…) et une fausse annulation. |
| **`trg_event_after_update`** | `AFTER UPDATE ON event` | **Cascade d'annulation** : quand un événement passe à `isDeleted = TRUE`, tous ses billets actifs sont annulés (`ticket.isDeleted = TRUE`) puis toutes ses catégories désactivées. On remplace un `ON DELETE CASCADE` (impossible, on ne supprime pas physiquement) par une cascade logique. L'annulation des billets déclenche à son tour `trg_ticket_after_update`, donc chaque billet annulé laisse une ligne `CANCEL` dans l'audit. Ordre important : billets d'abord, catégories ensuite. |

Chaîne complète d'un achat :

```
CALL sp_buy_ticket
  └─ START TRANSACTION
  └─ SELECT … FOR UPDATE            (verrou catégorie)
  └─ contrôles (date, stock)
  └─ INSERT ticket
        ├─ trg_ticket_before_insert  (re-vérifie le stock)
        └─ trg_ticket_after_insert   (écrit PURCHASE dans ticket_audit)
  └─ COMMIT                          (billet + audit validés ensemble)
```

Billet et ligne d'audit sont dans la même transaction : soit les deux existent, soit aucun.

---

## 4. Cohérence entre MySQL et MongoDB

Sans transaction distribuée, certaines règles sont portées par l'application. MySQL reste la source de vérité ; MongoDB ne contient rien d'une vente. 
Compromis assumé :

| Point | Traitement |
|---|---|
| Un `event_content` doit correspondre à un `event` existant | Vérifié par l'application à la création de la fiche |
| `rating {avg, count}` doit refléter `reviews` | **Précalcul** la note est stockée dans le document pour afficher ou trier sans agréger les avis à chaque lecture. Elle est recalculée par agrégation (`$avg`, `$sum`) après chaque ajout, modification ou suppression d'avis. Cohérence **à terme** : un court décalage est toléré. |
| Suppression d'un événement | Côté MongoDB, suppression du `event_content` et des `reviews` associés. Côté MySQL, suppression logique + cascade du trigger `trg_event_after_update`. |
| `artist` présent dans les deux bases | Extended reference champ copié pour que le catalogue s'affiche sans appel à l'autre base. La **source de vérité** est MySQL. |
| Avis → utilisateur | `reviews.userId` référence `users.id` ; le nom de l'auteur est récupéré dans MySQL au moment de l'affichage|

---

## 5. Sécurité et droits (`06_security.sh`)

Sur ce project le système de **moindre privilège**, une application = un rôle. Les droits donnés par `GRANT`, et écriture sensible **via des procédures** plutôt que par `INSERT` direct. Les mots de passe viennent des variables d'environnement (`.env`), jamais du code enfin on en a par default dans le docker pour eviter de créé un .env .

### MySQL

| Compte | Droits | Justification |
|---|---|---|
| `root` | Tous | Administration et initialisation uniquement ; non utilisé par l'application. |
| **`app_user`** | `SELECT` sur toute la base ; `INSERT, UPDATE` sur `users`, `location`, `event`, `category` ; `EXECUTE` sur les procédures/fonctions | Aucun `DELETE` (tout passe par la suppression logique), aucun DDL, **aucune écriture directe sur `ticket` ni `ticket_audit`** : ces tables ne sont modifiables que via `sp_buy_ticket` / `sp_cancel_ticket` et les triggers (qui s'exécutent avec les droits de leur définisseur). Une injection SQL dans l'API ne pourrait donc pas fabriquer des billets, effacer l'audit ni supprimer de données. |

MySQL n'a pas de *Row Level Security*, le cloisonnement ligne par ligne est donc fait dans `sp_cancel_ticket` (`idUser = p_user`). De plus `app_user` a `SELECT` sur toute la base, y compris `users.password` : le principe « colonne par colonne » (`GRANT SELECT (col)`, que MySQL supporte) permettrait de durcir ce point.

### MongoDB

- Utilisateur applicatif créé par `01_init.js` avec le rôle **`readWrite` limité à la seule base `ticketmaster`** : pas de droit d'administration, pas d'accès aux autres bases.

### Sauvegarde

`docker/backup.sh` et `docker/restore.sh` exportent et restaurent les deux bases :
- MySQL : `mysqldump --single-transaction --routines --triggers`. L'option `--single-transaction` donne un export cohérent sans bloquer les écritures, et `--routines --triggers` inclut les fonctions, procédures et triggers (sans elles, une restauration perdrait les règles de stock).
- MongoDB : `mongodump --archive --gzip` sur la base `ticketmaster`, restauré avec `mongorestore --drop`.

