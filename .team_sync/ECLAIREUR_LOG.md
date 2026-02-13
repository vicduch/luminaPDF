# ECLAIREUR_LOG - 2026-02-05

## 1. Arborescence Simplifiée
```text
.
├── components/          # Composants React (Toolbar, PdfViewer, AiPanel...)
├── hooks/               # Hooks personnalisés (useZoom, useVirtualizer...)
├── services/            # Services API (gemini, supabase, drive, storage)
├── utils/               # Logique métier (CoordinateSystem, ThemeManager...)
├── workers/             # pdf.worker.ts (Rendu PDF)
├── electron/            # Main process Electron
├── public/              # Assets statiques (sample.pdf)
├── src/                 # Dossier quasi vide (contient seulement un d.ts redondant)
├── .team_sync/          # Gouvernance et Logs
├── index.html           # Point d'entrée HTML
├── index.tsx            # Point d'entrée React (à la racine)
├── App.tsx              # Composant principal (à la racine)
├── types.ts             # Définitions de types globales (à la racine)
└── *.md                 # Documentation abondante à la racine (22 fichiers)
```

## 2. Fichiers Suspects
| Fichier | Statut | Raison |
| :--- | :--- | :--- |
| `nul` | **Critique** | Fichier système Windows invalide (probablement créé par erreur). |
| `components/ViewportPOC.tsx` | **Obsolète** | Preuve de concept non importée, remplacée par `PdfViewer`. |
| `src/vite-env.d.ts` | **Redondant** | Doublon de `vite-env.d.ts` à la racine (ce dernier est plus complet). |
| `index.css` | **Manquant** | Référencé dans `index.html` mais inexistant sur le disque. |
| `metadata.json` | **Douteux** | Usage non identifié dans le code source actuel. |

## 3. État des Dépendances
- **Cohérence :** 100% des dépendances de `package.json` sont importées.
- **Incohérences de chargement :**
  - `pdfjs-dist` : Chargé via CDN (unpkg) dans `App.tsx` ET importé localement dans `pdf.worker.ts`.
  - `react`, `lucide-react`, etc. : Présents dans `importmap` (CDN) dans `index.html` ET installés via `npm`.
- **Dépendances inutilisées :** Aucune.

## 4. Observations
- Structure non-standard : Les fichiers sources sont à la racine plutôt que dans `src/`.
- Styles : Tailwind est chargé via CDN, ce qui explique l'absence de fichier de config local.
