# Handoff — passe UX/UI LuminaPDF (LUM-13, LUM-14, LUM-15)

> **Relais historique du 14 novembre, dépassé par la reprise du 15 novembre.** La maquette React Option A a depuis été approuvée et intégrée, puis corrigée après revue. L'état local et les preuves de reprise sont dans la section « Bilan local du 15 novembre » du [contrat](LUM-13-passe-ux.md) et dans `backlog.json`. Les mentions ci-dessous « aucun code de production modifié » et « tests interrompus » ne décrivent plus l'état actuel. Essai utilisateur/Xiaomi et accord Git restent distincts.

Rédigé le 14 novembre 2026 au soir par l'agent principal de la session de cadrage, pour une autre IA qui reprend le cadrage et l'implémentation. Ce fichier est un relais, pas une spécification : le contrat de référence reste [LUM-13-passe-ux.md](LUM-13-passe-ux.md), **à amender** avec les retours utilisateur de la section 4.

## 1. À lire avant d'agir

- Instructions globales de l'utilisateur : `/home/vduch/.pi/agent/AGENTS.md`. Points clés :
  - toujours répondre **en français** ;
  - l'utilisateur **n'est pas développeur** : pas de jargon, effets concrets d'abord, décisions présentées avec options, conséquences et recommandation ;
  - **aucun commit ni push sans son accord explicite** ;
  - pas de dépendance, de refactor ni de reformatage sans rapport avec la demande ;
  - **Microsoft Edge** pour tout affichage.
