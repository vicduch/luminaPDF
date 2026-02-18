# Phase 0 Backlog - LuminaPDF

Objectif: produire un backlog executable, ordonne, et pret pour les phases 1 a 8.

## Format ticket
- `ID` — convention: `P<phase>-<DOMAINE>-<seq>` (ex: `P1-SEC-01`)
- `Titre`
- `Objectif`
- `Criteres d'acceptation` (CA) — liste courte, verifiable
- `Dependances`
- `Effort` (`S` <= 0.5j | `M` <= 2j | `L` <= 1 semaine)
- `Risque` (`Faible` | `Moyen` | `Eleve`)

---

## Phase 0 — Cadrage (✅ Termine)

### P0-01 ✅
- `Titre`: Verrouiller le perimetre et les non-objectifs
- `Objectif`: definir ce qui est inclus/exclu pour eviter les derivees de scope
- `Dependances`: aucune
- `Effort`: `S`
- `Risque`: `Moyen`

### P0-02 ✅
- `Titre`: Lister les parcours critiques produit
- `Objectif`: proteger les flux avec le plus fort risque de regression
- `Dependances`: `P0-01`
- `Effort`: `S`
- `Risque`: `Eleve`

### P0-03 ✅
- `Titre`: Definir quality gates obligatoires
- `Objectif`: imposer les checks minimaux sur chaque PR
- `Dependances`: `P0-01`
- `Effort`: `S`
- `Risque`: `Eleve`

### P0-04 ✅
- `Titre`: Definir workflow branches/PR/DoD
- `Objectif`: standardiser la livraison et la review
- `Dependances`: `P0-03`
- `Effort`: `S`
- `Risque`: `Moyen`

### P0-05 ✅
- `Titre`: Prioriser le chantier securite Electron
- `Objectif`: decrire clairement le lot phase 1 et ses criteres de sortie
- `Dependances`: `P0-01`, `P0-02`
- `Effort`: `M`
- `Risque`: `Eleve`

### P0-06 ✅
- `Titre`: Cadrer le nettoyage Git/workspace
- `Objectif`: lister les artefacts a ignorer/de-tracker et la strategie de migration
- `Dependances`: `P0-01`
- `Effort`: `S`
- `Risque`: `Moyen`

### P0-07 ✅
- `Titre`: Cadrer quality tooling et CI
- `Objectif`: choisir outils lint/test/checks et sequence d'integration
- `Dependances`: `P0-03`, `P0-04`
- `Effort`: `M`
- `Risque`: `Moyen`

### P0-08 ✅
- `Titre`: Definir la strategie de refactor App/PdfViewer
- `Objectif`: planifier extraction progressive en lots reversibles
- `Dependances`: `P0-02`, `P0-05`
- `Effort`: `M`
- `Risque`: `Eleve`

### P0-09 ✅
- `Titre`: Definir la strategie de test cible
- `Objectif`: prioriser tests unitaires/integration/smoke Electron
- `Dependances`: `P0-02`, `P0-07`
- `Effort`: `M`
- `Risque`: `Moyen`

### P0-10 ✅
- `Titre`: Valider le sequencing global et jalons
- `Objectif`: figer l'ordre des phases, dependances et criteres de passage
- `Dependances`: `P0-05`, `P0-06`, `P0-07`, `P0-08`, `P0-09`
- `Effort`: `S`
- `Risque`: `Eleve`

---

## Phase 1 — Securisation Electron

> Reference: `electron/main.cjs` — `nodeIntegration: true` (l.11), `contextIsolation: false` (l.12), preload commente (l.13).
> Flux protege prioritaire: `CF-06`.

### P1-SEC-01
- `Titre`: Auditer les acces Node dans le renderer
- `Objectif`: inventorier tout ce qui necessite Node dans `src/` avant de couper `nodeIntegration`
- `Criteres d'acceptation`:
  - [ ] Liste exhaustive des `require()`, `process.*`, `__dirname`, `fs.*`, `shell.*` dans `src/` produite et documentee
  - [ ] Chaque occurrence est classee: "a migrer vers preload" ou "deja absent"
  - [ ] Document de synthese commit dans `.team_sync/phases/phase1/`
- `Dependances`: aucune (premier ticket phase 1)
- `Effort`: `S`
- `Risque`: `Moyen`

