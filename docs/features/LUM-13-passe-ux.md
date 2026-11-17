# LUM-13 à LUM-15 — Passe UX/UI : gestes, habillage et bibliothèque

## Demande et décisions confirmées

Après la stabilisation (LUM-1, LUM-2, LUM-4), l'utilisateur demande le 14 novembre 2026 une passe UX/UI : rendre l'application belle et agréable dans son agencement, et remettre en question les gestes et l'espace autour du fichier pour un défilement fluide et naturel au doigt comme sur PC. Symptôme rapporté sur tablette : « pour changer de page, parfois on décale juste le PDF au lieu de changer de page ». Direction artistique à reprendre de OneLearn (`/home/vduch/Documents/Projets/OneLearn-mvp`, refonte « manuel », F-019). Les thèmes PDF peuvent être modifiés.

Réponses de l'utilisateur du 14 novembre 2026 :

1. **B** — page agrandie arrivée au bord : continuer à tirer fait résister puis tourner la page. Remplace la règle LUM-2 « un pan zoomé ne pagine pas, même au bord ».
2. **B** — un toucher sur le bord gauche/droit tourne la page ; un toucher au centre masque/affiche les barres. Liens et notes restent prioritaires.
3. **A** — en Page par page sur PC, la molette tourne la page ; agrandie, elle défile d'abord jusqu'au bord puis passe à la page voisine.
4. **B, réétudiés et validés** — les neuf thèmes et leurs variantes Jour / Nuit sont conservés et leurs palettes réétudiées (contrastes encre/papier ≥ 9,9:1, interface ≥ 11:1) ont été validées par l'utilisateur.
5. **OK** — les gestes d'abord ; une maquette visuelle est préparée en parallèle hors du dépôt et validée par l'utilisateur avant tout code d'habillage.

Retours complémentaires du 15 novembre 2026 (après première maquette statique) :

- **1A — Maquette en React et effets CSS modernes natifs** : construire la maquette en React (vrais composants, vrai rendu PDF `react-pdf`, vrais états interactifs) avec les effets CSS natifs du navigateur (`backdrop-filter`, `color-mix`, élévation de feuille et de surfaces flottantes, transitions courtes), sans aucune nouvelle dépendance externe.
- **2A — Nombre total de pages dans la bibliothèque** : mémoriser le nombre total de pages (`numPages?: number`, champ optionnel non destructif dans `RecentFileMetadata`) dès qu'un document est ouvert, afin d'afficher « Page 34 sur 210 » et une fine jauge d'avancement dans la bibliothèque.
- **3B + Option A validée — Agencement « poste de commande 2026 » à bandeau haut pleine largeur** :
  - **En haut (`#reader-toolbar`)** : bandeau flottant pleine largeur (`width: 100%`, surface translucide `backdrop-filter: blur(22px)`, sans bordures latérales ni supérieure, simple filet inférieur subtil `color-mix`), organisé en trois pôles sur une seule rangée : à gauche (`Bibliothèque` + titre du document), au centre (sélecteur segmenté `Continu` / `Page par page`), à droite (`Sommaire`, `Ajuster la page`, `Outils de lecture`).
  - **En bas (capsule flottante de navigation)** : dock compact centré en bas (`Page précédente`, champ `Aller à la page` `/ total`, jauge de progression interactive et `Page suivante`).
  - **Allègement des contours** : suppression des bordures de sous-boîtes et des filets de séparation internes dans le panneau `Outils de lecture`, le `Sommaire` et la `Bibliothèque` (regroupement par contraste doux de surface et respiration).
  - **Immersion sans languette visible** : lorsque les barres sont masquées (toucher au centre selon G6, touche `H`, ou action « Masquer la barre (H) »), le bandeau du haut et la capsule du bas s'effacent ensemble. Aucune languette visuelle permanente n'apparaît sur le PDF ; un bouton `.reader-restore` (`aria-label="Afficher la barre de lecture"`) invisible au repos (`opacity: 0`), révélé uniquement au focus clavier (`:focus`, `:focus-visible`) ou au survol du bord supérieur à la souris sur PC, conserve l'accessibilité clavier/souris.

