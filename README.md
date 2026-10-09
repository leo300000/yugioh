# Classeur Yu-Gi-Oh!

**👉 Accéder au site : https://leo300000.github.io/yugioh/**

Un classeur en ligne qui range **toutes les cartes Yu-Gi-Oh!** par extension, comme dans un vrai classeur de collection :
une pochette par carte, son code d'impression et sa rareté, une recherche dans tout le catalogue,
les noms en français ou en anglais, et un effet d'inclinaison holographique au survol.

Le site est **100 % statique** : pas de serveur ni de base de données. Une seule dépendance npm, `sharp`, sert au build pour
convertir les images. Un script Node récupère
les données une fois par semaine, prépare les fichiers, puis GitHub Pages les sert tels quels.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Comment ça marche, vue d'ensemble](#comment-ça-marche-vue-densemble)
3. [Arborescence du dépôt](#arborescence-du-dépôt)
4. [Le pipeline de données : `scripts/build.mjs`](#le-pipeline-de-données--scriptsbuildmjs)
5. [Le pipeline de déploiement : GitHub Actions](#le-pipeline-de-déploiement--github-actions)
6. [Le site : `site/index.html`](#le-site--siteindexhtml)
7. [Format des données générées](#format-des-données-générées)
8. [Travailler en local](#travailler-en-local)
9. [Réglages](#réglages)
10. [Dépannage](#dépannage)
11. [Crédits et mentions légales](#crédits-et-mentions-légales)

---

## Fonctionnalités

- **Liste de toutes les extensions** dans la colonne de gauche, groupées par année. On peut les trier (plus récentes,
  plus anciennes, par nom) et les filtrer par nom ou par code (ex. `LOB`, `MRD`).
- **Page d'extension** : toutes les cartes de l'extension rangées par code d'impression, avec un filtre
  Monstres / Magies / Pièges et une recherche à l'intérieur de l'extension.
- **Recherche globale** dans les ~13 000 cartes, sur le nom français et le nom anglais, sans tenir compte des accents
  ni des majuscules. Les noms qui commencent par le texte cherché passent en premier, et l'affichage est limité aux
  150 premiers résultats.
- **Fiche détaillée** au clic sur une carte : type, attribut, niveau / rang / lien, échelle Pendule, ATK / DEF,
  archétype, texte complet (FR si disponible) et la liste de toutes les extensions où la carte a été imprimée,
  avec un lien vers chacune.
- **Cartes waifu ♡** : une vue dédiée (lien en haut de la colonne de gauche, ou `#/waifu`) qui réunit tous les
  monstres représentant un personnage féminin, avec un filtre par nom ou archétype. Chaque extension propose aussi
  un filtre « Waifu ♡ ». La sélection est automatique, voir [Réglages](#réglages) pour la compléter.
- **Zoom sur les cartes** : dans la fiche, un clic sur la carte (ou sur « 🔍 Agrandir ») l'affiche en plein écran.
  Ensuite : clic pour zoomer ×2,5 sur le point visé, molette pour régler le niveau (jusqu'à ×4), glisser pour se
  déplacer, pincer sur mobile, boutons − / + / Ajuster, et Échap pour fermer.
- **Images haute résolution** : téléchargées en pleine taille chez YGOPRODeck, puis ramenées à 480 px de large
  et converties en WebP. Elles restent nettes dans la grille, y compris sur écran Retina, et dans le zoom, tout en
  tenant dans la limite de 1 Go de GitHub Pages.
- **Bouton FR / EN** pour choisir la langue des noms et des textes. Le choix est mémorisé dans le navigateur.
- **Inclinaison 3D au survol** avec reflet lumineux. Les cartes holographiques (Super, Ultra…) et secrètes
  (Secret, Ultimate, Ghost, Starlight…) reçoivent en plus un reflet arc-en-ciel plus ou moins fort.
- **Adapté au mobile** : la liste des extensions devient un tiroir ouvert par le bouton « Extensions ».
- **Accessible** : navigation au clavier, focus visible, et l'animation est coupée si le système demande
  de réduire les animations.
- **Mise à jour automatique** chaque lundi pour récupérer les nouvelles extensions.

---

## Comment ça marche, vue d'ensemble

```
                    ┌────────────────────────────┐
                    │     API YGOPRODeck (v7)    │
                    │ cardinfo.php  (EN, FR)     │
                    │ cardsets.php               │
                    │ images.ygoprodeck.com      │
                    └─────────────┬──────────────┘
                                  │ 3 appels de données + les images manquantes
                                  ▼
┌──────────────────────── GitHub Actions (job « build ») ────────────────────────┐
│                                                                                 │
│ cache .cache/img-hd ──restauré──►  node scripts/build.mjs  ──►  dist/           │
│   (images des runs                  1. données                  index.html      │
│    précédents)                      2. cartes                   data/*.json     │
│                                     3. extensions               img/*.webp      │
│                                     4. images                   .nojekyll       │
│                                     5. écriture de dist/                        │
│                                                                                 │
│   upload-pages-artifact (dist/)                                                 │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ▼
                 job « deploy » → deploy-pages → GitHub Pages
                                       ▼
                    https://leo300000.github.io/yugioh/
```

Le navigateur du visiteur ne parle **jamais** à YGOPRODeck : tout (données et images) est servi depuis GitHub Pages.
C'est ce que demande le guide de l'API YGOPRODeck, qui interdit d'afficher leurs images en lien direct (hotlink).

---

## Arborescence du dépôt

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml     # pipeline CI/CD : build + déploiement GitHub Pages
├── scripts/
│   └── build.mjs          # pipeline de données : API → dist/
├── site/
│   └── index.html         # tout le site : HTML, CSS et JavaScript dans un seul fichier
├── package.json           # dépendance de build : sharp (conversion WebP)
├── package-lock.json      # versions figées, installées par « npm ci »
├── .gitignore             # ignore dist/, .cache/, node_modules/
└── README.md
```

Dossiers générés, jamais versionnés :

| Dossier       | Contenu                                                                 |
|---------------|-------------------------------------------------------------------------|
| `.cache/img-hd/` | Les images converties en WebP, gardées d'un build à l'autre           |
| `node_modules/`  | `sharp`, installé par `npm ci`                                         |
| `dist/`       | Le site prêt à publier : copie de `site/` + `data/` + `img/`            |

---

## Le pipeline de données : `scripts/build.mjs`

Un seul script Node (20 ou plus). Il utilise `fetch` et `node:fs`, intégrés à Node, plus `sharp` pour les images.
Il s'exécute de haut en bas en cinq étapes.

### 1. Récupération des données

Trois appels seulement à l'API, avec une pause de 500 ms entre chacun :

| Appel                                 | Utilisation                                         | En cas d'échec                 |
|---------------------------------------|-----------------------------------------------------|--------------------------------|
| `cardinfo.php`                        | Toutes les cartes en anglais (base de référence)    | Le build s'arrête              |
| `cardinfo.php?language=fr`            | Noms et textes français                             | Avertissement, suite en anglais |
| `cardsets.php`                        | Liste officielle des extensions et dates de sortie  | Liste vide, déduite des cartes |

Chaque requête est réessayée jusqu'à 4 fois avec une attente croissante (2 s, 4 s, 8 s). Une réponse 404 n'est pas
considérée comme une erreur : la requête renvoie simplement « rien ». Le script vérifie aussi que la réponse anglaise
contient au moins 1 000 cartes, pour ne jamais publier un site vide si l'API répond de travers.

### 2. Construction des cartes

Pour chaque carte anglaise, le script fusionne la version française par identifiant et ne garde que les champs utiles,
sous des noms courts pour alléger le JSON (voir [Format des données](#format-des-données-générées)). Le nom français
n'est stocké que s'il diffère du nom anglais. Les textes, qui pèsent le plus lourd, partent dans un fichier à part
(`texts.json`) que le site ne charge qu'à l'ouverture de la première fiche.

### 3. Construction des extensions

- Les extensions de `cardsets.php` sont reprises avec leur code et leur date de sortie TCG. Les dates invalides
  (`0000-00-00`, formats bizarres) sont ignorées.
- Le script parcourt ensuite les impressions de chaque carte (`card_sets`) pour remplir les extensions. Si une
  impression cite une extension absente de la liste officielle, il la crée à la volée (sans date).
- Les doublons (même carte, même code, même rareté) sont supprimés.
- Chaque extension reçoit un **identifiant d'URL unique** dérivé de son code (`LOB`, `LOB-2`…).
- Les cartes d'une extension sont triées par code d'impression dans l'ordre naturel (`LOB-EN002` avant `LOB-EN010`).
  Les extensions sont triées de la plus récente à la plus ancienne.
- Les extensions vides sont retirées.

### 4. Images

- Une image par carte (l'illustration principale), téléchargée en **pleine résolution** (`images/cards`). Le script
  affiche la taille des originaux dans le log.
- Chaque image est **redimensionnée à 480 px de large** et convertie en **WebP qualité 78** avec `sharp`. Sans
  cela, les ~14 000 images pèsent près de 2 Go, le double de la limite de 1 Go d'un site GitHub Pages.
- **Garde-fou de poids** : après les téléchargements, le script additionne le poids des images. S'il dépasse
  `IMG_BUDGET_MB` (900 Mo par défaut), il réduit la largeur en proportion et reconvertit tout le cache. La
  largeur retenue est mémorisée pour les builds suivants.
- **Changer un réglage ne retélécharge rien** : le fichier `.cache/img-hd/.params` garde la largeur et la qualité
  utilisées. Si `IMG_WIDTH` ou `IMG_QUALITY` change, les images du cache sont simplement reconverties (1 à 2 minutes).
- Le script compare la liste des images nécessaires au contenu de `.cache/img-hd/` et **ne télécharge que celles
  qui manquent**.
- 6 téléchargements en parallèle, avec une pause de 400 ms après chaque image. Cela reste nettement sous la limite
  de 20 requêtes par seconde de YGOPRODeck, au-delà de laquelle l'IP est bannie pendant une heure.
- Chaque image est d'abord écrite dans un fichier `.part`, puis renommée. Un build interrompu ne laisse donc jamais
  d'image corrompue dans le cache.
- Une image introuvable ne bloque pas le build : le site affiche alors un emplacement vide avec le nom de la carte.

### 5. Écriture de `dist/`

`dist/` est vidé, puis le script y copie `site/` et les images (sans les `.part`). Il écrit ensuite les quatre
fichiers JSON et un fichier `.nojekyll`, qui empêche GitHub Pages de passer le site dans Jekyll. Il termine en
affichant le nombre d'images et leur poids total.

### Durée

| Situation                         | Durée approximative |
|-----------------------------------|---------------------|
| Premier build (≈ 13 000 images)   | 25 à 40 minutes     |
| Builds suivants (cache rempli)    | 1 à 3 minutes       |
| `SKIP_IMAGES=1` en local          | quelques secondes   |

---

## Le pipeline de déploiement : GitHub Actions

Fichier : [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), nommé « Construire et déployer le classeur ».

### Déclencheurs

| Déclencheur          | Quand                                          | Pourquoi                                    |
|----------------------|------------------------------------------------|---------------------------------------------|
| `push` sur `main`    | À chaque modification fusionnée dans `main`    | Publier les changements du site             |
| `schedule`           | Chaque lundi à 4 h UTC (`0 4 * * 1`)           | Récupérer les nouvelles cartes et extensions |
| `workflow_dispatch`  | À la main : onglet **Actions** → **Run workflow** | Forcer une mise à jour                   |

### Permissions et concurrence

- `contents: read` : lire le dépôt.
- `pages: write` et `id-token: write` : obligatoires pour publier sur GitHub Pages.
- `concurrency: pages` avec `cancel-in-progress: false` : un seul déploiement à la fois. Si un deuxième run démarre
  pendant le premier, il attend au lieu de l'annuler, pour ne pas perdre un téléchargement d'images déjà bien avancé.

### Job `build` (limite de 120 minutes)

1. **`actions/checkout@v4`** récupère le code.
2. **`actions/setup-node@v4`** installe Node 22 et garde en cache les paquets npm téléchargés.
3. **`npm ci`** installe `sharp` dans la version figée par `package-lock.json`.
4. **`actions/cache@v4`** restaure `.cache/img-hd`.
   - La clé `ygo-imghd-<run_id>` est unique à chaque run, et `restore-keys: ygo-imghd-` restaure le cache le plus récent.
   - Résultat : chaque run repart des images du run précédent et enregistre en fin de job un nouveau cache qui
     inclut les nouvelles images. Le cache grossit donc au fil des extensions sans jamais tout retélécharger.
5. **`node scripts/build.mjs`** construit `dist/` (voir plus haut).
6. **`actions/configure-pages@v5`** prépare la publication.
7. **`actions/upload-pages-artifact@v3`** envoie `dist/` comme artefact Pages.

### Job `deploy`

Il attend la fin du job `build`, puis **`actions/deploy-pages@v4`** publie l'artefact dans l'environnement
`github-pages`. L'URL du site s'affiche dans le résumé du run.

### Prérequis côté dépôt (déjà fait)

**Settings → Pages → Build and deployment → Source : GitHub Actions.**

### Bon à savoir

- GitHub supprime un cache inutilisé pendant 7 jours. Le run hebdomadaire suffit normalement à le garder. S'il
  disparaît quand même, le build suivant retélécharge simplement toutes les images (plus long, mais sans erreur).
- Sur un dépôt public, GitHub désactive les tâches planifiées après 60 jours sans activité. Si la mise à jour du
  lundi s'arrête, réactive-la depuis l'onglet **Actions**.

---

## Le site : `site/index.html`

Tout tient dans un seul fichier : HTML, CSS et JavaScript, sans framework ni étape de compilation.
Seules les polices (Alegreya Sans et Alegreya Sans SC) viennent de Google Fonts.

### Chargement

Au démarrage, le site charge en parallèle `sets.json`, `cards.json` et `meta.json`, puis construit en mémoire :

- un index de recherche (noms FR + EN sans accents) ;
- pour chaque carte, la liste de ses impressions, triée de la plus ancienne à la plus récente.

`texts.json` n'est chargé qu'à l'ouverture de la première fiche.

### Navigation

La navigation passe par l'ancre de l'URL : chaque page a sa propre adresse, que l'on peut partager ou mettre en favori.

| URL                          | Vue                                         |
|------------------------------|---------------------------------------------|
| `#/`                         | Accueil : chiffres clés et 12 dernières sorties |
| `#/set/<identifiant>`        | Une extension (ex. `#/set/LOB`)             |
| `#/waifu`                    | Toutes les cartes waifu                      |
| texte dans la barre de recherche (2 caractères ou plus) | Résultats de recherche |

### Inclinaison

- Un seul écouteur `pointermove` sur toute la page, avec une mise à jour par image affichée (`requestAnimationFrame`).
- La position du curseur pilote des variables CSS (`--rx`, `--ry`, `--mx`, `--my`…) qui règlent la rotation 3D,
  la position du reflet et l'ombre.
- Pas d'effet au doigt sur écran tactile, ni quand l'utilisateur demande de réduire les animations.

### Préférences mémorisées

Le site enregistre deux préférences dans le navigateur (`localStorage`) : la langue (`ygo-lang`) et le tri des
extensions (`ygo-sort`). Si le navigateur bloque le stockage, le site fonctionne quand même avec les valeurs par défaut.

---

## Format des données générées

Tous les fichiers sont dans `dist/data/`.

### `cards.json` : objet indexé par identifiant de carte

| Clé   | Sens                              | Exemple              |
|-------|-----------------------------------|----------------------|
| `n`   | Nom anglais                       | `"Dark Magician"`    |
| `nf`  | Nom français (si différent)       | `"Magicien Sombre"`  |
| `t`   | Type                              | `"Normal Monster"`   |
| `f`   | Type de cadre                     | `"normal"`, `"xyz"`, `"effect_pendulum"` |
| `i`   | Identifiant de l'image            | `46986414`           |
| `a`   | Attribut                          | `"DARK"`             |
| `r`   | Race / type de monstre ou de magie | `"Spellcaster"`     |
| `l`   | Niveau ou rang                    | `7`                  |
| `atk`, `def` | Attaque, défense           | `2500`, `2100`       |
| `lv`  | Valeur de lien                    | `3`                  |
| `sc`  | Échelle Pendule                   | `8`                  |
| `ar`  | Archétype                         | `"Dark Magician"`    |

### `sets.json` : tableau d'extensions

```json
{ "id": "LOB", "c": "LOB", "n": "Legend of Blue Eyes White Dragon", "d": "2002-03-08",
  "k": [[89631139, "LOB-EN001", "Ultra Rare"], ...] }
```

`k` contient une ligne `[id carte, code d'impression, rareté]` par impression. `d` vaut `null` si la date est inconnue.

### `texts.json`

`{ "<id>": ["texte anglais", "texte français"] }`. Le texte français est absent s'il n'existe pas ou s'il est identique.

### `meta.json`

`{ "builtAt": "2026-10-09T08:12:00.000Z", "cards": 13000, "sets": 1000 }` : date du build et totaux, affichés en
pied de page.

---

## Travailler en local

Prérequis : **Node 20 ou plus**.

```bash
# Une fois : installe sharp (inutile pour un build sans images)
npm ci

# Build rapide : les données seulement, sans image (les cartes s'affichent avec leur nom)
SKIP_IMAGES=1 node scripts/build.mjs

# Build complet : télécharge et convertit les images dans .cache/img-hd (long la première fois)
node scripts/build.mjs

# Servir le site
npx serve dist        # ou : python3 -m http.server -d dist
```

Il faut passer par un serveur : ouvrir `dist/index.html` directement (`file://`) ne marche pas, car le navigateur
bloque le chargement des fichiers JSON.

Pour modifier le site, édite `site/index.html`, puis relance `SKIP_IMAGES=1 node scripts/build.mjs`, ou copie
simplement le fichier dans `dist/`.

---

## Réglages

| Réglage            | Où                                   | Défaut | Effet                                                 |
|--------------------|--------------------------------------|--------|-------------------------------------------------------|
| `TILT_MAX`         | haut du script de `site/index.html`  | `14`   | Angle maximal d'inclinaison, en degrés                |
| `TILT_DIR`         | haut du script de `site/index.html`  | `1`    | `1` : le coin sous le curseur s'enfonce ; `-1` : il se soulève |
| `SEARCH_LIMIT`     | script de `site/index.html`          | `150`  | Nombre maximal de résultats de recherche affichés     |
| `WAIFU_ARCHETYPES`, `WAIFU_WORDS`, `WAIFU_CARDS` | script de `site/index.html` | — | Sélection des cartes waifu (voir ci-dessous) |
| `SKIP_IMAGES`      | variable d'environnement             | —      | `1` : aucun téléchargement d'image                    |
| `IMG_CONCURRENCY`  | variable d'environnement             | `6`    | Téléchargements en parallèle                          |
| `IMG_DELAY_MS`     | variable d'environnement             | `400`  | Pause par téléchargement après chaque image (ms)      |
| `IMG_WIDTH`        | variable d'environnement             | `480`  | Largeur maximale des images (px). Un changement reconvertit le cache |
| `IMG_QUALITY`      | variable d'environnement             | `78`   | Qualité WebP (0-100). Un changement reconvertit le cache |
| `IMG_BUDGET_MB`    | variable d'environnement             | `900`  | Poids maximal des images ; au-delà, la largeur est réduite automatiquement |
| `Z_MAX`            | script de `site/index.html`          | `4`    | Niveau de zoom maximal                                |
| Planification      | `cron` dans `deploy.yml`             | lundi 4 h UTC | Fréquence de mise à jour automatique           |

**Sélection waifu.** L'API ne dit pas si un personnage est féminin. Le site retient donc un monstre s'il remplit
au moins une de ces conditions :

1. son archétype figure dans `WAIFU_ARCHETYPES` (archétypes entièrement féminins : Dragonmaid, Sky Striker,
   Witchcrafter, Labrynth…) ;
2. son nom anglais contient un mot de `WAIFU_WORDS` (Girl, Lady, Queen, Princess, Maiden, Witch…) ;
3. son nom anglais exact figure dans `WAIFU_CARDS` (cartes isolées : Ash Blossom & Joyous Spring, Effect Veiler,
   I:P Masquerena, les filles de la White Forest…) ;
4. c'est une Charmeuse ou sa version Possédée (Aussa, Eria, Hiita, Wynn, Lyna), via `WAIFU_NAMES`.

Ces listes s'appuient sur les cartes et archétypes que la communauté cite le plus souvent comme « waifu »
(Dark Magician Girl, Sky Striker, Dragonmaid, Exosister, Solfachord, Lunalight, Harpie, Cyber Angel…).

Pour ajouter une carte oubliée, mets son nom anglais exact dans `WAIFU_CARDS`. Pour un archétype entier, ajoute-le
à `WAIFU_ARCHETYPES`. La modification est en ligne après le prochain déploiement, sans rebuild des données.

⚠️ Si tu changes `IMG_CONCURRENCY` ou `IMG_DELAY_MS`, reste sous **20 requêtes par seconde** au total, sinon
YGOPRODeck bannit l'adresse IP pendant une heure.

---

## Dépannage

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| Page 404 sur l'URL du site | Pages pas configuré, ou premier déploiement pas encore fini | Vérifier **Settings → Pages** (source « GitHub Actions ») et l'onglet **Actions** |
| « Les données du classeur sont introuvables » | `data/*.json` absents (site servi sans build) | Lancer `node scripts/build.mjs` et servir `dist/` |
| Le run échoue sur `Réponse cardinfo.php inattendue` | API YGOPRODeck indisponible ou réponse incomplète | Relancer plus tard avec **Run workflow** ; l'ancien site reste en ligne |
| Noms uniquement en anglais | L'appel français a échoué pendant le build | Le build suivant corrigera ; relancer à la main si besoin |
| Certaines cartes sans image | Image absente chez YGOPRODeck ou téléchargement raté | Elles seront retentées au build suivant |
| Le build reprend 30 minutes | Le cache d'images a expiré | Normal, rien à faire |
| `Le module sharp est introuvable` | `npm ci` pas lancé | Lancer `npm ci`, ou builder avec `SKIP_IMAGES=1` |
| Message « Budget dépassé » dans le log | Images trop lourdes pour GitHub Pages | Rien à faire : la largeur est réduite automatiquement |
| Avertissement « Plus de 950 Mo d'images » | Le garde-fou n'a pas suffi | Baisser `IMG_QUALITY` ou `IMG_BUDGET_MB` et relancer |
| HTTP 429 / IP bannie | Trop de requêtes par seconde | Remettre les valeurs par défaut et attendre une heure |
| Plus de mise à jour le lundi | Tâche planifiée désactivée après 60 jours sans activité | La réactiver depuis l'onglet **Actions** |

---

## Crédits et mentions légales

- Données et images : [YGOPRODeck](https://ygoprodeck.com/api-guide/), téléchargées et hébergées localement comme le
  demande leur guide d'API.
- Yu-Gi-Oh! et les visuels des cartes appartiennent à **Konami** et **4K Media**.
- Projet de fan **non officiel**, sans but commercial, sans lien avec Konami.
