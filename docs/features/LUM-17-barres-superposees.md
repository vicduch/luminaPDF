# LUM-17 — Barres superposées : le PDF ne bouge plus au toucher central

Parcours assisté avec UX (retouche de disposition), tests d'abord par auteur indépendant, revue indépendante (contrat de géométrie partagé par les gestes, l'ajustement et plusieurs suites).

## Constat (avant, mesuré dans Edge sur la base 2dafa3d)

Masquer/afficher les barres (toucher central, `H`, bouton « Afficher la barre de lecture », action « Masquer la barre (H) ») retire du flux l'en-tête (~52 px), le pied (~48 px) et les gouttières latérales des onglets (56 px chacune, 44 px sous 760 px). La zone de lecture `.pdf-viewer-container` change donc de taille et d'origine :

- page ajustée : réajustée à l'espace libéré (tablette portrait 800×1280, Page par page : largeur 672 → 784 px, déplacement ≈ 56 px horizontal et 80 px vertical) ;
- page zoomée : zoom inchangé, mais le contenu saute de la taille des barres (≈ −56 px en x, −52 px en y), puis revient.

## Décision utilisateur (17/11/2026, option A)

Les barres passent **par-dessus** le PDF. La zone de lecture occupe en permanence tout l'espace de lecture, barres visibles ou non. La page ajustée garde la taille qu'elle a aujourd'hui barres visibles : l'ajustement réserve en permanence l'emplacement des barres (en-tête, pied, onglets) et ne grandit plus en immersion. Une page zoomée peut passer sous les barres tant qu'elles sont affichées.

Cette décision remplace :
- LUM-13 G6, phrase « une page ajustée peut se réajuster à l'espace libéré » → la page ne bouge pas (B1) ;
- LUM-16 « onglets dans deux gouttières hors du conteneur de lecture » et « Aller à la page au-dessus de la zone de lecture » → les onglets et l'en-tête sont au-dessus (z-index) de la zone de lecture et ne chevauchent jamais la page **ajustée** (B3).

## Garanties

Vocabulaire de LUM-13 : *zone* = `.pdf-viewer-container` (boîte client) ; *ajustée* = échelle ≤ ajustement × 1,02 ; *page* = boîte écran de `[data-page-number="n"]`.

