# Phase 0 - Critical Flows

Objectif: decrire les parcours a proteger en priorite contre les regressions.

## CF-01 Ouvrir un PDF local
- Etapes: selection fichier -> rendu premiere page -> metadata dispo.
- Attendu: ouverture stable, pas de crash, temps de chargement acceptable.
- Risques: erreurs worker PDF, fichier corrompu, blocage UI.

## CF-02 Navigation document
- Etapes: changement de page via toolbar/raccourcis -> rendu page cible.
- Attendu: numero de page coherent, rendu correct, pas de desync UI.
- Risques: etat stale, callback non synchronise, perte de focus clavier.

## CF-03 Zoom + Scroll
- Etapes: zoom in/out + scroll continu/paged.
- Attendu: fluidite, position logique conservee, pas d'artefacts visuels.
- Risques: regressions historiques de geometire, jitter, offsets incorrects.

## CF-04 Recents (local)
- Etapes: ouvrir PDF -> sauvegarde metadata -> reouverture depuis recents.
- Attendu: entree recents fiable, ouverture du bon document, suppression propre.
- Risques: incoherence blob/metadata, collisions d'identifiants, stale data.

## CF-05 Persistance position lecture
- Etapes: lire -> fermer -> rouvrir -> restauration page/zoom/scroll mode.
- Attendu: position restauree correctement.
- Risques: ecrasement metadonnees, race conditions, migration schema.

## CF-06 Mode Electron (dev/build)
- Etapes: lancement app Electron -> chargement UI -> fermeture propre.
- Attendu: app demarre sans warning critique, comportement identique au web.
- Risques: config webPreferences insecurisee, differences env dev/prod.

## CF-07 Integrations externes (Drive/Supabase/Gemini)
- Etapes: auth/usage -> erreurs gerables -> fallback propre si indisponible.
- Attendu: pas de crash si credentials absents; message utilisateur clair.
- Risques: secrets mal geres, callback OAuth fragile, erreurs reseau non capturees.

## Priorite de protection
1. `CF-06` (securite Electron)
2. `CF-03` (zoom/scroll)
3. `CF-01` (ouverture PDF)
4. `CF-05` (persistance position)
5. `CF-04` (recents)
6. `CF-02` (navigation)
7. `CF-07` (integrations)
