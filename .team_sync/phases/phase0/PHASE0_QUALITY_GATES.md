# Phase 0 - Quality Gates

Objectif: rendre la qualite mesurable et bloquante sur chaque PR.

## Gates immediats (des phase 1)
1. `typecheck` passe.
2. `build` passe.
3. Aucun artefact genere versionne par erreur.
4. Documentation impactee mise a jour.

## Gates cibles (ajout progressif)
1. `lint` bloque le merge (phase 3).
2. `test` bloque le merge (phase 6).
3. Smoke Electron sur build release candidate (phase 7).

## Regles de merge
- PR interdite si un gate obligatoire echoue.
- PR interdite si diff contient des sorties de build non voulues (`dist`, `dev-dist`, `release`), sauf ticket explicite.
- PR interdite si changements Electron sensibles sans revue securite.

## Definition minimale des checks
- `typecheck`: `npx tsc --noEmit`.
- `build`: build front + build electron si impact packaging.
- `lint`: regles statiques agreees par l'equipe.
- `test`: suite ciblee sur flux critiques + tests services.

## Matrice par phase
- Phase 1: `typecheck`, `build`, hygiene artefacts.
- Phase 2: hygiene artefacts renforcee.
- Phase 3: `lint` obligatoire en plus.
- Phase 4: gate doc renforce.
- Phase 5: gates inchanges, controle regressions refactor.
- Phase 6: `test` obligatoire.
- Phase 7: smoke release obligatoire.
- Phase 8: suivi continu des taux d'echec.

## Criteres de sortie phase 0 (qualite)
- La liste des gates est figee et acceptee.
- Le mode "bloquant/non bloquant" est explicite pour chaque gate.
- Les exceptions possibles sont documentees (cas rares, ticket requis).