- **B1 — Stabilité.** Masquer puis réafficher les barres, par chacun des quatre moyens, ne change ni la boîte écran de la page courante (left/top/width/height à 1 px près), ni la zone, ni le défilement, ni la page courante. Page ajustée et page zoomée ; Page par page et Continu ; 800×1280, 1280×800, 1440×900 et 360×800.
- **B2 — Taille ajustée conservée.** Barres visibles, la page ajustée a la même taille et la même place qu'avant ce changement (à 1 px près pour la taille, 3 px pour la position ; référence mesurée en boîte noire sur la base avant production).
- **B3 — Barres sans chevauchement à l'ajustement.** Barres visibles et page ajustée : le bas de `#reader-toolbar` ≤ haut de la page, le haut de la navigation « Navigation dans le document » ≥ bas de la page, et les onglets « Sommaire » / « Outils de lecture » ne recouvrent pas la page. Les commandes gardent ≥ 44×44 px et restent dans la fenêtre.
- **B4 — Lisibilité par-dessus le PDF.** En-tête, pied et onglets ont un fond opaque du système existant (grain + fond de barre), sans ombre ni flou ajoutés ; contrastes texte inchangés quelle que soit la page dessous.
- **B5 — Gestes et contrats inchangés.** LUM-13 G1–G9 restent vrais avec la zone ci-dessus (elle n'est plus réduite par les barres). Un toucher sur l'en-tête, le pied ou un onglet reste une action de commande, jamais un geste de page. Un toucher hors commande sur l'ancien emplacement des gouttières est un toucher de quart (page voisine).
- **B6 — Accessibilité et immersion inchangées.** Noms accessibles, `aria-expanded`/`aria-controls`, Escape et retour du focus, panneaux fermés hors focus, bouton « Afficher la barre de lecture » (invisible au repos, révélé au focus/survol), immersion sans languette visible ; barres masquées hors focus et hors arbre d'accessibilité.
- **B7 — Ajustement conservé au changement de format.** Rotation portrait/paysage et redimensionnement gardent l'ajustement sans écraser un zoom manuel (G9) ; l'emplacement réservé suit la largeur (44 px sous 760 px).

## Après revue 1 (17/11/2026)

Décision utilisateur (option A) : réserver une marge en haut et en bas du document. Garanties ajoutées ou précisées :

- **B8 — Haut et bas dégageables.** Sur l'axe vertical, quand le document dépasse la zone (colonne Continu, page zoomée), le défilement s'arrête au plus haut avec le haut du document sous l'en-tête (réserve haute + 8 px) et au plus bas avec le bas du document au-dessus du pied (réserve basse + 8 px), barres visibles ou masquées (constante, B1 inchangée). Conséquence acceptée : barres masquées, la marge extérieure verticale aux extrémités vaut ≈ 60 px ; la borne G1 « 24 px au plus » devient, sur l'axe vertical seulement, « réserve + 24 px au plus ». Horizontal inchangé (onglets étroits). En particulier : Continu, première page puis Ajuster → haut de la page 1 sous l'en-tête ; dernière page → bas au-dessus du pied.
- **B9 — Barres limitées à l'espace de lecture.** En-tête et pied ne recouvrent que l'espace du PDF : le panneau IA ouvert (≥ 768 px) garde sa fermeture, sa saisie et son envoi visibles et cliquables ; le bandeau d'alerte d'enregistrement (`role=alert`) reste entièrement visible avec un document ouvert et les barres affichées.
- **B4 précisé** : le fond des onglets reste opaque au survol de la souris (Jour/Nuit).
- **B7 précisé** : un passage du seuil 760 px sans changement de taille de la zone (p. ex. IA ouverte puis fenêtre réduite) renouvelle la réserve et conserve l'ajustement sans écraser un zoom manuel.

## Hors périmètre

Animation de fondu des barres ; bandeau d'erreur de stockage ; panneau IA ; moteur PDF, rendu, virtualisation ; palettes et typographie ; Electron.

## UX (delta, brief LUM-16 hérité)

Intention et direction inchangées (liseuse calme, immersion). Tâche : lire sans que la page bouge quand on fait apparaître les commandes. Système réutilisé : fonds `--lumina-grain` + fond de barre, onglets verticaux existants, cibles 44 px. À éviter : pastilles, ombres ou flous pour détacher les barres ; languette visible en immersion. Preuves : Edge PC, tablette portrait/paysage, 360 px, Jour/Nuit, page ajustée et zoomée sous les barres.

## Validation attendue

- Tests navigateur indépendants (auteur distinct) : B1 (rouge attendu avant), B2/B3 (référence verte avant pour B2), adaptation des garanties LISEUSE-B et LISEUSE-G1 remplacées par B3.
- Suites existantes touchées par la géométrie : gestures, liseuse, pinch-anchor, reader, reader-regressions, ux-recovery.
- `npx tsc --noEmit`, `npm run build`.
- Observation parent dans Edge graphique (B4, B6). Pas d'essai Xiaomi ni PWA hors ligne par ce changement.

## Bilan (17/11/2026)

- Production : en-tête, pied et onglets superposés dans l'espace de lecture ; réserves constantes (52/48 px en hauteur, 56/44 px en largeur) dans l'ajustement et les bornes verticales, relues au seuil 760 px ; fonds opaques, survol compris.
- Tests d'abord par un auteur indépendant : `tests/barres.test.mjs` (40 cas B1–B9, rouges attendus avant production). Adaptations motivées : LISEUSE-B/G1 (B3), G2 Ctrl+molette (premier cran centré), bornes verticales `RESERVE` de `assertEdge`/`edgeOk`/`place` (B8).
- Résultats sur l'état final : barres 40/40, gestures 75/75, liseuse, pinch-anchor, reader, reader-regressions, ux-recovery et storage verts ; `tsc` et construction réussis. Captures Edge (headless) à 800×1280, 1280×800, 360×800, Jour/Nuit, IA ouverte.
- Revue 1 : 3 majeurs et 2 mineurs, tous corrigés ; revue 2 ciblée : acceptée sans finding.
- Limites : pas d'essai Xiaomi, ni de PWA installée ou hors ligne. L'onglet Outils, fixé au bord droit, recouvre le panneau IA ouvert comme avant LUM-17.
