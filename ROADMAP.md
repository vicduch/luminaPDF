# Cap de LuminaPDF

## Décisions de reprise — 13 novembre 2026

L'usage confirmé est la **PWA sur Xiaomi Pad 6 et sur PC**, pas la variante Electron. Le résultat recherché est de lire confortablement, retrouver sa lecture et savoir quelles données sont réellement conservées. Les appareils ne sont pas supposés synchronisés.

La présente feuille de route remplace l'ordre de travail des anciens plans de `.team_sync/`, sans effacer leur historique ni lever leurs garde-fous de sécurité. Elle ne commande aucune correction, migration, diffusion ou mise à jour automatique : chaque évolution demande un périmètre autorisé. Après la reprise documentaire, l'utilisateur a demandé la refonte du lecteur ; son contrat est [LUM-2](docs/features/LUM-2-lecteur-pwa.md). Les états et l'ordre des travaux sont tenus uniquement dans [backlog.json](backlog.json).

## Socle de reprise

**Résultat attendu :** pouvoir reprendre le projet sans suivre une ancienne architecture ni confondre présence du code, essai réel et version installée.

**Preuve de fin :** le guide de démarrage correspond aux commandes et variables réellement lues ; l'architecture décrit les composants existants et leurs limites ; les archives sont identifiées ; la file des travaux est unique et la documentation est acceptée.

**Dépendances :** état local et code inspectés, usage principal confirmé par l'utilisateur. Les modifications de zoom/centrage et les autres fichiers préexistants sont conservés sans être intégrés ou validés implicitement.

**Risque principal :** attribuer à la PWA installée le comportement d'une construction locale différente. L'adresse utilisée et la version effectivement installée restent à identifier avant les essais comparatifs.

## Lecture PWA fiable

**Résultat attendu :** ouvrir et parcourir ses PDF sur les deux appareils, zoomer sans perdre sa cible et tourner la tablette sans perdre sa page.

**Preuve de fin :** comportement observé sur les PWA réelles tablette et PC, avec PDF court et volumineux ; ouverture, modes continu/paginé, sommaire, ajustement, gestes et rotation sans blocage ni dérive gênante. La géométrie locale et les gestes doivent être qualifiés par des parcours réels, pas seulement une construction ou une simulation réussie.

**Dépendances :** identification des versions installées et conservation d'un point de comparaison pour les changements locaux. Des contrôles reproductibles ciblés protègent ensuite les comportements retenus, sans imposer un refactor global ni une nouvelle pile d'outils.

**Risque principal :** corriger le zoom d'un mode et dégrader l'autre, ou tester une ancienne version conservée par le service worker. Aucun effacement des données du site pour contourner un problème sans sauvegarde et accord.

**Condition avant nouvelle diffusion PWA :** examiner les valeurs publiques embarquées, les appels IA/cloud et leurs autorisations. La documentation ne prouve pas qu'une clé privée est présente, mais le mécanisme actuel permet d'en livrer une au navigateur. Un déploiement ou un appel potentiellement payant exige son accord distinct.

## Conservation et autonomie

**Résultat attendu :** retrouver la progression et les notes sur chaque appareil, avec des limites de sauvegarde explicites, et savoir ce qui reste lisible sans réseau. Il ne s'agit pas encore de synchroniser PC et tablette.

**Preuve de fin :** fermeture et réouverture réelles confirment la conservation attendue ; les PDF homonymes et les erreurs de stockage ne font pas perdre silencieusement des données ; le périmètre de lecture hors ligne est démontré après redémarrage, avec des documents déjà importés. Les limites et un moyen de conservation indépendant sont expliqués avant de compter sur les notes pour un usage important.

**Dépendances :** géométrie de lecture qualifiée, examen du stockage existant et de la provenance du worker PDF. Toute correction touchant les données passe par un cadrage protégé et une preuve de conservation ; aucune migration n'est présumée nécessaire.

**Risque principal :** considérer le cache ou IndexedDB comme une sauvegarde. La présence d'un champ `annotations` ne signifie pas que les notes actives sont enregistrées ; ce raccordement manque dans le parcours inspecté.

## Intentions ultérieures

Les améliorations de confort (miniatures, panneaux simultanés) attendent la fiabilité du parcours principal. La synchronisation cloud et le chat réellement alimenté par le PDF demandent un cadrage sur les données, les autorisations et les coûts avant développement.

Electron n'est pas nécessaire à la PWA. Si son usage ou sa diffusion redevient demandé, la sécurisation précède cette diffusion et les changements sensibles conservent la règle historique des deux reviewers. L'absence de priorité produit ne vaut pas acceptation de sa configuration actuelle.

## Historique et sources conservés

- Ancien plan d'assainissement : [.team_sync/phases/phase0/IMPLEMENTATION_PLAN_2026-02-18.md](.team_sync/phases/phase0/IMPLEMENTATION_PLAN_2026-02-18.md).
- Anciennes décisions, dont la revue Electron : [.team_sync/phases/phase0/PHASE0_DECISIONS.md](.team_sync/phases/phase0/PHASE0_DECISIONS.md).
- Ancienne préparation des essais tablette : [.team_sync/phases/phase4/PHASE4B_XIAOMI_PAD6_VALIDATION.md](.team_sync/phases/phase4/PHASE4B_XIAOMI_PAD6_VALIDATION.md). Ses résultats théoriques ne remplacent pas un essai réel.

Aucune clôture des anciens chantiers n'est déduite de leurs cases cochées. Les faits de reprise et les commandes exécutées sont explicités dans [README.md](README.md) ; les mécanismes et lacunes observés dans [ARCHITECTURE.md](ARCHITECTURE.md).
