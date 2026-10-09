# Classeur Yu-Gi-Oh!

Toutes les cartes Yu-Gi-Oh! rangées par extension, avec recherche, noms FR/EN et inclinaison des cartes au survol.
Site 100 % statique, hébergé sur GitHub Pages.

## Mise en ligne

1. Pousse ce dossier sur un dépôt GitHub (branche `main`).
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Onglet **Actions** → « Construire et déployer le classeur » → **Run workflow**.

Le premier build télécharge environ 13 000 images (compter 25 à 40 minutes). Les suivants réutilisent le cache
et ne récupèrent que les nouvelles cartes. Le workflow se relance seul chaque lundi.

## En local

```bash
SKIP_IMAGES=1 node scripts/build.mjs   # données seules, rapide
node scripts/build.mjs                 # avec les images (long la première fois)
npx serve dist
```

Node 20 ou plus requis, aucune dépendance.

## Réglages

- Inclinaison : `TILT_MAX` (angle) et `TILT_DIR` (1 ou -1 pour inverser le sens) en haut du script de `site/index.html`.
- Téléchargement : `IMG_CONCURRENCY` et `IMG_DELAY_MS` dans `scripts/build.mjs` (rester sous 20 requêtes/s, sinon YGOPRODeck bannit l'IP pendant 1 h).

## Crédits

Données et images : [YGOPRODeck](https://ygoprodeck.com/api-guide/), téléchargées et hébergées localement comme demandé par leur guide d'API.
Yu-Gi-Oh! et les visuels des cartes appartiennent à Konami et 4K Media. Projet de fan non officiel, sans but commercial.
