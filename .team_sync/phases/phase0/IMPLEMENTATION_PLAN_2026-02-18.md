# Plan D'Implementation Long - Assainissement LuminaPDF (2026-02-18)

Ce document decrit un plan multi-phases, ordonne, pour corriger les defauts identifies dans l'audit workspace.

Reference audit: `.team_sync/phases/phase0/WORKSPACE_AUDIT_2026-02-18.md`.

## Principes
- Prioriser la reduction de risque (securite Electron) avant le refactoring.
- Industrialiser la qualite avant d'accelerer (quality gates + CI).
- Decouper en petits changements mergables (PRs petites, reversibles).
- Documenter chaque choix structurant (ADR leger) pour limiter le drift.

## Definition Of Done (DoD) globale
- `npm run typecheck` passe.
- `npm run build` passe.
- CI verte sur PR.
- Aucun artefact genere (build/pwa) versionne par erreur.
- Electron packagé ne tourne pas avec `nodeIntegration: true` ni `contextIsolation: false`.

## Ordre recommande
1. Phase 0 (cadrage)
2. Phase 4B (optimisation Xiaomi Pad 6 PWA) [PRIORITE]
3. Phase 1 (securite Electron)
4. Phase 2 (hygiene Git/workspace)
5. Phase 3 (quality gates + CI)
6. Phase 4 (doc)
7. Phase 5 (refactor)
8. Phase 6 (tests)
9. Phase 7 (release hardening)
10. Phase 8 (amelioration continue)

## Phase 0 - Cadrage et gel technique (2-3 jours)
Objectif: clarifier perimetre, priorites, et criteres de succes avant de modifier la base.

Travaux:
- Lister les parcours critiques a proteger (ouverture PDF, navigation, zoom/scroll, recent files, mode electron).
- Definir les quality gates obligatoires (typecheck, lint, tests, build).
- Fixer une convention branche/PR et une definition de Done par PR.
- Creer un runbook local minimal (install, env vars, dev, build, electron dev/build).

Livrables:
- Backlog priorise et ordonne (tickets par phase, dependances).
- Checklist de validation pre-merge (local + CI).

Criteres de sortie:
- Tous les objectifs / non-objectifs sont ecrits.
- Les quality gates sont decides (meme si pas encore implementes).

Risques:
- Si le perimetre n'est pas fige, les phases suivantes se melangent (refactor trop tot).

## Phase 1 - Securisation Electron (1-2 semaines)
Objectif: supprimer le risque critique (renderer avec acces Node implicite).