- Instructions du projet : `AGENTS.md` (invariants de géométrie, zoom, virtualisation, thèmes ; état des services ; Electron non sécurisé). Lire aussi `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `backlog.json`.
- Workflow obligatoire : `vd-pi-x-orchestrate-feature` (`/home/vduch/vd-pi-skills/vd-pi-x-orchestrate-feature/SKILL.md`), avec son socle `references/commun.md`, `references/agents.md`, `references/ux.md`, et les skills internes `vd-pi-3-shape-feature` et `vd-pi-4-implement-feature`.
  - Parcours retenu : **protégé** (gestes et géométrie partagés par tout le lecteur, changement visuel transversal).
  - **Auteurs séparés** : l'agent qui code la production n'écrit ni ne modifie aucun test ; un auteur de tests indépendant écrit les tests en premier.
  - **Contrôles d'écriture** : `scripts/gate_check.py snapshot` avant chaque rôle qui écrit, `verify --phase post-run` après.
  - **Rôles** : worker fresh, revue fresh en lecture seule, observation Edge par l'agent principal, essai Xiaomi par l'utilisateur.
  - **Modèles** (tableau dans `references/agents.md`) : worker `openai-codex/gpt-6.1-sol` high ; auteur de tests `claude-bridge/claude-sonnet-5-5` high ; reviewer Sol xhigh ou Opus high.
- Guide UX de l'utilisateur : `~/Documents/guide-ux-ui-anti-slop.md`. Chaque effet doit avoir une fonction, pas de cliché « IA », mesurer les contrastes.

## 2. Demandes de l'utilisateur, dans l'ordre

1. **Demande initiale** : après la stabilisation, faire une passe UX/UI pour que l'application soit « belle et agréable à utiliser à nouveau dans son agencement et sa disposition ». Remettre en question les gestes et les espaces autour du fichier pour un défilement fluide et naturel, au doigt comme sur PC. Exemple cité : « pour changer de page sur tablette, parfois on décale juste le PDF au lieu de changer de page ». S'inspirer de la direction artistique de OneLearn (`/home/vduch/Documents/Projets/OneLearn-mvp`, refonte « manuel », `features/F-019-refonte-manuel.md`). Les thèmes de PDF peuvent être modifiés.
2. **Réponses aux cinq questions de cadrage** : « 1B, 2B, 3A, 4B mais à réétudier pour vérifier leur qualité, leur beauté et leur lisibilité, 5 OK ». Détail en section 3.
3. **Retour sur la maquette** (dernier message, non encore traité) : voir la section 4.
4. **Demande actuelle** : rédiger ce handoff pour qu'une autre IA reprenne le cadrage et l'implémentation.

## 3. Décisions confirmées

| N° | Décision |
|---|---|
| 1B | Page agrandie arrivée au bord : continuer à tirer fait résister puis tourner la page. Remplace la règle LUM-2 et l'invariant `AGENTS.md` « un pan zoomé ne pagine pas ». |
| 2B | Toucher le quart gauche ou droit tourne la page ; toucher le centre masque ou affiche les barres. Liens et notes restent prioritaires. Au doigt ou au stylet uniquement. |
| 3A | En Page par page sur PC, la molette tourne la page ; agrandie, elle défile jusqu'au bord, puis passe à la page voisine. |
| 4B | Garder les **neuf thèmes** et leurs deux variantes, réétudiés pour la qualité, la beauté et la lisibilité. Après la maquette : « Les thèmes sont OK ». |
| 5 | Les gestes d'abord ; une maquette visuelle validée avant tout code d'habillage. |

Décision interne de l'agent principal, conséquence directe de G1 et consignée dans le contrat : l'ancrage du zoom n'est garanti que sur les axes où le document agrandi dépasse la zone de lecture. Sur un axe où il tient, il est centré.

## 4. Dernier retour utilisateur — à traiter en premier

Citation, réponse à la maquette :

> 1. ça me plait, mais je trouve la mise en oeuvre un peu amateure. Je pense que l'on peut réadapter l'ui en s'inspirant de OneLearn, mais avec une touche plus moderne et avec des effets visuels de qualité. Pourquoi ne pas utiliser react pour cela ? Quelles autres options ? J'aimerais que l'on offre à ce lecteur une touche plus 2026 visuellements, comme pourrait le faire des applis comme T3 Code ou MonoCode. Prenons des libertés avec OneLearn, ce n'est qu'une inspiration. Le lecteur doit inspirer un comportement naturel et l'immersion pour l'utilisateur
> 2. Les thèmes sont OK
> 3. Lorsque barre ouverte oui, sinon non. Et il faut faire disparaitre la languette d'ouverture de la barre en haut, ou trouver une manière qu'elle ne polue pas le champ visuel du pdf, surtout sur tablette. Un appui au centre peut-etre ?
>
> PS : Il faut revoir certains agencements, surtout de la barre d'outil.

Ce qu'il faut en retenir, et ce qui reste ouvert :

- **Direction visuelle à refaire.** L'esprit plaît, mais l'exécution est jugée amateur. L'utilisateur veut :
  - un rendu plus moderne, « 2026 » ;
  - des **effets visuels de qualité** ;
  - de l'**immersion** et un comportement naturel ;
  - plus de libertés prises avec OneLearn.

  Les interdits stricts de OneLearn (pas d'ombre, pas de verre, pas de dégradé, rayon de 2 px au plus) **ne s'imposent plus**. Le guide anti-slop s'applique toujours : chaque effet doit servir la lecture ou l'orientation.
- **Références citées : « T3 Code » et « MonoCode ».** Elles n'ont **pas été vérifiées** dans cette session. Ne pas deviner leur apparence : faire une recherche web ciblée, ou demander à l'utilisateur des captures ou des liens, avant de fixer la direction.
- **Question restée sans réponse : « Pourquoi ne pas utiliser React ? Quelles autres options ? »** À répondre en termes simples. Faits utiles :
  - l'application est **déjà** en React 19, TypeScript, Vite 6 et Tailwind 3.4 ;
  - la maquette n'était qu'un fichier HTML statique jetable, hors de l'application.

  Options à présenter, avec recommandation :
  - (a) faire la prochaine maquette **directement en React dans l'application** : vrais composants, vrai rendu PDF, vrais gestes, par exemple via une entrée de prototype isolée ou une branche ;
  - (b) n'utiliser que du CSS moderne natif, sans dépendance : View Transitions API, `@starting-style`, `backdrop-filter`, `color-mix`, animations liées au défilement, requêtes de conteneur ;
  - (c) ajouter des bibliothèques. Pour l'animation et les ressorts de gestes : Motion (ex-framer-motion). Pour les menus, popovers et feuilles accessibles : Radix ou Ariakit primitives, Vaul pour les feuilles du bas sur tablette. Pour une palette de commandes : cmdk.

  Toute nouvelle dépendance exige l'**accord explicite** de l'utilisateur et doit respecter la PWA hors ligne et le poids de l'application.

  Recommandation suggérée : (a) avec (b) par défaut, et une seule dépendance d'animation seulement si les gestes de page en tirent un vrai bénéfice.
- **Thèmes : acceptés.** Les palettes de la maquette (section 6) sont validées dans leur principe.
- **Point 3 : « Lorsque barre ouverte oui, sinon non ».** La question portait sur l'affichage « page 34 sur 210 » avec barre de progression dans la bibliothèque, qui suppose d'enregistrer le nombre de pages de chaque document. La réponse semble viser le lecteur : progression affichée quand la barre est ouverte, rien quand elle est masquée. **Ambiguïté à lever** : pour la bibliothèque, faut-il enregistrer le nombre de pages ? C'est un champ supplémentaire, non destructif, dans les métadonnées IndexedDB. Ce changement touche le stockage, exclu du contrat actuel : il demande une décision et un cadrage.
- **Languette de réouverture de la barre.** Aujourd'hui, un bouton `.reader-restore` « Afficher la barre de lecture » s'affiche en haut au centre quand la barre est masquée. L'utilisateur veut la supprimer, ou qu'elle ne gêne plus la vue du PDF, surtout sur tablette. Il suggère l'appui au centre, déjà prévu par G6. Garder un moyen de réafficher au clavier et à la souris (touche H, voire survol ou mouvement près du bord haut sur PC) et un nom accessible. Les tests écrits supposent encore ce bouton (section 7) : à arbitrer avec l'auteur de tests.
- **Agencement à revoir**, surtout la barre d'outils. Pistes possibles, aucune n'est validée :
  - barre flottante compacte qui s'efface pendant la lecture ;
  - navigation et progression en bas sur tablette ;
  - regroupement des modes et de l'ajustement.

  Le contrat public LUM-2 de la barre (section 8) reste en vigueur sauf décision contraire.

Prochaine action attendue : répondre à l'utilisateur sur React et les options, lever l'ambiguïté du point 3, obtenir des références visuelles, puis refaire une maquette. Rien n'a été répondu ni implémenté depuis ce retour.

## 5. Constats techniques établis (base `058d500`)

Mesures Edge headless isolé, sur fixtures. Ce sont des simulations CDP, pas un essai Xiaomi.

- **Vide autour du document.** `#pdf-spacing-wrapper` ajoute un viewport entier de vide sur chaque bord (`paddingTop = containerHeight`, `paddingLeft = containerWidth`, et taille totale égale à deux fois la zone plus le monde).
  - À 800×1280 en Page par page ajustée : zone visible 790×1161, zone défilable **2354×3406**.
  - Le `touch-action: pan-y` à l'ajustement laisse le défilement vertical natif emmener la page dans le vide. **C'est la cause du symptôme rapporté.**
  - En Continu, la page peut dériver latéralement d'environ une largeur d'écran.
