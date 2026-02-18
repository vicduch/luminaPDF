# Phase 0 - Decisions de Cadrage

Date: 2026-02-18

## In-scope
- Securisation Electron (`nodeIntegration`, `contextIsolation`, preload bridge).
- Hygiene Git/workspace (artefacts generes, `.gitignore`, de-tracking).
- Industrialisation qualite (`typecheck`, `lint`, `test`, CI).
- Alignement documentation (README, architecture, decisions).
- Optimisation tablette Xiaomi Pad 6 en PWA Chrome Android (portrait/paysage).
- Refactor progressif `App` / `PdfViewer` sans rupture fonctionnelle.
- Mise en place tests cibles et durcissement release.

## Out-of-scope (phase 0)
- Refonte UX/UI majeure.
- Changement de stack front.
- Migration cloud profonde hors corrections de robustesse.
- Optimisations prematurees non liees a un flux critique.

## Ordre des phases valide
1. Cadrage (phase 0)
2. Optimisation Xiaomi Pad 6 PWA (phase 4B) [PRIORITE]
3. Securite Electron (phase 1)
4. Hygiene workspace/repo (phase 2)
5. Quality gates + CI (phase 3)
6. Documentation (phase 4)
7. Refactor structurel (phase 5)
8. Tests cibles (phase 6)
9. Release hardening (phase 7)
10. Amelioration continue (phase 8)

## Decision prioritaire
- La phase `4B` est executee avant les phases `1/2/3/4`.
- Justification: impact utilisateur direct eleve (tablette cible d'usage) + frequence de release quotidienne.

## Criteres de sortie phase 0
- Backlog priorise publie.
- Quality gates definis.
- Workflow PR et checklist publies.
- Flux critiques documentes.
- Scope et sequencing valides.

## Regles de pilotage
- Aucune execution phase 5+ avant securite Electron traitee.
- Toute exception au plan doit etre tracee dans ce fichier.
- Les decisions structurantes doivent rester courtes, datees, et actionnables.

---

## Decisions complementaires (2026-02-18)

### DEC-01 — Convention d'ID ticket
- Format: `P<numero_phase>-<DOMAINE_MAJUSCULE>-<seq_2chiffres>`
- Exemples: `P1-SEC-01`, `P2-GIT-03`, `P3-CI-02`
- DOMAINE: `SEC` (securite), `GIT` (hygiene repo), `CI` (qualite/CI), `DOC` (documentation), `RFCT` (refactor), `TEST` (tests), `REL` (release)
- Sequence: 01, 02, 03 … par phase+domaine, sans trous

### DEC-02 — Definition stricte de "artefact genere"
- Est un artefact genere tout fichier produit automatiquement par:
  - `npm run dev` (ex: `dev-dist/sw.js`, `dev-dist/workbox-*.js`)
  - `npm run build` (ex: `dist/`)
  - `npm run electron:build` (ex: `release/`)
  - tout outil de linting/formatting qui genere des sorties
- N'est PAS un artefact genere: tout fichier dans `src/`, `electron/`, `public/`, les fichiers de config racine, les docs
- Regle: les artefacts generes ne doivent jamais apparaitre dans un diff PR, sauf ticket explicite
- Responsabilite: l'auteur de la PR verifie `git diff --name-only` avant chaque commit

### DEC-03 — Regle de review pour les changements Electron sensibles
- Tout changement dans `electron/main.cjs`, `electron/preload.js` (futur), ou dans `webPreferences` de `BrowserWindow` requiert **2 reviewers** minimum
- "Changement Electron sensible" inclut aussi: ajout d'un flag `webPreferences`, modification des handlers `will-navigate`/`new-window`, ajout d'une API dans `contextBridge`
- Aucun auto-merge pour ces fichiers meme si la CI est verte
- Owner securite: `vicdu` (auteur + premier reviewer)
- 2e reviewer: `TBD` — **nom requis avant que P1-SEC-03 puisse etre mergee** (blocker explicite)

### DEC-04 — Script `typecheck` minimal obligatoire des Phase 1
- Commande standard: `npx tsc --noEmit`
- A ajouter dans `package.json` sous la cle `"typecheck"` avant la premiere PR Phase 1
- Bloquant sur toute PR Phase 1+