Parcours **protégé** : géométrie, zoom et gestes partagent les états de page et d'échelle de `App`/`PdfViewer` et peuvent régresser ensemble ; l'habillage change toute l'interface. Un seul writer à la fois dans ce checkout ; garanties de tests examinées par un auteur indépendant avant production ; worker fresh ; observation Edge par le parent ; revue fresh avant acceptation. Trois tâches de suivi : LUM-13 (lot 1), LUM-14 (lot 2), LUM-15 (lot 3).

## Reprise du 15 novembre — corrections avant acceptation

La production a été intégrée sous Antigravity, mais la revue finale n'avait pas démarré. La reprise conserve l'Option A et les décisions précédentes, sans nouvelle dépendance, déploiement ni appel distant.

La revue indépendante a mis en évidence des régressions à corriger dans les lots existants :

- conserver un retrait de document effectif, y compris le dernier, sans réapparition depuis une ancienne liste ;
- rendre Ouvrir/Reprendre accessibles par Tab, Entrée et Espace, séparément de Retirer ;
- rétablir la navigation tactile et clavier par la jauge, via la navigation commune ;
- laisser la molette défiler les panneaux et champs sans tourner le PDF ; conserver le Retour normal du navigateur, sans réinjection d'historique ;
- reprendre exactement les palettes approuvées dans `~/.local/state/luminapdf/maquette-ux/palettes.json`, leurs contrastes et les aperçus ;
- remettre le Sommaire directement dans le bandeau, les trois pôles et la surface translucide de l'Option A ; garder toutes les commandes utilisables à 360 px ;
- rétablir les accès facultatifs à la connexion et à Google Drive, avec leurs branchements existants, sans modifier ni exercer les services distants ;
- distinguer chargement, bibliothèque vide et erreur récupérable. Ne pas promettre une réouverture hors ligne non prouvée.

Preuves choisies : régressions navigateur indépendantes sur le retrait du dernier document, les activations clavier, la jauge, la molette des panneaux, l'historique et l'erreur de lecture ; correspondance des palettes et contrastes ; examen des branchements distants sans connexion ; observation Edge du bandeau, des panneaux et de la bibliothèque aux tailles contractuelles. Les suites existantes restent conservées ; aucune nouvelle série de gestes physiques n'est déduite de simulations.

## Constats de départ (base `058d500`, 14 novembre 2026)

Observés dans Edge headless isolé (serveur local, services distants désactivés), fixtures `tests/fixtures/` ; simulation CDP, pas un essai Xiaomi.

- `#pdf-spacing-wrapper` ajoute une zone vide d'une largeur et d'une hauteur de viewport de chaque côté du document. À 800×1280 en Page par page ajustée : zone visible 790×1161, zone défilable 2354×3406. Un pan vertical ou diagonal (touch-action `pan-y`) emmène la page dans ce vide. En Continu, la colonne peut dériver latéralement d'une largeur d'écran.
- Le swipe ne tourne qu'avec |dx| ≥ 80 px et |dx| > 1,5·|dy| (environ 33°) ; aucun retour visuel pendant le geste. Simulé : 35° et 150 px → pas de tour ; 70 px → pas de tour ; horizontal → tour.
- Swipe désactivé dès que l'échelle dépasse l'ajustement de 2 %, même après un pincement involontaire.
- En Page par page, la molette sans Ctrl défile dans le vide ; elle ne tourne jamais la page.
- Visuel : barre fonctionnelle mais générique, deux rangées en tablette portrait ; bibliothèque au gabarit « Tableau de bord » (carte en pointillés, bouton bleu arrondi) ; suppression d'un document visible seulement au survol ; 9 thèmes × 2 variantes réglés par deux listes déroulantes ; police `Inter` déclarée mais jamais chargée.