- **Arbitre du swipe** (`useReaderGestures.ts`) :
  - tour seulement si |dx| ≥ 80 px et |dx| > 1,5·|dy| (environ 33°) ;
  - aucun suivi visuel pendant le geste ;
  - désactivé dès que l'échelle dépasse l'ajustement × 1,02.
  - En simulation : 35° et 150 px ne tournent pas ; 70 px ne tourne pas ; un glissement horizontal tourne.
- **Molette.** Sans Ctrl en Page par page, elle n'est pas gérée : défilement natif dans le vide, aucun tour.
- **Thèmes actuels.**
  - « Sombre » est une copie de « Clair », « Bleu nuit » une copie de « Minuit » (`THEME_PALETTES.dark = light`, `blueNight = midnight`), et « OLED jour » équivaut à « Clair jour ».
  - Contraste encre/papier : Confort (solarized) **5,0:1** de jour et **4,1:1** de nuit ; OLED nuit 6,7:1.
  - Le filtre `feColorMatrix` inverse les teintes des images en thème sombre (un bleu devient ocre).
  - Les variantes s'appellent « Claire / Sombre », d'où une confusion avec le thème « Sombre ».
- **Interface.**
  - Barre sur deux rangées en tablette portrait.
  - Bibliothèque au gabarit « Tableau de bord » (carte en pointillés, bouton bleu très arrondi).
  - Bouton de suppression d'un document visible **uniquement au survol** : inaccessible au doigt.
  - Police `Inter` déclarée mais jamais chargée.
  - Bibliothèque en grille de cartes avec badges de notes animés.
