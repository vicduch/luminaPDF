# Architecture actuelle de LuminaPDF

Description issue du code local au 13 novembre 2026, base `6377389` avec la refonte locale du lecteur LUM-2 et les autres changements préexistants conservés. Les gestes physiques sur appareil restent à valider. Ce document décrit l'implémentation ; il ne certifie ni ses performances ni sa diffusion.

## Application et composants

La même application web sert la PWA sur tablette et PC. Electron ajoute une fenêtre de bureau ; il n'est pas nécessaire à l'usage PWA.

```text
src/index.tsx — montage React et enregistrement du service worker
└─ App.tsx — document, page, zoom, thèmes, annotations et progression
   ├─ Toolbar.tsx — commandes essentielles et panneau d'outils superposé
   ├─ RecentFiles.tsx — bibliothèque locale et accès aux intégrations
   ├─ PdfViewer.tsx — Document react-pdf, géométrie et navigation
   │  ├─ useReaderGestures — arbitre tactile et zoom ancré
   │  ├─ OutlinePanel — hors caméra
   │  └─ #pdf-spacing-wrapper — espacements hors transformation
   │     └─ #pdf-camera — scale(scale), origine 0 0
   │        └─ #pdf-workspace — dimensions natives du document
   │           └─ #pdf-scale-layer — colonne de pages
   │              └─ LazyPage → Page react-pdf + AnnotationLayer
   ├─ AiPanel.tsx — chat Gemini facultatif
   └─ ReadingProgressBar.tsx
```

La pile déclarée est React 19, TypeScript 5.8, Vite 6, Tailwind CSS 3.4, `react-pdf` 10 et `pdfjs-dist` 5.4.296. Les versions verrouillées sont dans `package-lock.json`, pas dans les anciens tableaux de `.team_sync/`.

## Rendu, zoom et navigation

- **Géométrie** : chaque page garde ses dimensions natives. Le zoom courant transforme toute la caméra. L'enveloppe extérieure centre les axes qui tiennent dans la zone de lecture et borne les axes débordants à une petite marge ; elle n'ajoute plus un écran de vide autour du PDF. L'ancrage du zoom est conservé sur les axes débordants où cette position reste atteignable (LUM-13, G1/G2).
- **Qualité** : `useDebounce(scale, 180)` produit `debouncedScale`. `LazyPage` capture si possible un clone du canevas avant de mettre à jour `committedScale`, qui détermine `qualityDpr`. `<Page>` garde une largeur native fixe et reçoit ce facteur dans `devicePixelRatio`. Le clone disparaît après le rendu correspondant.
- **Mode continu** : les emplacements de toutes les pages sont présents dans une colonne ; `IntersectionObserver` décide du rendu de leur contenu avec une marge de 2000 px. Un observateur distinct déclenche le suivi de la page active, réconcilié d'après la géométrie centrale du lecteur, y compris après le verrou temporaire de navigation.
- **Mode paginé** : seule la page courante est instanciée. À l'ajustement, la page suit le glissement horizontal et change au plus une page au relâchement. Agrandie, elle défile dans ses limites ; un geste commencé au bord horizontal peut résister puis tourner une page, mais un pan commencé à l'intérieur ne pagine pas. La molette défile d'abord la page agrandie, puis peut paginer depuis un bord atteint. Le changement de format conserve l'ajustement sans écraser le zoom manuel.
- **État et gestes** : `useReaderGestures.ts` arbitre un doigt/deux doigts, pan, pincement et Ctrl+molette. Le pan utilise le défilement natif ; le pincement reste ancré au milieu des doigts et Ctrl+molette au curseur. Le changement de document/mode et les interruptions annulent le geste. Aucune mesure actuelle ne prouve une fréquence de 60 ou 120 images/s.
- **Navigation** : `scrollToPage` est le passage commun pour barre, clavier, sommaire, progression et liens internes ; `fitPage` demande l'ajustement. Le centrage utilise les dimensions natives de `contentRef` et l'origine réelle de la caméra, jamais `container.scrollWidth` comme dimensions monde. Les dimensions PDF sont associées au fichier pour ignorer les callbacks périmés.
- **Commandes** : les deux modes et le sommaire sont directement accessibles dans le bandeau translucide ; la capsule inférieure réunit saisie de page et jauge navigable au clavier ou au pointeur. Un toucher central ou H masque les deux barres sans languette permanente. Les réglages secondaires sont dans un panneau non modal qui ne déplace pas le PDF ; Escape ferme et restitue le focus. Les raccourcis restent utilisables depuis les boutons, sans voler la saisie et les interactions natives des champs/listes.
- **Panneaux auxiliaires fermés** : les appelants de `AiPanel` et `OutlinePanel` appliquent un wrapper `display:none` fermé / `display:contents` ouvert. Leurs contrôles fermés ne participent plus au focus ni au défilement d'un ancêtre ; les composants restent montés pour conserver leur état. Le sommaire reste dans `Document`, hors caméra.

