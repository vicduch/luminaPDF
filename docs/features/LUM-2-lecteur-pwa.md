# LUM-2 — Refonte du lecteur PWA, deux modes à égalité

## Demande et décisions confirmées

L'utilisateur utilise LuminaPDF en PWA sur Xiaomi Pad 6 et sur PC. Il juge l'interface encombrée et peu soignée, et les gestes imparfaits. Il demande une interface plus simple et moderne et une navigation fluide. Il utilise **aussi souvent le défilement continu que la lecture page par page** (réponse C du 13 novembre 2026). Aucun des deux modes n'est secondaire.

Parcours protégé : la barre, la géométrie et les gestes partagent plusieurs états et peuvent régresser ensemble. Un seul writer à la fois dans ce checkout ; examen des garanties par un auteur de tests indépendant avant production, worker UX fresh, observation Edge et revue indépendante avant acceptation. Il s'agit d'une première tranche locale du lecteur réel, pas d'une refonte de tous les services.

## Contrat utilisateur

- Lire le document sans une rangée d'outils secondaires concurrente du contenu.
- Accéder directement aux deux modes, nommés « Continu » et « Page par page », sur tablette et PC ; conserver la page active en changeant de mode.
- Conserver ouvrir un PDF, revenir à la bibliothèque, le sommaire, l'ajustement et la navigation vers une page. Les thèmes, notes, IA et plein écran restent accessibles à la demande, sans nouvelle fonction de stockage.
- Défilement continu : glissement vertical et molette ordinaires font défiler ; le déplacement d'une page zoomée ne change pas de mode.
- Mode paginé : un glissement horizontal délibéré sur une page ajustée tourne au plus une page au relâchement ; maintenir le doigt ne lance plus de défilement accéléré. Première et dernière pages bornées.
- Si la page est agrandie au-delà de son ajustement au viewport, un doigt déplace la page : il ne tourne pas une page, même au bord. Deux doigts zooment dans les deux modes, autour de leur milieu ; Ctrl+molette/trackpad zoome autour du curseur. Une molette ordinaire ne zoome pas.
- Un pincement, une interruption système, le passage de deux doigts à un, un changement de document ou de mode ne doivent pas laisser un geste ni une animation de changement de page actifs.
- Une seule application du déplacement à chaque étape, pas deux corrections géométriques concurrentes ; conserver le rendu PDF différé et les pages hors écran virtualisées.
- Le compteur suit la page réellement visible, y compris après un défilement immédiat suivant un changement de mode ou une navigation programmée.
- En paginé, conserver l'ajustement lors d'un changement de format portrait/paysage, sans écraser un zoom manuel. Un swipe doit rester possible sur la nouvelle page ajustée.
- Après utilisation d'une commande ou fermeture des outils par Escape, les raccourcis de lecture restent disponibles. Préserver les interactions natives des champs et listes, ainsi que Enter/Espace sur les boutons.
- Ne pas déplacer le document ni décaler le point visé en ouvrant un menu. L'ajustement et la rotation restent à vérifier avec les dimensions réelles du viewport.

## Interfaces accessibles convenues pour les preuves

Les boutons de modes ont pour noms accessibles exacts « Lecture continue » et « Lecture page par page », avec `aria-pressed` reflétant le mode actif ; leurs libellés visibles sont « Continu » et « Page par page ». La saisie de page est un champ numérique natif nommé « Aller à la page » : Enter valide, un nombre est borné entre 1 et le total, une saisie invalide ne navigue pas. L'ajustement est un bouton nommé « Ajuster la page ». Le bouton « Outils de lecture » expose `aria-expanded` et `aria-controls="reader-tools"` ; il ouvre un panneau non modal `id="reader-tools"`, `role="region"`, `aria-label="Outils de lecture"`, réellement caché ou démonté une fois fermé. Escape ferme ce panneau et rend le focus au bouton. La barre expose `id="reader-toolbar"`, `role="toolbar"`, `aria-label="Commandes de lecture"` ; à 360 px, elle peut se répartir sur plusieurs rangées mais ne déborde pas horizontalement et ses commandes visibles gardent des cibles de 44 px. Un doigt vers la gauche demande la page suivante, vers la droite la précédente. Les tests vérifient aussi les effets réels des modes, pas seulement leurs attributs.

## Direction UX — six champs

