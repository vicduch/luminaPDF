# Phase 0 - Workflow et PR Checklist

## Workflow branche
- Branches: `feature/*`, `fix/*`, `chore/*`, `docs/*`.
- Une PR = un objectif principal.
- PR petites et reversibles (cible: < 400 lignes nettes si possible).
- Rebase regulier sur `master` pour limiter les conflits.

## Workflow review
- 1 reviewer minimum.
- 2 reviewers requis pour changements securite Electron.
- Aucun auto-merge sans checks obligatoires au vert.

## DoD PR minimale
- Changement coherent avec le ticket.
- `typecheck` et `build` OK.
- Pas d'artefacts generes accidentels.
- Docs impactees mises a jour.
- Risques et impact clairement notes dans la description PR.

## PR Checklist (a copier dans chaque PR)
- [ ] Ticket de reference lie.
- [ ] Scope de la PR limite et explicite.
- [ ] `typecheck` passe.
- [ ] `build` passe.
- [ ] Aucun fichier genere non voulu dans le diff.
- [ ] Docs mises a jour si comportement/config changes.
- [ ] Si Electron impacte: revue securite effectuee.
- [ ] Plan de rollback simple defini.

## Rythme recommande
- Merges frequents, faible batch.
- Eviter les branches longues pour limiter la derive.