Travaux techniques:
- Passer a une configuration securisee:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true` si compatible
- Ajouter un `preload` et exposer un bridge minimal via `contextBridge`.
- Remplacer les acces Node depuis le renderer par des appels a l'API preload (whitelist).
- Revoir les surfaces d'attaque:
  - `window.open`, `shell.openExternal`, navigation vers URL non attendues
  - permissions inutiles
- Ajouter une Content Security Policy (CSP) stricte si applicable.
- Deplacer la logique "filesystem / OS" (si necessaire) vers le main process.

Livrables:
- Architecture Electron "main / preload / renderer" propre.
- Guide "API exposees au renderer" (liste courte + justification).

Criteres de sortie:
- L'app Electron fonctionne en dev et en build avec les flags securises.
- Aucun code renderer n'a besoin de `require`, `fs`, `child_process`, etc.

Notes:
- Cette phase peut demander des changements de code si la UI depend de Node (a verifier).

## Phase 2 - Hygiene Git et workspace (3-4 jours)
Objectif: eliminer le bruit et les regressions liees aux artefacts versionnes.

Travaux:
- Ignorer `dev-dist/` et autres sorties generees (PWA, bundling) via `.gitignore`.
- Decider du statut des assets debug:
  - Option A: de-tracker et deplacer hors `src/` (ex: `docs/debug_assets/`)
  - Option B: garder mais documenter (rarement recommande)
- Nettoyer le tracking Git:
  - supprimer du tracking les fichiers generes deja suivis (sans les supprimer localement si utiles)
- Formaliser une politique "sources vs. sorties" (1 paragraphe dans doc contribution).

Livrables:
- Repo sans artefacts generes versionnes.
- `.gitignore` aligne avec les outils utilises.

Criteres de sortie:
- Un build local ne genere pas de diff Git.
- Les PR n'incluent pas d'artefacts (hors cas explicitement voulu).

## Phase 3 - Industrialisation qualite (1 semaine)
Objectif: rendre la qualite automatique et bloquante.

Travaux:
- Ajouter scripts dans `package.json`:
  - `typecheck` (tsc --noEmit)
  - `lint` (ESLint/Biome)
  - `test` (si framework ajoute)
  - `ci` (pipeline local)
- Ajouter un linter/formatter minimal (choisir un seul outil principal).
- Ajouter CI:
  - install deps
  - typecheck
  - lint
  - build

Livrables:
- CI stable et verte.
- Guide contribution: commandes standard et attentes.

Criteres de sortie:
- Aucun merge sans CI verte.
- Temps CI raisonnable (cible: < 10 min).

## Phase 4 - Alignement documentaire (2-3 jours)
Objectif: supprimer la desynchronisation docs/code.

Travaux:
- Mettre a jour `README.md`:
  - variables d'environnement reelles (ex: `VITE_*`)
  - commandes (dev, build, electron:dev, electron:build)
- Mettre a jour `ARCHITECTURE.md` pour decrire l'etat reel (fichiers existants).
- Ajouter ADR legers (dossier `docs/adr/` ou `.team_sync/DECISIONS.md`):
  - securite Electron (pourquoi + approche)
  - stockage (IndexedDB vs cloud)
  - PWA / service worker (strategie)

Livrables:
- Docs executables (un dev peut run sans aide orale).

Criteres de sortie:
- Setup from scratch sur machine propre reussi en suivant uniquement la doc.

## Phase 4B - Optimisation Xiaomi Pad 6 (PWA Chrome Android) (1-2 semaines)
Objectif: garantir une experience stable et lisible sur Xiaomi Pad 6 en portrait et paysage via web app installee depuis Chrome Android.

Perimetre:
- App en mode PWA installee depuis Chrome Android.
- Orientation portrait et paysage.
- Composants critiques: viewer PDF, toolbar, panneaux latereaux, zones scrollables.

Travaux:
- Verifier viewport et safe areas:
  - comportement `100vh` / `dvh` sur Android
  - gestion barres systeme (adresse/navigation) et resize dynamique
- Stabiliser layout responsive tablet:
  - breakpoints dedies tablette
  - dimensions minimales des controles tactiles
  - prevention des chevauchements toolbar/panels
- Optimiser interactions tactiles:
  - pinch/zoom, pan, inertie scroll
  - zones de hit adaptatives
  - prevention des gestures conflictuelles navigateur
- Optimiser mode orientation:
  - conservation etat lors rotation
  - recalcul geometie/rendu sans "jump"
- Durcir PWA UX:
  - lancement standalone
  - splash/icone/theme-color coherents
  - comportement offline/degrade maitrise
- Mettre en place une checkliste de validation device:
  - tests manuels sur Xiaomi Pad 6 reel
  - parcours critiques portrait/paysage

Livrables:
- Correctifs UI/UX tablette limites et tracables.
- Checklist de validation Xiaomi Pad 6.
- Rapport de resultats (issues corrigees / residuelles).

Criteres de sortie:
- Aucun blocage de navigation/lecture en portrait et paysage.
- Toolbar et actions principales toujours accessibles.
- Rotation stable sans perte de contexte utilisateur.
- PWA installable et utilisable en standalone sans regression majeure.

## Phase 5 - Refactor structurel (2-3 semaines)
Objectif: diminuer la complexite dans `App` et `PdfViewer` sans casser le comportement.

Strategie:
- Refactor "strangler pattern": extraire petit a petit des blocs coherents.
- Stabiliser les interfaces (types) avant de bouger la logique.

Chantiers proposes:
- Extraire des hooks:
  - `useThemeConfig` (localStorage + migration)
  - `useRecentFiles` (IndexedDB + cloud si actif)
  - `useReadingPosition` (save/restore)
  - `useViewerControls` (view/scroll/scale/page state)
- Extraire services "side effects":
  - logs, telemetry (si ajoute)
  - integration Drive / Supabase / Gemini
- Reduire l'usage de `any` dans:
  - `src/components/PdfViewer.tsx`
  - `src/components/OutlinePanel.tsx`
  - `src/services/drive.ts`
  - `src/services/supabase.ts`

Livrables:
- Fichiers centraux reduits et plus lisibles.
- Types plus stricts, moins de `any`.

Criteres de sortie:
- Pas de regression observable sur les parcours critiques.
- Les changements restent en PRs petites, testables.

## Phase 6 - Tests (1-2 semaines)
Objectif: proteger les parcours critiques contre les regressions.

Approche:
- Priorite aux tests de services (deterministes) avant les tests UI.
- Utiliser des mocks pour Drive/Supabase/Gemini.

Chantiers:
- Tests unitaires:
  - `src/services/storage.ts` (IndexedDB: utiliser un environnement de test adapte)
  - `src/utils/ThemeManager.ts`
- Tests integration UI:
  - chargement d'un PDF
  - navigation page
  - persistence position
  - recent files (ajout/suppression)
- Smoke tests Electron:
  - demarrage
  - ouverture fenetre
  - chargement index.html (prod)

Livrables:
- Suite de tests rapide + stable.

Criteres de sortie:
- Tests couvrent les regressions historiques les plus couteuses (zoom/scroll, recents, themes).

## Phase 7 - Release hardening (1 semaine)
Objectif: rendre la livraison reproductible et exploitable.

Travaux:
- Checklist release (versioning, notes, verification)
- Packaging Electron:
  - validation build Windows
  - taille des artefacts
  - verification config electron-builder
- Observabilite:
  - logs structures (optionnel)
  - crash reporting (optionnel, selon contraintes)

Livrables:
- Release candidate reproductible.

Criteres de sortie:
- Build sur machine propre + parcours critiques OK.

## Phase 8 - Amelioration continue (continu)
Objectif: maintenir la qualite dans le temps.

Rituels:
- Revue mensuelle securite (Electron deps, audit rapide config)
- Revue dette technique (top 10 issues)
- Suivi metriques:
  - temps CI
  - taux de tests
  - regressions post-release

Livrables:
- Tableau de bord minimal + cadence de maintenance.

## Backlog propose (squelette)
- P0: Formaliser quality gates + runbook local.
- P1: Migration Electron secure + preload bridge.
- P2: Ignorer `dev-dist/` + de-tracker artefacts.
- P3: Ajouter lint + CI.
- P4: MAJ README/ARCHITECTURE + ADR.
- P4B: Optimiser UX Xiaomi Pad 6 (portrait/paysage, PWA Chrome Android).
- P5: Extraire hooks de `App` + modulariser `PdfViewer`.
- P6: Ajouter tests services + smoke Electron.
- P7: Durcir process de release.