### P1-SEC-02
- `Titre`: Creer `electron/preload.js` minimal avec contextBridge
- `Objectif`: disposer d'un fichier preload vide/minimal, reference dans main.cjs, avant de changer les flags
- `Criteres d'acceptation`:
  - [ ] `electron/preload.js` existe et exporte un objet API vide (`{}`) via `contextBridge.exposeInMainWorld`
  - [ ] `preload: path.join(__dirname, 'preload.js')` decomente dans `main.cjs`
  - [ ] `npm run electron:dev` demarre sans crash avec le preload active
  - [ ] Aucune API Node exposee au renderer sans justification documentee
- `Dependances`: `P1-SEC-01`
- `Effort`: `S`
- `Risque`: `Moyen`

### P1-SEC-03
- `Titre`: Basculer `nodeIntegration: false` et `contextIsolation: true`
- `Objectif`: supprimer l'acces implicite Node dans le renderer
- `Criteres d'acceptation`:
  - [ ] `nodeIntegration: false` dans `webPreferences`
  - [ ] `contextIsolation: true` dans `webPreferences`
  - [ ] `npm run electron:dev` passe sans regression sur CF-01, CF-02, CF-03
  - [ ] `npm run electron:build` produit un installer fonctionnel
  - [ ] Aucune erreur console liee a `require is not defined` ou `process is not defined` (ou toutes resolues via bridge)
- `Dependances`: `P1-SEC-02`
- `Effort`: `M`
- `Risque`: `Eleve`

### P1-SEC-04
- `Titre`: Exposer via contextBridge les API necessaires (whitelist minimale)
- `Objectif`: migrer chaque appel Node identifie en P1-SEC-01 vers le bridge
- `Criteres d'acceptation`:
  - [ ] Chaque API du bridge est documentee dans `.team_sync/phases/phase1/PRELOAD_API.md` (nom, signature, justification)
  - [ ] Le renderer n'appelle plus directement `require`, `fs`, `process`, `shell`
  - [ ] La liste est la plus courte possible (principe de moindre privilege)
- `Dependances`: `P1-SEC-01`, `P1-SEC-03`
- `Effort`: `M`
- `Risque`: `Eleve`

### P1-SEC-05
- `Titre`: Securiser la navigation externe (`window.open`, liens, `shell.openExternal`)
- `Objectif`: s'assurer que les URLs externes ne peuvent pas ouvrir un renderer Electron non controle
- `Criteres d'acceptation`:
  - [ ] Event `will-navigate` intercepte: navigation vers URL non `localhost` / `file://` bloquee ou redirigee
  - [ ] Event `new-window` / `setWindowOpenHandler` configure pour bloquer ou ouvrir dans le browser systeme
  - [ ] Liens externes du renderer passent par le bridge (`shell.openExternal` cote main process uniquement)
- `Dependances`: `P1-SEC-03`
- `Effort`: `S`
- `Risque`: `Moyen`

### P1-SEC-06
- `Titre`: Validation smoke CF-06 (mode Electron dev + build)
- `Objectif`: confirmer que l'app Electron est fonctionnelle avec la config securisee
- `Criteres d'acceptation`:
  - [ ] `npm run electron:dev`: app demarre, PDF s'ouvre (CF-01), zoom/scroll OK (CF-03)
  - [ ] `npm run electron:build`: installer produit, app lancee depuis l'installer, memes CF OK
  - [ ] Aucun `warning: Electron Security Warning` dans la console sur les points traites
  - [ ] `typecheck` et `build` passent
- `Dependances`: `P1-SEC-04`, `P1-SEC-05`
- `Effort`: `S`
- `Risque`: `Moyen`

---

## Phase 2 — Hygiene Git et workspace

> Reference: `.gitignore` actuel (verifie 2026-02-18): couvre `dist` mais pas `dev-dist/`.
> Fichiers tracked a traiter: `dev-dist/sw.js`, `dev-dist/workbox-5a5d9309.js`, 8 PNG dans `src/debug_assets/render_bugs/`.

