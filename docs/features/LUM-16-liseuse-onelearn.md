# LUM-16 — Rétablir l'identité OneLearn : bibliothèque « bandeau manuel » et lecteur « liseuse »

## Origine et décisions

Le 15 novembre 2026, après la passe « épurer » (`dc5a9b3`), l'utilisateur demande de rétablir un thème inspiré de OneLearn (`/home/vduch/Documents/Projets/OneLearn-mvp`, refonte « manuel » F-019). Trois prototypes jetables hors dépôt : `~/.local/state/luminapdf/maquette-onelearn/index.html` (+ `NOTES.md`). Décisions utilisateur :

- **Bibliothèque : direction B** (`#v=b&ecran=bibliotheque`).
- **Lecteur : direction C** (`#v=c&ecran=lecteur|sommaire|outils`), variante « Mode de lecture : dans Outils ».
- **Option 1 acceptée en connaissance de cause** : le choix Continu / Page par page quitte l'en-tête et passe dans le panneau Outils (deux gestes au lieu d'un). Le contrat « les deux modes sont accessibles d'un geste depuis la barre » est abandonné ; reste garanti : les deux modes sont **également** accessibles (même panneau, même niveau, mêmes noms), et le raccourci clavier `C` reste inchangé.

La maquette est une référence de rendu, pas du code à copier ; son document, son sommaire et sa progression sont fictifs.

## Résultat utilisateur

LuminaPDF retrouve le langage « manuel » de OneLearn : papier légèrement grainé, titres Literata à l'encre de l'accent, filets fins au lieu de cadres, liens soulignés, rayons ≤ 2 px (radios ronds exceptés), aucune ombre, aucune capsule ni pastille, aucun flou. Le lecteur s'efface au profit de la page ; la bibliothèque garde sa disposition actuelle, habillée dans ce langage.

## Mini-brief UX

1. **Intention** : lire comme dans un livre ; l'interface se fait oublier, la bibliothèque se lit comme une page de manuel.
2. **Tâche prioritaire** : reprendre la lecture et tourner les pages ; ouvrir sommaire et outils sans chercher.
3. **Direction** : manuel imprimé (OneLearn F-019) — hiérarchie par taille, graisse, police, filets et espace ; accent de l'ambiance pour titres et état actif.
4. **Système réutilisé** : polices locales Literata / Atkinson Hyperlegible Next déjà livrées ; palettes approuvées des neuf ambiances × Jour/Nuit **inchangées** (`--lumina-*`, `ThemeManager`, `ThemeFilterDefs`) ; grain = SVG en `data:` de la maquette (5 % clair, 3 % sombre), sans requête externe ; mouvement 150–220 ms désactivé par `prefers-reduced-motion` ; cibles ≥ 44 px.
5. **À éviter** : ombres, `backdrop-filter`, capsules `rounded-full`, pastilles de fond pour l'état actif, cartes, dégradés, emojis, sur-titres en capitales espacées, texte explicatif nouveau, données simulées.
6. **Preuves** : voir « Validation attendue ».

## Lecteur (direction C)