## Lot 1 — LUM-13 : gestes et espace autour du document

### Résultat

Au doigt comme à la souris, chaque geste a un seul sens prévisible : une page ajustée ne peut plus être déplacée dans le vide, tourner une page suit le doigt et tolère un geste imparfait, une page agrandie se parcourt jusqu'à ses bords puis se tourne en tirant au-delà, et la molette tourne les pages en Page par page.

### Garanties

Vocabulaire : *zone de lecture* = le conteneur défilant du lecteur ; *document* = la page courante en Page par page, la colonne de pages en Continu ; *ajustée* = échelle ≤ ajustement × 1,02.

- **G1 — Espace borné.** Sur chaque axe, si le document à l'échelle courante tient dans la zone de lecture, il y est centré et aucun défilement n'est possible sur cet axe (ni au doigt, ni à la molette, ni au trackpad). Sinon, le défilement s'arrête quand le bord du document atteint le bord de la zone, à une marge extérieure de 24 px au plus. Une page ajustée, en Page par page, ne bouge donc dans aucune direction sans changer de page.
- **G2 — Zoom ancré, garantie ajustée.** Ctrl+molette reste ancré au curseur et le pincement au milieu des doigts (tolérance 8 px) sur chaque axe où le document agrandi dépasse la zone et où la position ancrée est atteignable. Sur un axe où il tient, il reste centré ; près d'un bord, il reste contre ce bord au lieu de créer du vide. Une molette ordinaire ne zoome jamais.
- **G3 — Aimant d'ajustement.** À la fin d'un pincement (tous doigts levés), une échelle à ±8 % de l'ajustement revient exactement à l'ajustement, dans les deux modes.
- **G4 — Tourner une page ajustée (Page par page).** Pendant un glissement à un doigt à dominante horizontale, la page suit le doigt horizontalement, sans changer de page avant le relâchement. Au relâchement, elle tourne d'exactement une page si |dx| ≥ |dy| et soit |dx| ≥ 25 % de la largeur de la zone, soit un geste vif (|dx| ≥ 40 px, vitesse finale ≥ 0,5 px/ms) ; sinon elle revient à sa place. Vers la gauche : suivante ; vers la droite : précédente. Bornes respectées (aucun tour avant la première ni après la dernière, retour en place). Un glissement vertical ne déplace pas la page et ne la laisse jamais décalée. Maintenir le doigt ne répète rien. Interruption système, second doigt, changement de mode ou de document annulent le geste et remettent la page en place.
- **G5 — Page agrandie (Page par page).** Un doigt fait défiler la page dans ses limites (G1), avec l'inertie native. Si, au début du geste, la page est déjà contre son bord dans la direction tirée (bord droit visible pour un glissement vers la gauche, ou page tenant en largeur), le dépassement horizontal produit une résistance visible (la page se décale d'une fraction du doigt) ; au relâchement, elle tourne d'une page si le déplacement horizontal du doigt atteint 25 % de la largeur de la zone, sinon elle revient. Un geste commencé loin du bord ne fait que défiler, même s'il l'atteint. La page tournée garde le zoom et s'affiche à son début (haut, bord gauche) en avançant, à sa fin (bas, bord droit) en reculant. Aucun tour par les bords haut/bas au doigt.
- **G6 — Toucher.** Uniquement au doigt ou au stylet, jamais au clic de souris. Un toucher (un seul contact, déplacement < 10 px, durée < 350 ms) hors élément interactif (lien PDF, bouton, champ, note et sa fenêtre, panneaux), hors mode « ajout de note », et qui n'interrompt pas un défilement en mouvement :
  - quart gauche de la zone : page précédente ; quart droit : page suivante — en Page par page (zoom conservé, placement de G5 si agrandie) comme en Continu (navigation commune vers la page voisine) ; bornes respectées ;
  - bande centrale : masque la barre de lecture si elle est visible, l'affiche sinon (même état que « Masquer la barre (H) » et le bouton « Afficher la barre de lecture »). Cela ne change ni la page ni un zoom manuel ; une page ajustée peut se réajuster à l'espace libéré.