- **Métadonnées stockées** (`RecentFileMetadata`) : `pageNumber`, `scale`, `scrollMode`, `lastVisited`, `thumbnail`, `annotations`. **Pas de nombre total de pages.**

## 6. Ce qui a été produit

### Dans le dépôt (non suivi, non commité)

- `docs/features/LUM-13-passe-ux.md` — contrat persistant :
  - lot 1 gestes, garanties G1 à G9, avec les garanties LUM-2 abandonnées ou modifiées et les preuves attendues ;
  - lot 2 habillage, six champs UX — **à réviser** selon la section 4 (direction « manuel » stricte remplacée par « plus moderne, effets de qualité, immersion ») ;
  - lot 3 bibliothèque.
- `backlog.json` (modifié) :
  - LUM-13 `en_cours` (gestes) ;
  - LUM-14 `en_cours` (habillage, maquette d'abord) ;
  - LUM-15 `a_faire` (bibliothèque) ;
  - `prochain_id` passé à 16, `backlog.py check` OK.
- `docs/features/LUM-13-handoff.md` — ce fichier.
- Tests écrits par l'auteur indépendant interrompu : voir la section 7.

### Hors dépôt : `~/.local/state/luminapdf/`

- `maquette-ux/index.html` — maquette statique jetable, polices locales OFL copiées de OneLearn dans `maquette-ux/fonts/`.
  - Paramètres d'URL : `#ecran=lecteur|biblio|vide|themes&theme=<id>&v=jour|nuit&sommaire=0|1&outils=0|1&barres=0|1&m=0|1` (`m=0` masque le panneau de pilotage).
  - Captures dans `maquette-ux/captures/`.
  - Elle reste ouverte dans une fenêtre Edge au profil `~/.local/state/luminapdf/edge-maquette`.
  - Jugée « amateur » : la **réutiliser pour les palettes et l'ossature d'information, pas pour son exécution visuelle**.
- **Palettes réétudiées et acceptées** : objet `PALETTES` de `maquette-ux/index.html`, plus `maquette-ux/palettes.json` avec les contrastes calculés par `scripts/palettes.py`.
  - Pour chaque thème et variante : `desk` (fond de l'application), `surface` (barres et panneaux), `page`/`ink` (papier et encre du rendu PDF), `text`, `muted`, `accent`, `filet`, `filetFort`.
  - Identifiants inchangés : `light`, `solarized`, `sepia`, `forest`, `midnight`, `dark`, `blue_night`, `oled`, `eink`. Les préférences enregistrées restent donc valides.
  - Contrastes : encre/papier ≥ 9,9:1 partout ; interface ≥ 11:1 ; texte secondaire ≥ 5,3:1 ; accent ≥ 7:1.
  - Identités :

    | Thème | Jour | Nuit |
    |---|---|---|
    | Clair | PDF original, sans filtre | gris neutre |
    | Confort | papier OneLearn `#FBF8F2` / `#1F1D1A` | `#1C1A17` / `#E6DFD3` |
    | Sépia | papier ancien | cuir |
    | Forêt | sauge | sous-bois |
    | Minuit | gris-bleu ardoise | |
    | Sombre | graphite à faible éblouissement | |
    | Bleu nuit | indigo | |
    | OLED | contraste maximal | noir absolu |
    | eInk | niveaux de gris | niveaux de gris |

  - Variantes renommées **« Jour / Nuit »**.
  - De nuit, le filtre de la maquette applique `hue-rotate(180deg)` avant la matrice papier/encre : les figures gardent leurs teintes (le bleu reste bleu). C'est compatible avec `AGENTS.md` : pas d'`invert()`, toujours `feColorMatrix`. Effet à vérifier sur de vraies images PDF.
- `lum13/snapshot-avant-cadrage.json` et `lum13/snapshot-avant-tests.json` — empreintes `gate_check.py`.
- `lum13/vite-3016.log` — journal du serveur de vérification. `lum13/auteur-tests-run-interrompu.log` et `lum13/sondes-auteur-tests/` — sortie et sondes de l'auteur de tests.
- `etude-rendu/` — copie de l'étude moteur de l'autre session (section 9).
- `scripts/palettes.py` — calcul des contrastes.

## 7. État des tests du lot 1 — non acceptés

L'auteur de tests indépendant (`vd-pi-test-writer`, Sonnet 5.5 high, run `8754d42c-4477-4130-921e-f707410177af`) a été **tué par SIGTERM** à 23 h 33 avant d'écrire son rapport. Il n'existe aucun classement final des rouges.

Fichiers laissés, non suivis, sauf `reader.test.mjs` qui est modifié :

- `tests/gestures.test.mjs` — 866 lignes, environ 45 scénarios couvrant G1 à G8 (titres visibles par `grep -n "scenario(" tests/gestures.test.mjs`).
- `tests/helpers/gesture-kit.mjs` — outils de boîte noire : `snap`, `until`, entrées CDP, tolérances `MARGIN = 24` et `EPS = 2`.
- `tests/helpers/linked-pdf.mjs` — génère un PDF de 5 pages avec liens internes (page 2 vers 5 dans le quart droit, page 4 vers 1 dans le quart gauche).
- `tests/reader.test.mjs` — adapté seulement sur les deux garanties prévues :
  - ancrage restreint aux axes qui dépassent, via un helper `exceeding` ;
  - suppression de « repeated zoomed pan at edge never turns », remplacée par un commentaire renvoyant à G5. L'assertion « zoomed gesture pans, never turns » sur glissement vertical est conservée.

Exécution partielle contre la base actuelle (`~/.local/state/luminapdf/lum13/sondes-auteur-tests/full1.log` et le journal du run) :

| Garantie | Résultat partiel |
|---|---|
| G1 | 9 scénarios rouges, attendu |
| G2 | ancrage Ctrl+molette et pincement « les deux axes dépassent » verts ; centrage et « pas de vide au dézoom » rouges, attendu |
| G3 | ±5 % et −6 % rouges, attendu ; +15 % vert |
| G4 | les 5 premiers rouges, **dont « glissement ≈55° ne tourne pas » et « vertical pur ne déplace pas la page »** |
| G5 à G8 | **non exécutés** |

Les deux cas G4 signalés devraient sans doute être verts sur la base actuelle ou échouer pour une autre raison : **probable problème de harnais, à classer**.

Gate : `gate_check.py verify --role vd-pi-test-writer --phase post-run` donne **FAIL** sur `dev-dist/sw.js`. Cette altération vient du **redémarrage du serveur Vite par l'agent principal à 23 h 18**, pas de l'auteur de tests : `vite-plugin-pwa devOptions.enabled` régénère la chaîne `revision` de `index.html`, et le fichier était déjà modifié avant. Le delta tests est cohérent avec la mission.

À faire :

- lancer un auteur de tests **fresh** (ou relancer le même run avec un relais explicite) pour finir l'exécution de référence, classer chaque rouge (fonctionnel attendu ou harnais) et corriger les problèmes de harnais ;
- intégrer les changements de contrat issus de la section 4, surtout la languette et l'affichage de la barre ;
- l'agent principal inspecte ensuite le delta tests et constate les rouges avant de lancer le worker ;
- **ne pas** confier la correction des tests au worker de production.

## 8. Contrats à préserver et périmètre

- **Contrat public LUM-2** (`docs/features/LUM-2-lecteur-pwa.md`) :
  - noms accessibles « Lecture continue » / « Lecture page par page » avec `aria-pressed` ;
  - champ numérique « Aller à la page » ;
  - « Ajuster la page » ;
  - « Outils de lecture » avec `aria-expanded` et `aria-controls="reader-tools"` ;
  - `#reader-toolbar` `role="toolbar"` ;
  - Escape et restitution du focus ;
  - cibles de 44 px, absence de débordement à 360 px.

  Exceptions déjà décidées : G2 et G5. La languette de réouverture est à rediscuter.
- **Invariants `AGENTS.md`** :
  - `#pdf-camera` en `transform: scale`, origine `0 0` ; espacements hors caméra ;
  - dimensions monde depuis `#pdf-workspace`, jamais `container.scrollWidth` ;
  - `scrollToPage` et `fitPage` comme passages communs ;
  - virtualisation `IntersectionObserver` avec marge de 2000 px ;
  - `OutlinePanel` hors caméra ; panneaux fermés masqués sans démontage ;
  - `ThemeFilterDefs` en `feColorMatrix`, pas d'`invert()` ;
  - dépendances primitives dans les effets.

  `AGENTS.md` et `ARCHITECTURE.md` sont à aligner **après acceptation** de G5.
- **Exclus de la passe** :
  - stockage et identifiants (sauf décision sur le nombre de pages, section 4) ;
  - annotations persistantes ;
  - IA, cloud et Drive (fonctionnement inchangé, placement visuel seulement) ;
  - Electron ;
  - déploiement ;
  - nouvelles dépendances sans accord.
- **Ne jamais toucher** :
  - les fins de ligne CRLF des nombreux fichiers suivis déjà modifiés ;
  - `dev-dist/sw.js` (au-delà de la régénération automatique par le serveur de développement) ;
  - les fichiers non suivis préexistants : `.team_sync/PROTOCOL.md`, `.team_sync/orchestration/`, `.team_sync/orchestrator.py`, `tests/storage-extra.test.mjs`, `tests/fixtures/storage-damaged-page.pdf`, `thele_cyberpunk.txt`.

## 9. Session parallèle : étude du moteur de rendu

Une autre session Pi (`subagent-chat-01a1dc1e-e288-72c1`, même dépôt) a mené, à la demande de l'utilisateur, une étude en lecture seule de la netteté et des performances du rendu : pas de saccade, pas de phase basse qualité à tous les zooms. Rapport : `~/.local/state/luminapdf/etude-rendu/luminapdf-etude-rendu-2026-11-14.md` (copie de `/tmp`), avec ses mesures JSON.

Constats :

- le délai de 180 ms empêche tout rerendu pendant un zoom continu ;
- à 800 %, un canevas de 6652×8731, soit environ 232 Mo RGBA, avec des pauses de 133 à 183 ms ;
- l'ancien instantané reste visible de 0,45 à 1,04 s ;
- l'indication `loading` eager/lazy n'est pas une priorité réelle.

Piste de l'étude : un rendu haute définition limité à la surface visible, à comparer avec PDF.js de référence (`PDFPageDetailView`). Ce n'est **pas** dans le périmètre de LUM-13 : ne pas l'élargir.

**Engagement pris envers cette session** : la prévenir par `intercom` juste avant de lancer le worker qui modifiera `PdfViewer.tsx`, `useReaderGestures.ts` ou `App.tsx`, puis à la fin, pour dater sa référence. Sa référence est figée dans `/tmp/lumina-render-study.d2w8az` (volatile). Sources à la base : `PdfViewer.tsx` sha256 `876bdaa2…`, `useReaderGestures.ts` `e1e147b2…`, `App.tsx` `dd25cebd…`.

## 10. Environnement

- Racine : `/home/vduch/Documents/Projets/luminapdf`, branche `master`, HEAD et base `058d500d79670699b20717c83ed02a793f0dc654`, index vide.
- **Incohérence préexistante** : le relais de LUM-4 dit « pas de commit », mais les commits `2e7d6ec`, `cf9d751` et `058d500` existent. À réconcilier avec l'utilisateur, sans en faire une tâche implicite.
- **Serveur de vérification** : `http://127.0.0.1:3016`, lancé par l'agent principal avec toutes les `VITE_*` vides (services distants désactivés). Journal dans `~/.local/state/luminapdf/lum13/vite-3016.log`. Pour le relancer :

  ```bash
  VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_GEMINI_API_KEY= VITE_GOOGLE_APP_ID= VITE_GOOGLE_CLIENT_ID= VITE_GOOGLE_API_KEY= npx vite --host 127.0.0.1 --port 3016 --strictPort
  ```

  Ce redémarrage régénère `dev-dist/sw.js`.
- **Serveur de l'utilisateur** (port 3000, toutes interfaces) : arrêté depuis le redémarrage de la machine vers 23 h 07. Il n'a pas été relancé : c'est le sien.
- **Commandes** :
  - suites lecteur : `READER_TEST_URL=http://127.0.0.1:3016 node --test --test-concurrency=1 tests/reader.test.mjs tests/reader-regressions.test.mjs` ;
  - gestes : `… tests/gestures.test.mjs` ;
  - contrôle de types : `npx tsc --noEmit` ;
  - construction : `npm run build` (de préférence vers une sortie temporaire).
- Edge : `/usr/bin/microsoft-edge`. Harnais CDP : `tests/reader-cdp.mjs`.
- `/tmp` est effacé au redémarrage (déjà arrivé une fois ce soir) : garder les preuves sous `~/.local/state/luminapdf/`.

## 11. Suite recommandée

1. **Répondre à l'utilisateur** sur la section 4, en français simple :
   - React et les options (sans dépendance, CSS moderne, ou bibliothèques soumises à son accord), avec une recommandation ;
   - lever l'ambiguïté du nombre de pages dans la bibliothèque ;
   - demander des références visuelles (T3 Code, MonoCode : captures ou liens) ;
   - proposer une nouvelle maquette **dans l'application React** : barre et agencement repensés, plus de languette, immersion, effets de qualité. Les palettes acceptées sont conservées.
2. **Réviser** `docs/features/LUM-13-passe-ux.md`, lots 2 et 3 : six champs UX, preuves, éventuelle dépendance, languette ou affichage des barres. Réviser aussi G6 si l'affichage des barres change (immersion, progression visible seulement barre ouverte).
3. **Lot 1** :
   - auteur de tests fresh pour finir et classer les rouges, amender selon la nouvelle décision sur la barre ;
   - l'agent principal constate les rouges ;
   - prévenir la session de rendu ;
   - `gate_check snapshot` ;
   - worker fresh (production seulement : `useReaderGestures.ts`, `PdfViewer.tsx`, `App.tsx`, éventuellement `index.css` et `types.ts`) ;
   - `verify` ;
   - suites, `tsc`, build ;
   - Edge PC et tablette émulée ;
   - revue fresh.

   Les gestes et l'habillage partagent la barre : décider si le lot 1 attend la nouvelle disposition de la barre (impact sur G6) ou s'il avance avec la barre actuelle.
4. **Lot 2, puis lot 3**, après validation de la maquette par l'utilisateur.
5. **Essai de l'utilisateur sur Xiaomi Pad 6 et sur PC.** Puis proposer des commits conventionnels en français, un résultat par commit, et **attendre son accord** avant de commit ou de push.

Backlog : LUM-13 et LUM-14 restent `en_cours`, leurs relais renvoient à ce fichier.
