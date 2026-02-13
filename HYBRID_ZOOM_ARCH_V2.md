# ⚡ HYBRID ZOOM ARCHITECTURE V2 (High-Fidelity)

*Date : 11 Janvier 2026*

---

## 🛑 LE PROBLÈME DU PLAN V1
Le plan précédent couplait `scale` et `scroll` dans le debounce.
- **Faille Critique** : En "Pan" (déplacement simple), le scroll serait retardé de 150ms. L'utilisateur glisse le doigt, l'image bouge avec un lag. **Inacceptable.**
- **Objectif** : Pan = 0ms latence (Live). Zoom = Découplé (Live Visuel / Debounced Rendu).

---

## 1️⃣ LOGIQUE "SMART LOOP" & STATE MANAGEMENT

Nous devons distinguer les sources de vérité pour la Géométrie (ce qu'on voit) et la Qualité (ce qu'on calcule).

### Matrice d'État

| Action Utilisateur | Visual State (CSS) | Render Geometry (Position) | Render Quality (LOD) |
|--------------------|--------------------|----------------------------|----------------------|
| **Idle** | Stable | Live | Live |
| **Pan (Scroll)** | Live 60fps | **Live 60fps** (Pas de debounce) | Stable |
| **Zoom (Scale)** | Live 60fps | **Live 60fps** (Calcul coordonnées) | **Frozen / Debounced** |

> **Concept Clé : "Decoupled LOD Selection"**
> Le `TileManager` doit recevoir deux signaux distincts :
> 1.  **Où suis-je ?** (`visualScale`, `visualScroll`) → Pour déterminer les tuiles visibles (Culling).
> 2.  **Quelle netteté ?** (`debouncedScale`) → Pour choisir le niveau de LOD.

### Algorithme de Mise à Jour

```typescript
// PdfViewer.tsx

// 1. STATE
const [scale, setScale] = useState(1.0); // Visual Source
const [viewport, setViewport] = useState({ x: 0, y: 0 }); // Scroll Source

// 2. DERIVED RENDER STATE
// On ne debounce QUE l'échelle utilisée pour le choix du LOD
const renderLODScale = useDebounce(scale, 150);

// 3. PROPAGATION
// On passe TOUT au TileLayer. Il fera le tri.
<TileLayer
    visualState={{ scale, x: -viewport.x, y: -viewport.y }}
    renderQualityScale={renderLODScale}
    ...
/>
```

---

## 2️⃣ SYNCHRONISATION DES COUCHES (MATHS)

Le défi est d'aligner les tuiles (générées selon un LOD/Grid spécifique) avec le conteneur visuel qui subit une transformation CSS.

**Hypothèse : Utilisation du Scroll Natif Navigateur**
L'architecture actuelle utilise `overflow: auto` sur le conteneur principal.
- Le wrapper interne a une taille `width: PageWidth * visualScale`.
- Le wrapper interne a `transform: scale(visualScale)`.
- Les tuiles sont positionnées en `absolute top: Y world left: X world`.

**Validation Mathématique :**
- Position Écran = `(Position Monde * Scale CSS) - Scroll Nav`
- Si on change `visualScale` (Zoom) : Le wrapper grandit, le Scroll Nav s'ajuste (via `useZoom`), les tuiles s'éloignent les unes des autres visuellement.
- Si le `TileManager` continue de servir les tuiles basées sur `renderLODScale` (ex: 1.0) alors qu'on est à 2.0 :
    - Il génère les tuiles LOD 1 à leurs positions Monde natives.
    - Le CSS `scale(2.0)` les grossit x2.
    - **Alignement : PARFAIT**. Aucune matrice de compensation requise si l'architecture DOM est respectée.

**Le Risque "Zoom Out" (Gray Box Spam) :**
Si on dezoom (1.0 → 0.1) sans changer le LOD (restant à 1.0) :
- Le Viewport Monde devient immense (toute la page).
- Le `TileManager` va tenter de générer 1000 tuiles HD (LOD 1.0) pour couvrir ce viewport.
- **Solution** : Culling Hybride.
    - Si `visualScale < renderLODScale * 0.5` (Zoom Out violent), forcer le "Fallback Overview" et ne PAS charger les tuiles HD périphériques. Se contenter des tuiles déjà en cache (centre).

---

## 3️⃣ STRATÉGIE OVERVIEW TILE

Pour garantir "zéro gris" (Figma style) :

1.  **Z-Layer -1 (Fond)** :
    - Une tuile unique (ou 4 grosses tuiles) couvrant toute la page.
    - LOD fixe très bas : **0.125** ou **0.25**.
    - Rendu : Canvas basse résolution ou même `img` tag (blob URL) pour persistance maximale.
    - Gestion : Ne jamais la supprimer du cache tant que la page est visible.

2.  **Z-Layer 0 (Contenu)** :
    - Tuiles dynamiques gérées par `TileLayer`.
    - Transparence : Aucune. Elles couvrent l'overview.

---

## 🚀 PLAN D'IMPLÉMENTATION "NO COMPROMISE"

### Étape 1 : Refonte API `TileManager`

Séparer la logique de Culling de la logique de LOD.

```typescript
// utils/TileManager.ts

// AVANT : Tout mélangé
// getVisibleTiles(viewport, transform {x,y,scale})

// APRÈS : Découplé
getVisibleTiles(
    viewport: { w, h },           // Taille écran
    geometry: { x, y, scale },    // Pour calculer le rectangle Monde visible (visualScale)
    qualityScale: number          // Pour choisir le LOD (renderLODScale)
) {
    // 1. Calculer rect visible avec GEOMETRY (Live)
    const visibleWorldRect = {
        x: -geometry.x / geometry.scale,
        y: -geometry.y / geometry.scale,
        w: viewport.w / geometry.scale,
        h: viewport.h / geometry.scale
    };

    // 2. Choisir LOD avec QUALITY (Debounced)
    const lod = this.getLodForScale(qualityScale);

    // 3. Grid math
    // ... générer tuiles du LOD qui intersectent visibleWorldRect ...
}
```

### Étape 2 : Composant `OverviewLayer`

Créer un composant dédié léger pour le fond.

```tsx
// components/OverviewLayer.tsx
// Renders a single low-res tile for the whole page
return <canvas className="absolute inset-0 w-full h-full -z-10" ... />
```

### Étape 3 : Integration `PdfViewer`

Intégrer le loop découplé.

```typescript
// PdfViewer.tsx
const renderQualityScale = useDebounce(scale, 150);

// Forcer le re-calcul RAPIDE si on zoom out trop vite pour éviter le spam
const effectiveQualityScale = (scale < renderQualityScale * 0.6) 
    ? scale // Drop quality immediately on fast zoom out
    : renderQualityScale;
```

---

## ✅ CHECKLIST VALIDATION UX

1.  [ ] **Pan Test** : Scroll violent à la souris. L'image doit coller au curseur (0 lag).
2.  [ ] **Zoom In** : Molette avant. L'image devient floue (pixelisée) pendant le mouvement, puis nette après 150ms.
3.  [ ] **Zoom Out** : Molette arrière. On voit l'Overview (un peu flou) sur les bords instantanément. Pas de damier gris.
4.  [ ] **Stabilité** : Pas de crash "Unhandled Promise" grâce au throttle naturel des requêtes (1 req/sec vs 60/sec).