- **G7 — Molette et trackpad (Page par page, sans Ctrl).** Si la page tient verticalement, une impulsion vers le bas tourne vers la suivante, vers le haut vers la précédente ; idem horizontalement (trackpad, Maj+molette) si la page tient en largeur, droite = suivante. Au plus une page par geste continu (une rafale d'inertie de trackpad ne tourne qu'une page) ; une nouvelle impulsion après une courte pause tourne la suivante ; les micro-mouvements sous un seuil n'ont pas d'effet. Si la page dépasse verticalement, la molette la fait défiler ; une impulsion commencée alors que le bas (resp. le haut) est atteint tourne vers la suivante affichée à son haut (resp. la précédente affichée à son bas). En Continu, la molette reste le défilement natif.
- **G8 — Mouvement.** Le suivi du doigt est direct ; les animations de retour et de sortie durent au plus 250 ms et sont instantanées sous `prefers-reduced-motion`. Le suivi ne relance pas le rendu PDF à chaque mouvement.
- **G9 — Acquis conservés.** Tout le contrat public LUM-2 hors des deux points remplacés (G2, G5) : modes directement accessibles et page conservée, saisie de page, clavier et raccourcis depuis les boutons, panneau d'outils sans déplacement du PDF et Escape/focus, panneaux fermés hors focus, compteur fidèle à la page visible, changement de format portrait/paysage avec ajustement conservé sans écraser un zoom manuel, restauration de la page à l'ouverture, liens internes, pose de note en mode note, virtualisation et rendu différé.

### Garanties abandonnées ou modifiées

- LUM-2 « page agrandie : un doigt ne tourne jamais une page, même au bord » → remplacée par G5 (décision 1B).
- LUM-2 « point d'ancrage du zoom conservé » → limitée par G2 aux axes où le document dépasse la zone (conséquence directe de G1, sans vide autour du document). Les tests correspondants sont adaptés par l'auteur de tests indépendant ; aucune autre assertion n'est retirée.
- `AGENTS.md` et les invariants de lecture d'`ARCHITECTURE.md` sont alignés sur G1/G2/G5 après acceptation technique locale ; l'acceptation utilisateur et l'essai Xiaomi restent attendus.
- LUM-17 (décisions utilisateur du 17/11/2026) : G6 « une page ajustée peut se réajuster à l'espace libéré » est remplacé par « masquer/afficher les barres ne déplace jamais le PDF » ; G1 vertical : la marge aux extrémités vaut réserve des barres + 8 px (au plus réserve + 24 px), l'horizontal est inchangé. Voir `docs/features/LUM-17-barres-superposees.md`.

### Périmètre

Production : `src/hooks/useReaderGestures.ts`, `src/components/PdfViewer.tsx`, `src/App.tsx` (liaison barre/toucher central, molette si nécessaire), `src/index.css` et `src/types.ts` seulement si indispensable. Noms de code en anglais (convention du projet), commentaires en français. Invariants `AGENTS.md` maintenus : espacements hors caméra, `transform: scale` d'origine `0 0` sur `#pdf-camera`, dimensions monde depuis `#pdf-workspace` et jamais `container.scrollWidth`, `scrollToPage`/`fitPage` comme passages communs, virtualisation `IntersectionObserver` 2000 px, dépendances primitives dans les effets.

Exclus : apparence (lot 2), bibliothèque (lot 3), stockage et identifiants, annotations persistantes, IA/cloud/Drive, Electron, dépendances, double-toucher pour zoomer, affichage de la page voisine pendant le glissement, déploiement. Ne pas normaliser les fins de ligne des fichiers existants ni toucher aux changements préexistants (archives, `dev-dist/sw.js`, tests non suivis `tests/storage-extra.test.mjs` et `tests/fixtures/storage-damaged-page.pdf`).