- **En-tête courant** (rangée du haut, fond = bureau grainé, sans bordure ni fond distinct) : à gauche le bouton icône « Revenir à la bibliothèque » ; au centre le **nom du document** en Literata petites capitales (`font-variant-caps: small-caps`), tronqué proprement ; à droite le bouton icône « Ajuster la page ». Pas de section courante (aucune correspondance page → sommaire disponible ; hors périmètre).
- **Onglets de bord** : « Sommaire » à gauche et « Outils » à droite, texte vertical discret couleur secondaire, sans fond ni cadre, cible ≥ 44 px de large, état ouvert = accent + gras. Ils occupent deux gouttières latérales **hors** du conteneur de lecture (`.pdf-viewer-container`), afin de ne jamais intercepter un geste commencé sur le document. *Remplacé par LUM-17 (17/11/2026) : onglets superposés à la zone de lecture avec un fond opaque, sans jamais recouvrir la page ajustée ; un toucher sur eux reste une commande.* Noms accessibles inchangés : `Sommaire` (`aria-expanded`, `aria-controls="reader-outline"`) et `Outils de lecture` (`aria-expanded`, `aria-controls="reader-tools"`).
- **Pied « folio »** : filet fin pleine largeur portant la progression à l'accent ; « Page précédente » à gauche, au centre le champ « Aller à la page » (chiffre Literata, souligné, sans cadre) suivi de « sur N », « Page suivante » à droite. La réglette `ReadingProgressBar` cliquable peut être retirée de l'affichage seulement si la progression reste visible via le filet ; la navigation par champ/flèches/clavier reste entière.
- **Panneau Outils** (`#reader-tools`, région « Outils de lecture ») : tiroir pleine hauteur à droite, fond surface grainé, filet gauche, sans ombre ni rayon ; titre Literata accent ; sections séparées par des filets : **Mode** (« Continu » / « Page par page », mêmes noms accessibles `Lecture continue` / `Lecture page par page`, `aria-pressed`, groupe « Mode de lecture »), Zoom, Apparence (Jour/Nuit), Ambiance (neuf choix), Notes, Autres actions, Lectures récentes. Fermeture, Échap, clic extérieur et retour du focus inchangés.
- **Sommaire** (`#reader-outline`, « Table des matières ») : tiroir pleine hauteur à gauche, même traitement ; entrées en liste texte sans cadres. Il reste dans `Document`, hors caméra.
- **Immersion (H)** inchangée : en-tête, onglets et folio masqués, aucune languette visible, restauration par `H`/geste existant.
- Le panneau IA et l'avertissement de stockage reçoivent le même traitement de surface sans changement de fonctionnement.

## Bibliothèque (direction B)

- **Bandeau** : « LuminaPDF » en Literata accent à gauche ; à droite Jour/Nuit, accès à l'ambiance et « Importer un PDF » (bouton plein accent, rayon 2 px). Filet bas, fond surface grainé, ni ombre ni flou.
- **Contenu** (colonne ~980 px) : `h1` « Bibliothèque » Literata accent ; bloc de reprise sans carte : aperçu (filet 1 px), « Reprendre la lecture · <date> », titre Literata, ligne « Page X sur Y » + barre fine + pourcentage, bouton plein « Reprendre à la page X » et action « Retirer » ; puis section « Lectures récentes » (titre interface 14,5 px gras, filet au-dessus) en lignes séparées par des filets : aperçu, nom Literata, « Page X sur Y · date », « Ouvrir », « Retirer » (icône) ; zone de dépôt entre filets pointillés « Glissez un PDF ici, ou choisissez un fichier » ; pied : mention de stockage local existante, Connexion Cloud, Google Drive en liens.
- États vide / chargement / erreur / Réessayer et toutes les actions existantes conservés (mêmes noms accessibles et régions `Reprendre la lecture`, `Lectures récentes`, `Importer un document`). Aucun stockage modifié.

## Contrats à préserver

Invariants de `AGENTS.md` (caméra, `#pdf-spacing-wrapper`, `#pdf-workspace`, qualité différée, virtualisation, gestes LUM-13, `scrollToPage`/`fitPage`, focus, raccourcis, panneaux masqués sans démontage, `ThemeFilterDefs`), sauf la place du choix de mode ci-dessus. Noms accessibles existants conservés. Aucun changement de stockage, services distants, Electron, dépendances, palettes ou gestes.

## Inclus / exclus

Inclus : `src/App.tsx` (disposition seulement), `src/components/Toolbar.tsx`, `OutlinePanel.tsx`, `RecentFiles.tsx`, `ReadingProgressBar.tsx`, `AiPanel.tsx` (surface), `src/index.css`, `tailwind.config.js` si nécessaire. Exclus : `PdfViewer.tsx` et `useReaderGestures.ts` (sauf nécessité démontrée et signalée), `services/`, `ThemeManager` (palettes), `electron/`, `dev-dist/`, archives et changements préexistants (dont `src/services/storage.ts`, `tests/storage-extra.test.mjs`, `tests/fixtures/storage-damaged-page.pdf`).

## Validation attendue