Il n'y a plus de tuiles, de niveaux de détail discrets, de pool de workers personnalisé ou de protocole `renderTile`.

## Thèmes

`src/utils/ThemeManager.ts` définit les palettes et variables CSS de l'interface. Les neuf thèmes Jour/Nuit reprennent les palettes approuvées de LUM-14 ; les aperçus et les palettes PDF en dérivent. Les pages PDF utilisent le filtre SVG `feColorMatrix` de `ThemeFilterDefs` dans `PdfViewer.tsx`, précédé d'une rotation de teinte la nuit ; eInk désature les images, Clair et OLED Jour gardent le PDF original. La recolorisation n'est pas effectuée dans un worker. `OutlinePanel` reste hors caméra pour que son positionnement fixe ne soit pas capturé par la transformation.

## Stockage et conservation des données

`src/services/storage.ts` ouvre IndexedDB `LuminaDB` (version 1), avec les magasins `files` et `metadata`. Les PDF sont conservés comme blobs ; les métadonnées comprennent la page, le zoom, le mode de lecture et une miniature JPEG. `App.tsx` tente de sauvegarder la progression modifiée toutes les trois secondes et de la restaurer à l'ouverture par le parcours prévu. Cela ne garantit pas le dernier geste avant une fermeture immédiate.

Les préférences de thème résident dans `localStorage`. Le stockage est propre à l'origine, au profil et à l'appareil ; Git et le cache PWA ne sauvegardent pas ces données. Aucun mécanisme indépendant de sauvegarde/restauration n'a été validé.

**Annotations** : les contrôles de création, modification et suppression existent en mémoire React. Le modèle de métadonnées comporte un champ `annotations`, mais l'ouverture enregistre une liste vide et aucun raccordement de sauvegarde/restauration des annotations actives n'a été trouvé. Leur conservation n'est donc pas une capacité acquise. Les identifiants de fichiers locaux reposent couramment sur leur nom : le cas de deux PDF homonymes doit être examiné avant toute évolution de persistance.

## Services facultatifs et exposition réseau

- `geminiService.ts` appelle Gemini depuis le navigateur avec `VITE_GEMINI_API_KEY`. `AiPanel` peut construire un contexte de page, mais `currentPageText` n'est pas alimenté dans `App.tsx` : ne pas présenter le chat comme une lecture garantie du PDF.
- `drive.ts` utilise Google Identity et le sélecteur Drive, avec une autorisation de lecture et les variables `VITE_GOOGLE_*`, pour importer un fichier.
- `supabase.ts` contient l'authentification Google et des opérations sur les fichiers récents cloud. Leur présence ne prouve pas une synchronisation des PDF, de la progression ou des annotations entre appareils ; les règles et données du service distant n'ont pas été inspectées.
- Les valeurs `VITE_*` utilisées par le client sont visibles dans la construction. Aucune correction de sécurité, rotation de clé, connexion distante ou dépense n'est autorisée par ce constat.

## PWA, worker PDF et Electron

`vite.config.ts` configure le manifeste (installation autonome, orientations libres, chemins à la racine) et Workbox pour le cache statique ; `src/index.tsx` enregistre le service worker immédiatement. `dev-dist/` contient encore des sorties générées suivies par Git ; leur retrait reste un travail séparé, sans suppression des données utilisateur.

PDF.js utilise son worker standard, mais sa provenance est incohérente : `PdfViewer.tsx` importe le worker local avec `?url`, puis `App.tsx` déclare un worker via un CDN ; `generateThumbnail` prévoit également un repli CDN. La construction produit un fichier worker local, ce qui ne prouve pas qu'il sera utilisé au lancement. L'ouverture et la réouverture de PDF hors ligne demandent une vérification réelle, y compris après redémarrage de la PWA.

`electron/main.cjs` charge le serveur en développement et `dist/index.html` en mode packagé. Les accès Node restent activés et l'isolation du contexte désactivée ; aucun preload actif ne limite ces accès. Le packaging Windows est déclaré, mais ni son fonctionnement ni sa sécurité n'ont été validés lors de la reprise.

## Références et preuves

[README.md](README.md) porte les commandes et les vérifications exécutées. [ROADMAP.md](ROADMAP.md) explique les résultats attendus ; [backlog.json](backlog.json) seul porte leur avancement. Les anciens schémas à tuiles et les promesses de performances de `.team_sync/TECH_ARCH.md` sont historiques, pas des instructions de reconstruction.
