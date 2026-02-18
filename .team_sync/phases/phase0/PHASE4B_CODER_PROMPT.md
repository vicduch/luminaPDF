# Prompt Agent Coder - Phase 4B PRIORITAIRE

Tu es **Agent CODER** sur le workspace `C:\Users\vicdu\Documents\Antigravity projects\luminapdf`.

## Mission
Executer en priorite la **Phase 4B: optimisation Xiaomi Pad 6** (PWA installee depuis Chrome Android), en mode portrait et paysage.

## Contexte
- Cette phase est officiellement prioritaire.
- Tu travailles sur l'app web/PWA (pas sur Electron pour cette mission).
- Objectif: experience stable, lisible, tactile, sans regressions majeures.

## Documents a lire avant action
- `.team_sync/phases/phase0/IMPLEMENTATION_PLAN_2026-02-18.md`
- `.team_sync/phases/phase0/PHASE0_DECISIONS.md`
- `.team_sync/phases/phase0/PHASE0_CRITICAL_FLOWS.md`
- `.team_sync/phases/phase0/DISCUSSION_SUMMARY_2026-02-18.md`

## Objectifs techniques (obligatoires)
1. Corriger les problemes viewport Android tablette:
- stabiliser `vh/dvh`
- gerer correctement resize/barres systeme
- eviter les sauts de layout en rotation

2. Optimiser l'usage tactile Xiaomi Pad 6:
- interactions zoom/pan/scroll fluides
- controles actionnables au doigt
- pas de conflit geste navigateur vs viewer

3. Garantir la robustesse orientation portrait/paysage:
- conservation contexte lecture (page/zoom/position)
- UI critique toujours accessible (toolbar/actions)
- pas de chevauchement de panneaux

4. Verifier le mode PWA installee:
- lancement standalone propre
- theme-color/manifest coherents
- comportement degrade acceptable si offline

## Contraintes
- Changements minimaux et cibles.
- Ne pas degrader desktop.
- Ne pas lancer de refactor massif hors scope.
- Ne pas toucher aux sujets phase 1 (hardening Electron) dans cette mission.

## Livrables obligatoires
1. Code implemente pour la phase 4B.
2. Nouveau rapport:
- `.team_sync/phases/phase4/PHASE4B_XIAOMI_PAD6_VALIDATION.md`
- Contenu: checks executes, resultats portrait/paysage, bugs residuels, risques restants.
3. Mise a jour courte de suivi:
- `.team_sync/phases/phase0/PROJECT_STATUS_PHASE4B.md`

## Validation attendue
- `npx tsc --noEmit` passe.
- `npm run build` passe.
- Tests manuels de parcours critiques sur tablette cibles decrits dans le rapport.

## Format de ton retour
- Fichiers modifies/ajoutes.
- Resume concret des correctifs.
- Liste des risques residuels.
- Recommandation Go/No-Go pour cloturer la phase 4B.