1. **Intention :** un espace de lecture calme, où le document domine et où chaque geste a un seul sens.
2. **Tâche prioritaire :** lire et naviguer dans un PDF ouvert, dans chacun des deux modes et en passant de l'un à l'autre.
3. **Direction visuelle :** barre structurée et sobre, titre lisible tronqué proprement, contrôles de modes explicitement libellés, surfaces opaques et séparateurs légers plutôt que halos et groupes de boutons imbriqués. Aspect d'outil de lecture, pas de tableau de bord.
4. **Système réutilisé :** palettes sémantiques `--lumina-*`, thèmes existants et icônes locales ; police système sans téléchargement ; espacements courts cohérents, cibles tactiles d'au moins 44 px dans le périmètre modifié, focus visible, mouvements brefs et désactivables.
5. **À éviter :** nouveaux effets de verre ou animations décoratives, outils dupliqués selon le breakpoint, options essentielles disponibles uniquement au survol, changement accéléré implicite des pages, refonte du moteur PDF ou nouvelle bibliothèque pour l'esthétique.
6. **Preuves :** Edge réel sur PC et formats tablette portrait/paysage émulés ; clair/sombre, menus fermés/ouverts, clavier/Escape/restitution du focus, largeur 360 px et zoom d'interface, PDF chargé et erreur de chargement. Les gestes automatisés sont une simulation, pas une mesure physique sur Xiaomi.

## Périmètre de la tranche

Production autorisée : `src/components/Toolbar.tsx`, `src/components/PdfViewer.tsx`, `src/index.css`, et ajustements strictement nécessaires de liaison dans `src/App.tsx` / `src/types.ts`. Un hook ou utilitaire local de gestes est permis si cela remplace réellement des handlers concurrents, sans réorganisation générale. Les nouveaux noms suivent l'anglais du projet ; commentaires en français.

Exclus : stockage, identifiants de documents, annotations persistantes, authentification, clés/env, services IA/cloud/Drive, Electron, dépendances, déploiement, refonte de la bibliothèque et synchronisation des appareils. Ne pas présenter les notes comme sauvegardées ou le chat comme une lecture du document. Pas de suppression d'une option existante sans signalement ; ne pas créer de nouveau contrôle sans effet.

Les changements locaux préexistants de centrage sont une entrée à examiner, pas une base à écraser ou à restaurer depuis HEAD. Ne pas normaliser les fins de ligne des fichiers existants. La provenance CDN du worker PDF reste une limite préexistante ; aucune promesse de fonctionnement hors ligne complet dans ce lot.

## Validation attendue et limites

L'auteur tests reçoit le contrat public, pas une proposition d'implémentation. Choisir des cas discriminants en boîte noire : modes accessibles et page conservée, limites de pagination, maintien sans répétition, pan zoomé sans changement de page, annulation et fin de pincement, point d'ancrage du zoom, absence de débordement de barre et commandes clavier. Node et le protocole de débogage d'Edge sont disponibles, sans dépendance de navigateur installée dans ce dépôt. Les tests peuvent employer un PDF de fixture propre et un profil de navigateur temporaire ; aucune donnée utilisateur réelle ni effacement du profil de la PWA utilisée.

Le parent exécute les preuves navigateur et les nouveaux tests ; le worker exécute le contrôle TypeScript et la construction. Les services distants sont désactivés dans le serveur de vérification par variables d'environnement vides. L'origine locale de vérification est distincte de celle de l'utilisateur.

L'état initial observé dans Edge : la barre présente beaucoup de commandes et les modes sont cachés dans un menu aux tailles tablette. Aucune cause des saccades physiques n'est encore démontrée. Un essai discriminant doit constater les conflits de gestes avant/après si reproductibles ; à défaut, annoncer la limite, ne pas promettre une fréquence d'images ou un gain mesuré. Après la tranche, essai réel sur Xiaomi nécessaire avant de qualifier la fluidité.

## Baseline de vérification et propriétaire de production

Les tests indépendants `tests/reader.test.mjs` ont été exécutés par le parent sur l'implémentation initiale. Le premier scénario échoue sur l'absence attendue des commandes accessibles des deux modes. Les cinq suivants s'arrêtent avant le parcours, sur l'entrée de téléversement indisponible dans la simulation : à classer comme problème de mise en place navigateur, pas comme cinq défauts fonctionnels. Ces garanties n'ont donc pas encore de signal rouge exploitable ; aucune assertion n'est retirée pour masquer ce manque. Le contrôle du service worker et la réouverture PWA restent distincts de la tranche de gestes.

