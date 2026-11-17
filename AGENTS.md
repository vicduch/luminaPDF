# Consignes du projet LuminaPDF

## But et sources de référence

LuminaPDF est un lecteur PDF personnel. Les usages principaux sont la **PWA sur Xiaomi Pad 6 et sur PC** ; Electron est une variante secondaire. Ne pas supposer que ces deux appareils partagent leurs documents ou leur progression.

- Démarrage et configuration : [README.md](README.md).
- Architecture observée : [ARCHITECTURE.md](ARCHITECTURE.md).
- Cap et critères de réussite : [ROADMAP.md](ROADMAP.md).
- File active et états des travaux : [backlog.json](backlog.json), tenu selon le workflow vd-pi.

Les anciens documents de `.team_sync/` et les anciens audits à la racine sont historiques, pas des descriptions garanties du code actuel. Ne pas reprendre leurs phases, statuts « stable/déployé » ou promesses de fréquence d'affichage comme preuves. Conserver leurs décisions de sécurité applicables ; une archive ne vaut jamais levée d'un garde-fou.

## Périmètre et méthode

Passer par `vd-pi-x-orchestrate-feature` pour les évolutions. Inspecter l'état Git et les usages avant d'écrire. Préserver les changements suivis et non suivis : la reprise documentaire n'autorise ni normalisation des fins de ligne, ni nettoyage des fichiers générés, ni validation implicite du zoom local en attente d'essais. Ne pas lancer l'ancien orchestrateur de `.team_sync/` pour appliquer ce workflow.

Un travail est prêt localement lorsque son résultat est vérifié en proportion du risque, ses limites sont explicites et son diff ne contient que le périmètre prévu. Distinguer présence dans le code, essai réel, acceptation et diffusion. Ne pas annoncer une validation sur appareil ou hors ligne à partir d'une construction réussie.

## Commandes

```bash
npm ci
npm run dev
npx tsc --noEmit
npm run build
npm run preview
npm run electron:dev
npm run electron:build
```

Les commandes npm viennent de `package.json` ; il n'existe pas encore de scripts `typecheck`, `test`, `lint` ou `ci`. Les suites navigateur indépendantes `tests/reader.test.mjs` et `tests/reader-regressions.test.mjs` s'exécutent avec Node et Microsoft Edge ; voir le README. Elles isolent les profils et contournent le service worker : elles ne qualifient pas la PWA installée ou hors ligne. Le serveur de développement écoute par défaut sur toutes les interfaces au port 3000 ; `npm run dev -- --host 127.0.0.1` le limite au PC. Les fonctions distantes sont facultatives ; noms exacts des variables dans le README, jamais leurs valeurs.

## Architecture et invariants à préserver

- React 19, TypeScript 5.8, Vite 6, Tailwind CSS 3.4 ; rendu via `react-pdf` et PDF.js standard.
- `App.tsx` porte le document, la page, le zoom, les thèmes et la progression ; `PdfViewer.tsx` porte la géométrie/navigation, et `useReaderGestures.ts` arbitre les gestes concurrents.
- Le zoom visuel est appliqué à `#pdf-camera` par `transform: scale(scale)`, avec origine `0 0`. Les espacements de déplacement sont dans `#pdf-spacing-wrapper`, hors caméra ; `#pdf-workspace` contient le document à dimensions natives.
- La géométrie réagit au zoom courant. Seule la qualité attend `debouncedScale` (180 ms), puis `committedScale` ; la largeur de `<Page>` reste native et la netteté varie via `devicePixelRatio={qualityDpr}`. Un clone du canevas couvre le rendu en cours.
- La virtualisation de `LazyPage` repose sur `IntersectionObserver` avec marge de 2000 px. Ne pas réintroduire un démontage fondé sur la distance à la page courante ; l'indication de priorité de chargement ne commande pas ce cycle de vie.
- `OutlinePanel` reste hors du conteneur transformé et dans `Document` pour préserver positionnement fixe et contexte PDF. Les wrappers d'Outline/IA masquent réellement les panneaux fermés sans démonter leur état : ne pas remplacer cela par une simple translation qui laisse le focus et le défilement actifs.
- En lecture, l'en-tête, le pied et les onglets sont superposés à la zone de lecture, dans `.reader-workspace` (jamais par-dessus l'IA ni l'alerte d'enregistrement) ; `.pdf-viewer-container` garde toute la place. L'ajustement et les bornes verticales réservent en permanence leur emplacement (`--reader-fit-inline`, `--reader-topbar-height`, `--reader-dock-height`, relus au changement de seuil 760 px) : masquer ou afficher les barres ne déplace jamais le PDF (LUM-17). Ne pas faire dépendre la géométrie de la visibilité des barres.
- Les couleurs PDF utilisent `ThemeFilterDefs` et `feColorMatrix` ; l'interface utilise les variables CSS de `ThemeManager.ts`. Pas de `filter: invert()` ni de recolorisation par worker.
- Il n'y a ni moteur de tuiles, ni `TileManager`, `RenderPool`, `CoordinateSystem`, `useZoom` ou worker PDF personnalisé. Ne pas les réintroduire depuis une archive.
- Garder des dépendances primitives (`scale`, coordonnées, etc.) dans les effets et mémorisations ; ne pas introduire d'objets recréés à chaque rendu qui relancent ces effets.
- Pour le zoom et la navigation, les dimensions monde viennent de `contentRef` (`#pdf-workspace`) et les décalages écran de l'origine réelle de la caméra. Ne pas utiliser `container.scrollWidth` comme dimensions monde ou référence de centrage.
- Les modes Continu et Page par page sont également accessibles. Un swipe ajusté tourne au plus une page au relâchement. Un pan agrandi commencé à l'intérieur ne pagine pas ; tirer horizontalement depuis un bord déjà atteint peut tourner une page au relâchement (contrat LUM-13, G5). Le geste reste local au PDF, sans piéger le Retour du navigateur. Garder l'ajustement entre formats paginés, sans écraser le zoom manuel ; réconcilier la page visible après navigation rapide.
- Barre, clavier, sommaire, progression et liens PDF passent par `scrollToPage` ; le bouton Ajuster par `fitPage`. Préserver les noms accessibles et le focus après fermeture des outils. Les raccourcis doivent fonctionner depuis les boutons, sans voler les interactions natives des champs/listes.

## Données, services et risques existants

IndexedDB conserve fichiers et métadonnées ; `localStorage` conserve les préférences. Ce n'est ni une sauvegarde indépendante, ni une synchronisation entre appareils. La création/modification d'annotations est en mémoire ; leur sauvegarde/restauration n'est pas raccordée au parcours actuel. Ne pas promettre leur conservation.

Les intégrations Gemini, Google Drive et Supabase sont présentes, mais leur configuration et leur fonctionnement distants ne sont pas validés. Le texte de page destiné à l'IA n'est pas alimenté dans `App.tsx`. Toute donnée `VITE_*` utilisée côté client est publique dans la construction : ne jamais recopier de secrets dans les docs ou les journaux.

Le worker standard est déclaré localement dans `PdfViewer.tsx`, mais `App.tsx` le redéfinit vers un CDN et le générateur de miniatures a un repli CDN. Ne pas affirmer que le parcours PDF est entièrement autonome hors ligne avant preuve.

Electron conserve `nodeIntegration: true` et `contextIsolation: false` : ne pas diffuser cette variante sans traitement. Les changements sensibles Electron restent soumis à la règle historique de deux reviewers (`.team_sync/phases/phase0/PHASE0_DECISIONS.md`, DEC-03) ; aucune dérogation n'est donnée ici.