### Validation attendue

- **Tests indépendants avant production** (auteur distinct, boîte noire, Node + Edge via `tests/reader-cdp.mjs`) : G1 à G7 et G9 discriminants, nouveaux scénarios dans un fichier dédié, adaptation des seules deux assertions LUM-2 ci-dessus. Signal rouge attendu sur l'état actuel pour G1, G4 (angle, suivi), G5, G6, G7. Les gestes CDP restent une simulation.
- **Worker** : `npx tsc --noEmit`, `npm run build` (sortie temporaire), aucun artefact de test.
- **Parent** : exécution des suites lecteur et stockage, observation Edge PC 1440×900 et tablette 800×1280 / 1280×800 (Page par page ajustée et agrandie, Continu), mouvement réduit ; revue fresh.
- **Utilisateur** : essai sur Xiaomi Pad 6 (seule preuve de fluidité et de confort du geste), puis sur PC à la souris/trackpad.

## Lot 2 — LUM-14 : habillage du lecteur et thèmes (maquette React d'abord)

Six champs UX :

1. **Intention** : un lecteur immersif, calme et moderne (« esprit 2026 »), alliant la précision d'un poste de commande épuré (T3 Code / MonoCode) à la chaleur éditoriale des palettes papier/encre de OneLearn.
2. **Tâche prioritaire** : lire et naviguer dans un PDF, dans les deux modes, sur tablette et PC, sans encombrement visuel.
3. **Direction (décisions 1A, 3B et Option A validée)** :
   - **En haut (`#reader-toolbar`)** : bandeau pleine largeur sur une seule rangée (surface translucide à effet verre dépoli `backdrop-filter: blur(22px)`, sans bordures latérales ni supérieure, filet inférieur subtil `color-mix`), regroupant à gauche `Bibliothèque` et le titre du document en `Literata`, au centre le sélecteur segmenté tactile (`Continu` / `Page par page`), et à droite `Sommaire`, `Ajuster la page` et `Outils de lecture`.
   - **En bas (capsule flottante de navigation)** : dock compact centré en bas de l'écran (proche des pouces sur tablette) regroupant `Page précédente`, champ `Aller à la page` (`/ total`), jauge de progression interactive intégrée et `Page suivante`.
   - **Allègement des contours** : aucun contour de boîte imbriquée ni ligne de séparation dure dans les panneaux (`#reader-tools`, `Sommaire`) ni dans la `Bibliothèque` ; les groupes sont distingués par des surfaces douces sans bordure et par l'espacement.
   - **Immersion sans languette** : lorsque les barres sont masquées (toucher au centre selon G6, touche `H`, ou action « Masquer la barre (H) »), le bandeau du haut et la capsule du bas s'effacent ensemble avec une transition fluide. La languette permanente en haut est supprimée pour ne jamais polluer le champ visuel du PDF ; un bouton `.reader-restore` (`aria-label="Afficher la barre de lecture"`) invisible au repos (`opacity: 0`), qui ne se révèle qu'au focus clavier (`:focus`, `:focus-visible`) ou au survol du bord supérieur à la souris sur PC, conserve l'accessibilité clavier/souris.
   - **Panneaux** : `Sommaire` en colonne épurée à gauche sur grand écran (tiroir superposé sur tablette portrait) avec indicateur de section active sans lignes de séparation ; panneau `Outils de lecture` (`#reader-tools`) en fenêtre flottante sans boîtes encadrées internes (stepper de zoom, bascule segmentée `Jour / Nuit`, grille des 9 aperçus papier/encre, pose et couleurs de notes, actions rapides avec raccourcis).
   - **Feuille PDF** : relief de feuille réaliste et sobre sur le bureau (`--desk`), sans bordure brute artificielle.
