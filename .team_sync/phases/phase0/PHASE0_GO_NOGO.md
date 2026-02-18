# Phase 0 — Checklist Go/No-Go pour Phase 1

Date de creation: 2026-02-18
Statut: A valider avant de demarrer P1-SEC-01

---

## Checklist Go/No-Go

La Phase 0 est consideree terminee quand TOUS les points ci-dessous sont coches.

### Documentation et cadrage

| # | Critere | Statut | Owner |
|---|---------|--------|-------|
| G01 | `WORKSPACE_AUDIT_2026-02-18.md` a jour avec l'etat reel du repo | ✅ Fait | Agent CODER |
| G02 | `IMPLEMENTATION_PLAN_2026-02-18.md` coherent avec les phases definies | ✅ Fait | Agent CODER |
| G03 | `PHASE0_BACKLOG.md` contient des tickets P1 et P2 avec criteres d'acceptation | ✅ Fait | Agent CODER |
| G04 | `PHASE0_QUALITY_GATES.md` definit les gates bloquants/non-bloquants par phase | ✅ Fait | Agent CODER |
| G05 | `PHASE0_PR_CHECKLIST.md` publiee et applicable des la prochaine PR | ✅ Fait | Agent CODER |
| G06 | `PHASE0_CRITICAL_FLOWS.md` liste les 7 flux critiques avec priorites | ✅ Fait | Agent CODER |
| G07 | `PHASE0_DECISIONS.md` inclut les 4 decisions manquantes (DEC-01 a DEC-04) | ✅ Fait | Agent CODER |
| G08 | `PHASE0_GO_NOGO.md` lui-meme redige et utilisable | ✅ Fait | Agent CODER |

### Prerequis techniques pour demarrer Phase 1

| # | Critere | Statut | Owner |
|---|---------|--------|-------|
| G09 | `npm run build` passe sur la branche courante | ✅ Verifie (2026-02-18) | vicdu |
| G10 | `npx tsc --noEmit` passe (0 erreur TypeScript) | ✅ Verifie (2026-02-18) | vicdu |
| G11 | L'app Electron se lance en mode dev (`npm run electron:dev`) | ⬜ A verifier | TBD |
| G12 | Convention d'ID ticket connue de l'equipe (DEC-01) | ⬜ A communiquer | vicdu |
| G13 | 2e reviewer securite Phase 1 designe (DEC-03) — nom requis avant P1-SEC-03 | ⬜ Nom TBD | vicdu |

### Perimetre et risques acceptes

| # | Critere | Statut | Owner |
|---|---------|--------|-------|
| G14 | Scope Phase 1 borne: uniquement `electron/main.cjs`, `electron/preload.js`, `webPreferences` | ✅ Decide | Agent CODER |
| G15 | Out-of-scope Phase 1 confirme: pas de refactor React, pas de CI, pas de .gitignore | ✅ Decide | Agent CODER |
| G16 | Les tickets P1-SEC-01 a P1-SEC-06 sont compris et acceptes par l'equipe | ⬜ A valider | vicdu |

---

## Risques residuels acceptes avant Phase 1

Ces risques sont connus, documentes, et acceptes volontairement pour ne pas bloquer le demarrage.

| Risque | Impact | Probabilite | Mitigation |
|--------|--------|-------------|------------|
| Le renderer utilise `require()` ou `process.*` sans qu'on le sache (pas encore audite) | Eleve — Phase 1 casse l'app si non traite | Faible (app web pure, pas de require visible) | P1-SEC-01 audite avant tout changement de flag |
| `ARCHITECTURE.md` toujours obsolete en entrant Phase 1 | Faible — confusion doc seulement | Certaine | Scope Phase 4; n'impacte pas la securite |
| `dev-dist/` toujours tracke pendant Phase 1 | Faible — bruit Git | Certaine | Traite en Phase 2; ne bloque pas Phase 1 |
| Pas de `typecheck` script dans `package.json` | Moyen — gate bloquant non automatisable | Certaine | `npx tsc --noEmit` passe (G10 verifie), mais script manquant dans package.json — a ajouter en premiere PR Phase 1 |
| Referent securite non designe | Moyen — reviews a 2 non applicables | Certaine | Bloquer si non resolu avant P1-SEC-03 (la PR la plus risquee) |

---

## Decision finale

```
[ ] GO  — tous les points G01-G16 coches → demarrer P1-SEC-01
[ ] NO-GO — points bloquants en attente (preciser lesquels):
```

Date de validation: ___________
Valide par: ___________

---

## Notes

- G01-G10, G14-G15 coches (11/16). Restants: G11, G12, G13, G16.
- G11 (electron:dev): a verifier manuellement (non bloquant pour P1-SEC-01 qui est un audit pur).
- G12 (DEC-01): vicdu communique la convention a l'equipe.
- G13 (2e reviewer): **bloquant avant P1-SEC-03** — pas avant P1-SEC-01 et P1-SEC-02.
- G16 (validation tickets): vicdu valide P1-SEC-01..06 avant premier merge.
- Etat `.team_sync/phases/` non suivi par Git (untracked): a ajouter en `git add` manuellement quand souhaite.
