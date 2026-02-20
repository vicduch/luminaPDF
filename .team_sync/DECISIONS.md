# DECISIONS.md

## Historique des décisions

| Date | Sujet | Décision | Validé par |
|------|-------|----------|------------|
| 2026-02-05 | Framework | Adoption de AGENT_FRAMEWORK_RECOVERY | Utilisateur |
| 2026-02-05 | Refactoring | Validation du plan "Operation Clean Slate" (Migration src/ + Nettoyage) | Utilisateur |
| 2026-02-05 | Engine | Sprint 3.0 : Correction de la violation des Hooks et purge des logs de debug | PM |
| 2026-02-19 | Rendu | DPR-based quality : garder `<Page width>` constant, varier `devicePixelRatio` pour éviter le remontage Canvas | PM + Utilisateur |
| 2026-02-19 | Performance | 120fps gesture rendering : manipulation DOM directe pendant les gestes, sync React en fin de geste | PM |
| 2026-02-19 | Dépendances | Upgrade `pdfjs-dist` 4.8.69 → 5.4.296 pour aligner avec `react-pdf@10.2.0` | PM |
| 2026-02-19 | Navigation | Ajout `onItemClick` sur `<Document>` pour gérer les liens internes avec virtualisation | PM |

## Décisions en attente

| Sujet | Options | En attente de |
|-------|---------|---------------|
| — | — | — |