4. **Système** : polices locales OFL de OneLearn (`Literata` pour les titres et l'identité éditoriale, `Atkinson Hyperlegible Next` pour les contrôles et données tabulaires), intégrées sans requête externe ; jetons `--lumina-*` et CSS natif moderne (`backdrop-filter`, `color-mix`, rayons harmonisés 8–14 px pour les surfaces et contrôles) ; aucune dépendance externe ajoutée ; cibles ≥ 44 px ; mouvement 150–220 ms désactivable (`prefers-reduced-motion`).
5. **À éviter** : languette permanente sur le PDF en lecture immersive, liens HTML soulignés bruts en guise de boutons, bordures carrées dures de formulaire ancien, cartes décoratives sans fonction, outils accessibles uniquement au survol, refonte du moteur PDF.
6. **Preuves** : maquette React hors dépôt (`~/.local/state/luminapdf/maquette-ux/`) avec vrai rendu `react-pdf` validée par l'utilisateur dans Edge avant code de production ; après intégration, captures Edge PC/tablette portrait/paysage/360 px en Jour et Nuit, barres ouvertes et masquées, menus ouverts/fermés, clavier et focus, contrastes mesurés.

**Thèmes (décision 4B, palettes validées)** : les neuf thèmes (`light`, `solarized`, `sepia`, `forest`, `midnight`, `dark`, `blue_night`, `oled`, `eink`) et leurs variantes renommées `Jour / Nuit` sont conservés avec les palettes validées (`~/.local/state/luminapdf/maquette-ux/palettes.json`, contraste encre/papier ≥ 9,9:1, interface ≥ 11:1). De nuit, `hue-rotate(180deg)` précède la matrice `feColorMatrix` pour préserver les teintes des figures.

Contrats publics LUM-2 de la barre (noms accessibles, `aria-pressed`, `#reader-toolbar`, `#reader-tools`, champ « Aller à la page », bouton « Ajuster la page ») conservés.

## Lot 3 — LUM-15 : bibliothèque et états (décision 2A)

Même système visuel que le lot 2, maquetté avec lui en React :
- **Stockage (décision 2A)** : ajout du champ optionnel non destructif `numPages?: number` dans `RecentFileMetadata` (IndexedDB), mis à jour dès l'ouverture d'un document lorsque son nombre de pages est connu.
- **Écran Bibliothèque** : carte vedette « Reprendre » en tête (miniature soignée, titre en `Literata`, « Page 34 sur 210 · 16 % » avec jauge de progression fine, bouton « Reprendre à la page 34 »), suivie des « Lectures récentes » avec miniature, barre de progression et mention « Page X sur Y » (ou « Page X » si le total n'est pas encore connu) ; actions (`Ouvrir`, `Retirer`) toujours accessibles au doigt et au clavier (cibles ≥ 44 px, jamais uniquement au survol) ; import par bouton et glisser-déposer ; Google Drive, connexion et sélecteur rapide de thème/apparence en barre ou pied de page sans modifier le fonctionnement des services distants ; états vide, chargement et erreur sous une même forme claire (titre, cause, action).

## Affinage demandé — sobriété et finition

Après essai, l'utilisateur juge le résultat meilleur mais demande d'enlever les automatismes « fait par IA » en appliquant `/home/vduch/Documents/guide-ux-ui-anti-slop.md`. Ce delta remplace les choix décoratifs précédents, pas l'agencement ni les fonctions validés.

1. **Intention** : un outil de lecture personnel précis, calme, sans mise en scène promotionnelle.
2. **Priorité** : reprendre un document, parcourir les autres et importer un PDF sans chercher parmi des blocs décoratifs.
3. **Direction** : bibliothèque plus compacte ; hiérarchie par alignement, typographie et espace ; vrais aperçus PDF ; peu de surfaces et d'ombres, réservées aux superpositions. Rayon modéré pour les commandes, capsule de navigation conservée comme groupe fonctionnel.
4. **Système conservé** : palettes approuvées, polices locales, bandeau trois pôles, navigation inférieure, thèmes Jour/Nuit, cibles de 44 px, noms accessibles, focus et mouvement réduit. Pas de nouvelle police, dépendance ni changement des gestes.
5. **À retirer** : intitulés en capitales espacées avec icônes redondantes, titre de bibliothèque surdimensionné, point d'identité arbitraire, badges de progression et de sauvegarde décoratifs, faux contenu dessiné sur les miniatures, ombres et soulèvements des lectures, grand encart d'import à vocation de vitrine, arrondis systématiquement en pilules. Les avertissements utiles restent lisibles, sans répétition ni promesse nouvelle.
6. **Preuves** : comparaison avant/après dans Edge graphique (vide et plusieurs lectures, PC, 800 px et 360 px, Jour/Nuit, outils et sommaire) ; commandes tactiles mesurées, clavier/focus et absence de débordement ; suites UX existantes pour les actions et palettes, régressions du lecteur, TypeScript et construction.

Parcours **assisté** pour ce delta compris et réversible de présentation : worker UX fresh, aucune modification des états, services, stockage, gestes ou contrats publics. Aucun nouveau cas de test nécessaire : les garanties sont déjà exercées par les suites indépendantes existantes, complétées par l'observation graphique parentale. Revue supplémentaire seulement si une frontière fonctionnelle ou une preuve insuffisante apparaît.

**Résultat local** : quatre fichiers de présentation affinés par worker fresh Sol high, puis finition de deux filets et du texte de pied par le parent. Titres sobres, reprise sans ombre, autres lectures en lignes, import compact, boutons à rayons modérés et faux contenu décoratif supprimé ; commandes, thèmes et avertissements utiles conservés. Parent : comparaison avant/après dans Edge graphique, vide et plusieurs documents, 1440×900, 800×1280 et 360×800, Jour/Nuit et outils ; aucun débordement horizontal relevé, commandes visibles mesurées à au moins 44 px. Pas de nouvelle validation physique Xiaomi ni de conformité WCAG globale.

**Preuves** : TypeScript et construction finaux réussis avec services distants désactivés et sortie temporaire ; suites UX et régressions lecteur **34/34**, dont 18 palettes. Les deux premières exécutions ont révélé une préparation de test trop rapide : les titres HTML précédaient parfois les boutons dans l'arbre d'accessibilité Edge. Le parent a observé cette latence dans un contexte isolé (boutons géométriquement présents, publication accessible au relevé suivant) ; un auteur fresh Sol high a ajouté uniquement une attente conditionnelle dans les préparations UX1/UX2, délai inchangé, aucune assertion ni action native retirée. Sa passe finale unique est verte. Delta tests du worker de production nul ; delta de l'auteur de tests limité à cette synchronisation. Une régénération Vite du fichier Workbox préexistant a été classée à part, sans rollback ni nettoyage.

Acceptation technique locale de cet affinage ; retour visuel et essai réel sur tablette encore attendus. Journaux et captures temporaires : `/tmp/luminapdf-sobriete/`. L'utilisateur a ensuite autorisé les commits locaux de la refonte et de l'affinage, pas leur envoi ni un déploiement. Les modifications préexistantes hors périmètre restent à part, notamment l'ancienne poursuite de migration après erreur ; seuls le champ de nombre de pages, sa conservation et la récupération des promesses rejetées sont retenus dans ce fichier de stockage. La sélection exacte a été contrôlée hors du dossier de travail : TypeScript et quatre cas ciblés de migration/récupération réussis. Aucun nouveau service ni nouvelle dépendance.

## Bilan local du 15 novembre

Acceptation technique locale, **pas acceptation utilisateur ni diffusion**. Base et HEAD `058d500`, index vide, modifications préexistantes conservées. Revue fresh Sol xhigh : neuf écarts réels dans l'intégration Antigravity, corrigés par worker fresh Sol high puis relecture ciblée sans finding. Tests de régression écrits auparavant par un auteur fresh Sol xhigh ; même famille de modèle, contextes distincts. Le worker n'a modifié aucun test.

- Les sept groupes UX indépendants ont d'abord reproduit les défauts. Après correction : UX1–5 verts, UX6/7 20/20 (dont les 18 palettes), puis UX4 recontrôlé après exclusion des fenêtres de notes. La transparence RGBA est équivalente au `color-mix` initial ; ce changement évite une limite de lecture du format CSS par l'oracle, sans changer les palettes ni les assertions.
- Extension bornée autorisée : libérer uniquement les promesses de stockage rejetées pour permettre « Réessayer » ; schéma, migration, identités et transactions inchangés par le worker de reprise. Le delta antérieur de migration reste préexistant, sans acceptation implicite.
- Le parent a exécuté les suites lecteur, gestes et stockage intégrées. Elles ont révélé le Retour natif déclenché par certains swipes et une mention locale des notes perdue. Correction locale des gestes, sans réinjection d'historique : horizontal réservé au lecteur quand la page tient en largeur, interception native limitée au pan agrandi débordant. Tous les contrôles affectés ont ensuite été renouvelés : G4 11/11 ; G2/G3/G5/G6 et Retour réel UX5 40/40 ; aide des notes 1/1. Le contrôle G8 de l'auteur distinct passe 4/4 après fiabilisation du nettoyage Edge, sans changement des assertions.
- Une première correction bloquante des mouvements ralentissait le geste vif simulé (précondition de vitesse non atteinte) ; l'écoute passive conservée hors pan débordant résout ce défaut. Le nettoyage temporaire avait aussi échoué plusieurs fois sur `ENOTEMPTY` ; arrêt de l'enfant vérifié et suppression bornée avec réessais corrigés par l'auteur de tests uniquement. Pas de revendication d'une nouvelle suite complète verte sur un état unique : preuves intégrées non affectées conservées et contrôles affectés renouvelés.
- TypeScript et construction finaux réussis, six variables de services distants vidées, sortie hors dépôt. Observations du parent dans Edge **graphique** : PC 1440×900, tablette 800×1280 et 1280×800, 360×800, Jour/Nuit, bibliothèque, outils/sommaire, fermeture Escape et restitution du focus, immersion sans languette, mouvement réduit. Commandes mesurées à au moins 44 px, toutes dans la zone visible ; aucun débordement horizontal relevé. Contrastes textes approuvés contrôlés par UX7 et paires boutons accent/texte ≥ 7,06:1. Pas de conformité WCAG globale annoncée.

Les journaux/captures de cette reprise sont hors dépôt dans `/tmp/luminapdf-reprise/` (temporaires). Les tests et leurs fixtures de référence restent dans `tests/`. Les contrôles navigateur utilisent des profils isolés, contournent le service worker et simulent les gestes. Restent : essai physique Xiaomi et souris/trackpad utilisateur, validation de la PWA installée/hors ligne et des services distants configurés. Aucun commit, push, déploiement ou nouvelle dépendance.

## Point de reprise historique

Racine `/home/vduch/Documents/Projets/luminapdf`, base `058d500d79670699b20717c83ed02a793f0dc654`, index vide. Changements préexistants : fins de ligne de nombreux fichiers et archives, `dev-dist/sw.js`, fichiers non suivis `.team_sync/PROTOCOL.md`, `.team_sync/orchestration/`, `.team_sync/orchestrator.py`, `tests/storage-extra.test.mjs`, `tests/fixtures/storage-damaged-page.pdf`, `thele_cyberpunk.txt`. Empreinte avant cadrage : `~/.local/state/luminapdf/lum13/snapshot-avant-cadrage.json`. Serveur de vérification isolé : `http://127.0.0.1:3016` (services distants désactivés) ; le serveur de l'utilisateur sur le port 3000 n'est pas utilisé.
