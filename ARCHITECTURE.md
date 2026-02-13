# 🏗️ LuminaPDF - Architecture & Workspace

## 📂 Structure du Workspace

```
luminapdf/
├── src/                        # Dossier source principal
│   ├── index.tsx               # Point d'entrée React
│   ├── components/             # Composants UI & Moteur Rendu
│   │   ├── PdfViewer.tsx       # 🧠 CERVEAU : Orchestrateur Scroll/Zoom
│   │   ├── TileLayer.tsx       # 🧱 GESTIONNAIRE : Grille de tuiles
│   │   ├── PDFTile.tsx         # 🖼️ UNITÉ : Canvas individuel
│   │   ├── OverviewLayer.tsx   # 🌫️ FOND : Image basse résolution (sécurité)
│   │   ├── Toolbar.tsx         # UI : Contrôles (Zoom, Thèmes)
│   │   └── ... (AiPanel, etc.)
│   ├── utils/                  # Logique Métier & Maths
│   │   ├── TileManager.ts      # 📐 MATHS : Calcul géométrie tuiles
│   │   ├── RenderPool.ts       # 🧵 THREADS : Gestionnaire Web Workers
│   │   ├── CoordinateSystem.ts # 🌐 SYSTÈME : Conversions Screen ↔ World
│   │   ├── ThemeManager.ts     # 🎨 PALETTES : Définitions Couleurs/Thèmes
│   │   └── pdfRenderUtils.ts   # PDF.js helpers
│   ├── hooks/                  # Custom Hooks (Logique d'État)
│   │   ├── useZoom.ts          # 🔍 Logique Zoom (Molette/Boutons)
│   │   ├── useDebounce.ts      # ⏱️ Stabilisation des valeurs
│   │   └── ... (Mobile gestures)
│   ├── workers/                # Code Isolé (Off-Main-Thread)
│   │   └── pdf.worker.ts       # ⚙️ MOTEUR : Rendu + Colorisation
│   ├── services/               # Services Externes
│   │   ├── storage.ts          # Persistance (localStorage)
│   │   └── ... (Google Drive, AI)
│   └── types.ts                # Définitions TypeScript globales
├── electron/                   # Main process Electron
├── public/                     # Assets statiques (sample.pdf)
└── ... (Config Vite, TS, etc.)
```

## 🧠 Rôles & Responsabilités

### 1. Le Cerveau (`src/components/PdfViewer.tsx`)
- Point central de l'application.
- Gère l'état global du document : `scale`, `scrollPosition`, `pageNumber`.
- Utilise un "Virtualizer" pour ne rendre que les pages visibles.
- Diffuse la **Géométrie Live** (pour le CSS) et la **Qualité Debounced** (pour le chargement) aux enfants.

### 2. Le Maçon (`src/components/TileLayer.tsx`)
- Reçoit la géométrie et le numéro de page.
- Interroge `TileManager` : *"Quelles tuiles sont visibles ici ?"*
- Gère le cycle de vie des tuiles : Montage, Démontage, Mise en cache.
- Instancie les composants `PDFTile`.

### 3. L'Usine (`src/utils/RenderPool.ts` & `src/workers/`)
- Maintient un pool de N Workers (adapté au CPU).
- Dispatch les jobs de rendu (`renderTile`) vers le worker le moins chargé.
- Gère l'annulation des jobs obsolètes (quand on scrolle vite).

### 4. Le Peintre (`src/utils/ThemeManager.ts`)
- Fournit les palettes de couleurs exactes pour chaque thème.
- Ces palettes sont envoyées aux Workers pour que les pixels soient colorés *avant* d'arriver au thread principal.

## 🔄 Flux de Données (Data Flow)

```mermaid
graph TD
    User[Utilisateur] -->|Scroll / Zoom| Viewer[PdfViewer.tsx]
    Viewer -->|Geometry (60fps)| TileLayer[TileLayer.tsx]
    Viewer -->|Quality (Debounced)| TileLayer
    
    TileLayer -->|Get Visible| Manager[TileManager.ts]
    Manager -->|Tile Specs| TileLayer
    
    TileLayer -->|Props| Tile[PDFTile.tsx]
    Tile -->|Job Request| Pool[RenderPool.ts]
    
    Pool -->|PostMessage| Worker[pdf.worker.ts]
    
    subgraph Worker Thread
    Worker -->|PDF.js Render| Raw[Canvas Raw]
    Raw -->|Recolorize Pixel| Colored[ImageBitmap Final]
    end
    
    Worker -->|Transfer| Tile
    Tile -->|Draw| Canvas[Écran]
```

## 🧩 Concepts Clés
- **World Space** : Coordonnées virtuelles stables du document PDF.
- **Screen Space** : Coordonnées pixels réelles dans la fenêtre navigateur.
- **LOD (Level of Detail)** : Facteur de zoom discret (ex: 1.0, 1.5, 2.0) déterminant la netteté.