- **Contrat de mode modifié** (tests, auteur indépendant) : les deux modes s'activent depuis le panneau Outils, avec mêmes noms et `aria-pressed` ; les suites existantes qui changent de mode passent par le panneau sans affaiblir leurs assertions de géométrie/navigation ; `C` bascule toujours.
- **Nouvelle disposition** : onglets « Sommaire » / « Outils de lecture » visibles, ≥ 44 px, hors `.pdf-viewer-container` ; pas de commande de mode visible hors panneau ; en-tête, folio et onglets absents en immersion.
- **Langage visuel** : aucune ombre / `backdrop-filter` / rayon > 2 px sur bandeau, en-tête, folio, tiroirs et bibliothèque (radios exceptés) ; palettes inchangées (18 palettes existantes).
- **Régressions** : suites lecteur, gestes, régressions, UX/récupération et stockage existantes vertes ; TypeScript et construction.
- **Parent** : Edge graphique PC 1440×900, tablette 800×1280, petit écran 360×800, Jour/Nuit, sommaire, outils, bibliothèque vide/plusieurs lectures ; clavier/focus ; comparaison avec la maquette. Pas de validation Xiaomi.

## Delta du 16 novembre 2026 — numéro de page en haut, filet seul en bas

Après essai, l'utilisateur trouve le folio du bas trop présent. Décisions :

- **En-tête courant** : au centre, le nom du document (Literata petites capitales), **tronqué sur une ligne avec points de suspension** (nom complet en `title` et nom accessible inchangé), suivi d'une indication discrète « N / total » en chiffres tabulaires, couleur secondaire. Cette indication est le champ accessible « Aller à la page » (même nom, même comportement Entrée/Échap/blur) : sans cadre visible au repos, souligné au survol et au focus, cible ≥ 44 px. Retour et Ajuster restent aux extrémités. À 360 px, le titre se tronque davantage ; le numéro et les deux boutons restent entiers.
- **Pied** : seulement le filet fin de progression à l'accent (réglette `ReadingProgressBar` cliquable/glissable, nom et rôle existants conservés), avec **« Page précédente » et « Page suivante » discrets** (icônes seules, couleur secondaire, sans fond ni cadre, cibles ≥ 44 px) de part et d'autre du filet. Plus de grand numéro ni de « sur N » en bas. La région « Navigation dans le document » reste le pied.
- Le pied, plus bas qu'avant, rend la hauteur gagnée à la zone de lecture. Immersion H inchangée (en-tête, numéro, onglets et pied masqués).
- Aucun autre changement (mode dans Outils, onglets, tiroirs, bibliothèque, palettes, gestes).

Validation : champ « Aller à la page » situé dans l'en-tête `#reader-toolbar` (au-dessus de `.pdf-viewer-container`), à droite du titre, entièrement visible et ≥ 44 px aux trois tailles ; titre sur une ligne sans débordement horizontal même pour un nom très long ; aucun champ de page ni texte « sur N » dans la région « Navigation dans le document » ; flèches et réglette présentes dans le pied, ≥ 44 px ; hauteur du pied réduite par rapport à l'état précédent (≤ 56 px) ; suites existantes vertes.

## Pincement : oracle corrigé, aucun défaut moteur (16 novembre 2026)

Le delta précédent, accepté visuellement par l'utilisateur, rendait rouge `tests/reader.test.mjs` « Ctrl+wheel anchor… pinch » (écart horizontal 22 px, vert sur l'état précédent). L'hypothèse initiale d'un défaut d'ancrage dans `PdfViewer.tsx` n'a pas été confirmée.

- **Investigation** (auteur de tests indépendant, `tests/pinch-anchor.test.mjs`) : pincement et Ctrl+molette décentrés franchissant la largeur de la zone pendant le geste, Page par page et Continu, 1440×900 et 800×1280, dépassements faible et fort : écart à la position atteignable ≤ 0,5 px dans tous les cas. Aucun défaut reproduit dans les cas examinés.
- **Cause du rouge** : à 1200×900, le gain de hauteur agrandit la page ajustée ; le pincement à 60 % la fait dépasser à peine la largeur. Garder le point sous les doigts exigerait 80 px de défilement pour 48 disponibles : position impossible (G1). Avant le delta, le document tenait encore en largeur et le contrôle horizontal ne s'appliquait pas.
- **Décision parent** : corriger l'oracle seul, conformément à LUM-13 G2 tel que formulé — sur tout axe où le document agrandi dépasse la zone, le point médian reste à ≤ 8 px de sa position idéale si elle est atteignable, sinon le document est plaqué contre la borne du bon côté ; sur un axe où il tient, il reste centré. `PdfViewer.tsx` et `useReaderGestures.ts` inchangés.
- **Preuves** : `reader` 8/8, `pinch-anchor` 17/17, `gestures` 75/75 et autres suites vertes en une passe sur l'état final ; revue fresh ciblée sans finding sur cet arbitrage.
