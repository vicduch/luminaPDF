# LuminaPDF

Lecteur PDF personnel en React et TypeScript, utilisable dans le navigateur et installable en PWA. Les cibles principales sont la **Xiaomi Pad 6** et le **PC**, toutes deux en PWA (usage confirmé le 13 novembre 2026). La variante Electron est secondaire et n'est pas prête à être diffusée en l'état.

## Démarrer en local

Prérequis : Node.js et npm. Le contrôle de reprise a été réalisé avec Node.js **22.23.1** et npm **10.9.8** ; aucune installation sur machine vierge n'a été vérifiée. Utiliser le verrouillage `package-lock.json` :

```bash
npm ci
npm run dev
```

Ouvrir `http://localhost:3000`. Le serveur est configuré pour écouter sur toutes les interfaces réseau ; pour le limiter à ce PC :

```bash
npm run dev -- --host 127.0.0.1
```

La lecture de PDF locaux ne nécessite pas de compte ni de clé d'IA. Conserver les documents originaux : le stockage du navigateur n'est pas une sauvegarde.

## Configuration facultative

Les valeurs se placent dans `.env.local`, ignoré par Git, puis nécessitent un redémarrage du serveur ou une nouvelle construction.

| Fonction | Variables lues par le code |
|---|---|
| Chat Gemini | `VITE_GEMINI_API_KEY` |
| Compte et fichiers récents cloud Supabase | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Import Google Drive | `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_APP_ID` |

`GEMINI_API_KEY` sans préfixe n'est pas la variable lue par l'application actuelle. Les services distants et leurs autorisations n'ont pas été vérifiés lors de cette reprise.

**Attention : les variables `VITE_*` utilisées côté navigateur sont intégrées au code livré et ne sont pas secrètes**, même si `.env.local` est ignoré par Git. Ne jamais y placer une clé Supabase privilégiée (`service_role`). La clé Gemini côté client nécessite un examen avant toute diffusion ; ne pas publier une construction contenant une clé privée. Les requêtes IA peuvent transmettre des données au fournisseur et consommer son quota. Aucun appel distant n'est nécessaire pour les contrôles locaux ci-dessous.

## Commandes existantes

```bash
npm run dev             # Développement web, port 3000
npx tsc --noEmit         # Contrôle TypeScript, distinct de la construction
npm run build           # Construction web et PWA dans dist/
npm run preview         # Prévisualisation locale de dist/
npm run electron:dev    # Variante Electron en développement
npm run electron:build  # Construction Electron ; cible Windows NSIS déclarée
```

Il n'existe pas encore de scripts npm `typecheck`, `lint`, `test` ou `ci`. `npm run build` seul ne remplace pas le contrôle TypeScript. La configuration de packaging ne constitue pas une preuve qu'un installateur fonctionne.

Les tests du lecteur utilisent Node.js et Microsoft Edge installé à `/usr/bin/microsoft-edge`, sans dépendance de navigateur ajoutée. Démarrer le serveur local séparément, avec les services distants désactivés pour les vérifications, puis adapter le port :

```bash
READER_TEST_URL=http://127.0.0.1:3000 node --test --test-concurrency=1 tests/reader.test.mjs tests/reader-regressions.test.mjs
```

Ils ouvrent des profils/contextes isolés avec des PDF de démonstration. Le service worker est volontairement contourné : ces tests ne prouvent ni l'installation PWA, ni le hors-ligne, ni la fluidité physique sur Xiaomi.

## Installer et utiliser la PWA

Servir la construction web depuis une origine sécurisée (HTTPS ; `localhost` convient sur le même appareil pour le développement), puis utiliser l'action d'installation du navigateur. Une adresse HTTP du PC sur le réseau local n'est pas l'équivalent de `localhost` pour la tablette. L'hébergement actuellement utilisé et sa version restent à identifier ; cette documentation ne déploie rien.

Le manifeste prévoit les deux orientations et le service worker un cache des ressources statiques. **Le fonctionnement hors ligne complet n'est pas encore validé** : le chargement du moteur PDF comporte des déclarations concurrentes, dont une vers un CDN. Voir [l'architecture](ARCHITECTURE.md).

Les PDF récents et la position de lecture sont stockés localement dans le navigateur. Ils ne sont pas automatiquement partagés entre PC et tablette. Effacer les données du site, changer d'origine ou de profil peut rendre ces données indisponibles. La sauvegarde durable des annotations n'est pas reliée dans le parcours actuel : ne pas compter dessus pour conserver des notes importantes.

## Documentation de référence

- [AGENTS.md](AGENTS.md) : consignes pour intervenir sur ce dépôt (lues par Pi quel que soit le modèle).
- [ARCHITECTURE.md](ARCHITECTURE.md) : fonctionnement observé et limites.
- [ROADMAP.md](ROADMAP.md) : cap, critères de réussite et décisions.
- [backlog.json](backlog.json) : seule file active des travaux et de leur avancement.

Les anciens rapports à la racine et dans `.team_sync/` sont conservés comme archives. Ils mélangent plusieurs générations du moteur et deux numérotations de phases ; leurs listes de travaux ne sont plus la file active. Les contraintes de sécurité historiques ne sont pas levées par cet archivage.

## Vérifications de reprise — 13 novembre 2026

Sur la base locale `6377389` avec les changements de zoom/centrage préexistants : contrôle TypeScript (`./node_modules/.bin/tsc --noEmit`) et construction (`npm run build -- --outDir /tmp/luminapdf-bilan.BMk10w`) réussis, sans appels aux services IA/cloud. La construction a utilisé un dossier temporaire pour préserver les sorties existantes.

Avertissements non bloquants observés : données de compatibilité navigateur vieillissantes et double import statique/dynamique de Supabase. Aucun essai réel en PWA sur tablette ou PC, aucun lancement Electron, aucun essai de restauration des données ni contrôle distant n'a été réalisé. Les commandes réussies ne prouvent ni la fluidité des gestes ni la persistance des annotations.

La refonte locale LUM-2 ajoute les deux modes visibles, un panneau d'outils et un arbitre de gestes. Les 13 scénarios navigateur indépendants passent (16 entrées TAP, aucun skip), dont le défilement immédiat après changement de mode, les formats de pages mélangés, le maintien du zoom volontaire, les raccourcis, les panneaux fermés sans focus invisible ni décalage et le brouillon de l'assistant conservé. TypeScript et la construction finale passent sur les corrections intégrées (sortie temporaire, services distants désactivés). Le rendu a été observé dans Edge graphique aux tailles PC/tablette et 360 px, avec textes principaux contrôlés en clair/sombre. Essai physique Xiaomi, zoom navigateur réel à 200 %, PWA installée et acceptation de l'interface restent distincts et non acquis.