### P2-GIT-01
- `Titre`: Ajouter `dev-dist/` au `.gitignore`
- `Objectif`: que le serveur PWA de dev ne pollue plus le diff Git
- `Criteres d'acceptation`:
  - [ ] `.gitignore` contient la ligne `dev-dist/`
  - [ ] Apres `npm run dev`, `git status` ne montre aucun fichier `dev-dist/` comme modifie/non-tracked
- `Dependances`: aucune
- `Effort`: `S`
- `Risque`: `Faible`

### P2-GIT-02
- `Titre`: De-tracker `dev-dist/sw.js` et `dev-dist/workbox-5a5d9309.js`
- `Objectif`: retirer ces 2 fichiers de l'index Git (sans les supprimer localement)
- `Criteres d'acceptation`:
  - [ ] `git ls-files dev-dist/` retourne vide apres la PR
  - [ ] Les fichiers existent toujours sur le disque local (non supprimes)
  - [ ] Commit de de-tracking inclus dans la PR
- `Dependances`: `P2-GIT-01`
- `Effort`: `S`
- `Risque`: `Faible`

### P2-GIT-03
- `Titre`: Appliquer Option A pour les assets debug (`src/debug_assets/render_bugs/`)
- `Objectif`: deplacer les 8 PNG vers `docs/debug_assets/render_bugs/` et les de-tracker de `src/`
- `Decision`: **Option A retenue (2026-02-18, vicdu)** — deplacer hors `src/` pour eviter pollution bundle, clarifier "code vs docs", simplifier `.gitignore`
- `Criteres d'acceptation`:
  - [ ] Dossier `docs/debug_assets/render_bugs/` cree avec les 8 PNG
  - [ ] `src/debug_assets/` supprime du tracking Git (`git ls-files src/debug_assets/` retourne vide)
  - [ ] `.gitignore` ajuste si necessaire (ex: ignorer `src/debug_assets/` si le dossier reste localement)
  - [ ] Aucune reference cassee dans le code source (verifier imports)
  - [ ] Note dans `.team_sync/phases/phase2/DEBUG_ASSETS_DECISION.md` (1 ligne: "Option A, deplace en docs/debug_assets/, 2026-02-18")
- `Dependances`: aucune
- `Effort`: `S`
- `Risque`: `Faible`

### P2-GIT-04
- `Titre`: (Fusionne dans P2-GIT-03 — Option A integre l'execution)
- `Statut`: **Supprime** — P2-GIT-03 a ete reformule pour inclure directement l'execution (decision + action dans le meme ticket, effort S)
- `Dependances`: n/a

### P2-GIT-05
- `Titre`: Documenter la politique "sources vs. sorties"
- `Objectif`: formaliser la regle pour eviter les recidives
- `Criteres d'acceptation`:
  - [ ] Paragraphe "Politique sources vs. sorties" ajoute dans un fichier accessible (ex: `CONTRIBUTING.md` ou `.team_sync/CONTRIBUTING_RULES.md`)
  - [ ] Definit clairement ce qu'est un "artefact genere" (voir PHASE0_DECISIONS.md)
  - [ ] Liste les patterns `.gitignore` attendus
- `Dependances`: `P2-GIT-02`, `P2-GIT-04`
- `Effort`: `S`
- `Risque`: `Faible`

---

## Ordre d'execution recommande (Phase 0)

1. `P0-01` → `P0-02` → `P0-03` → `P0-04` → `P0-05` → `P0-06` → `P0-07` → `P0-08` → `P0-09` → `P0-10`

## Ordre d'execution recommande (Phase 1)

1. `P1-SEC-01` (audit)
2. `P1-SEC-02` (preload vide)
3. `P1-SEC-03` (flags securises)
4. `P1-SEC-04` (bridge API) — en parallele avec `P1-SEC-05`
5. `P1-SEC-05` (navigation externe)
6. `P1-SEC-06` (smoke test)

## Ordre d'execution recommande (Phase 2)

1. `P2-GIT-01` + `P2-GIT-03` (en parallele — independants)
2. `P2-GIT-02` (depends P2-GIT-01)
3. `P2-GIT-05` (depends P2-GIT-02 + P2-GIT-03)

## Criteres de sortie phase 0
- Backlog priorise et valide par l'equipe.
- Quality gates ecrits et acceptes.
- Workflow PR/branches/DoD documente.
- Flux critiques formalises.
- Decisions de scope et sequencing signees.