Un worker de production possède la tranche complète, car la barre, le passage de mode, le zoom et les gestes partagent les états de page et d'échelle dans `App`/`PdfViewer`. Des writers séparés auraient des frontières d'intégration qui se recouvrent sur ces mêmes fichiers. Le parent garde les tests et les observations navigateur, et ne modifie pas le checkout pendant ce writer.

## Vérification locale de la tranche intégrée

La première suite passe après isolation des contextes navigateur par l'auteur tests. La revue indépendante a ensuite relevé trois régressions atteignables : compteur périmé après défilement immédiat, ajustement perdu sur formats paginés différents, et raccourcis bloqués depuis les boutons. Cinq scénarios complémentaires ont été écrits par le même auteur indépendant ; le parent a constaté les échecs discriminants avant correction. Un worker fresh a corrigé seulement `App.tsx`/`PdfViewer.tsx`, avec TypeScript vert et aucun delta tests.

Le dernier échec d'activation native Enter a été reproduit par l'auteur tests sur un bouton HTML neutre : le conducteur CDP n'envoyait pas le caractère requis. Il a corrigé uniquement l'émission Enter/Espace du helper, sans retirer ni assouplir les assertions. Le parent a réexécuté les deux suites : **11 scénarios, 13 entrées TAP vertes, zéro skip**.

Edge graphique a été observé aux tailles 1440×1000, 900×1280, 1280×900 et 360×800, ainsi que les outils en clair/sombre. Les textes principaux et d'aide contrôlés dépassent 4,5:1 sur ces deux surfaces. Cela ne qualifie pas toutes les palettes, le clavier complet, le zoom navigateur réel à 200 %, les erreurs PDF ni l'accessibilité globale. Les simulations excluent le service worker ; aucun essai physique Xiaomi ou PWA installée/hors ligne n'est acquis. L'acceptation de l'interface par l'utilisateur reste attendue.

Le contrôle final en Edge graphique frais confirme un décalage horizontal de 39,75 px d'un ancêtre du lecteur : le bord gauche d'une page ajustée peut être coupé. Ce n'est donc pas seulement une observation d'ancien profil/HMR. Le panneau IA fermé conserve des éléments de mise en page et un défilement de montage ; correction bornée à sa visibilité côté lecteur, sans changer le service ni perdre son état lors de la fermeture/réouverture. Garantie : un panneau fermé ne déplace pas le lecteur et ne reçoit pas la navigation Tab. Deux scénarios indépendants ajoutés : le premier échoue avant correction sur un bouton de sommaire fermé hors écran ; le contrôle du brouillon est déjà vert. Un worker fresh ajoute seulement deux wrappers de visibilité, sans démonter l'état. Après correction, **13 scénarios / 16 entrées TAP passent sans skip**, TypeScript et construction finale passent. Le parent recontrôle dans Edge graphique frais : ancêtre sans décalage, pages portrait/paysage et largeur 360 px entièrement visibles, raccourcis et ouverture du sommaire fonctionnels. La correction locale est inspectée et acceptée techniquement par le parent, sans revue complète supplémentaire : elle ne change que ces deux frontières de visibilité et les preuves discriminantes passent. La revue principale et sa relecture ciblée restent acquises. Tranche prête localement ; acceptation utilisateur et essai physique Xiaomi restent attendus.

## Point de reprise

Racine : `/home/vduch/Documents/Projets/luminapdf`. Base : `6377389c83ad740e9a2f1dc96f6a0b011e8bb60f`. Index vide lors du cadrage ; nombreuses modifications et archives préexistantes, dont fins de ligne et centrage. Documentation LUM-1 et lecteur prêts localement ; GO utilisateur reçu pour leurs deux commits et leur envoi vers le dépôt existant public `vicduch/luminaPDF`, branche `master`, sans autorisation de déploiement. Essai physique Xiaomi et acceptation du rendu restent attendus. Un serveur local isolé des services distants et une fenêtre Edge de vérification ont été ouverts ; leurs sorties générées ne constituent pas des changements applicatifs à inclure.
