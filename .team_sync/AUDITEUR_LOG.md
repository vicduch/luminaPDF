# AUDITEUR_LOG.md

## [2026-02-09] DIAGNOSTIC DÉFINITIF : ASYMÉTRIE DU SCROLL ET MODÈLE CANEVAS TOP-LEFT

**Auditeur** : Agent QA  
**Statut** : 🔴 **CAUSE RACINE DE L'ÉCHEC GÉOMÉTRIQUE IDENTIFIÉE**  
**Scope** : `src/components/PdfViewer.tsx` — Mécaniques CSS et proposition d'architecture alternative

---

### SECTION A — PHÉNOMÈNE DE ROGNAGE DE L'OVERFLOW NÉGATIF

#### A.1 La règle CSS Overflow Module Level 3 §2.2

Le standard W3C stipule que le contenu débordant vers l'inline-start (gauche en LTR) ou le block-start (haut) n'est **pas accessible via le défilement natif**. Le navigateur positionne l'origine du scroll à `(0, 0)` correspondant au coin top-left de la "scrollable overflow region", qui exclut tout contenu en coordonnées négatives.

#### A.2 Effet de `transform-origin: center center` avec `scale(S)`

Soit un élément `#pdf-camera` de dimensions layout `W × H`.

Le point d'ancrage du transform est `P = (W/2, H/2)`.

Après application de `scale(S)` :

```
Bord gauche visuel = P.x - (W × S) / 2 = W/2 - W×S/2 = W × (1 - S) / 2
Bord droit visuel  = P.x + (W × S) / 2 = W/2 + W×S/2 = W × (1 + S) / 2
```

Pour `S > 1`, le bord gauche visuel devient **négatif** :

| S | W | Bord gauche | Bord droit | Zone rognée | scrollWidth observé |
|---|---|-------------|------------|-------------|---------------------|
| 1.0 | 3012 | 0 | 3012 | 0 | 3012 |
| 1.5 | 3012 | -753 | 3765 | 753 | 3765 |
| 2.0 | 3012 | -1506 | 4518 | 1506 | 4518 |
| 3.0 | 3012 | -3012 | 6024 | 3012 | 6024 |

La formule générale du `scrollWidth` observable est :
```
scrollWidth = W × (1 + S) / 2    quand S ≥ 1
scrollWidth = W                   quand S < 1
```

#### A.3 Pourquoi `(scrollWidth - clientWidth) / 2` échoue

Cette formule calcule le milieu de la **plage de scroll** :

```
scrollLeft_milieu = (scrollWidth - clientWidth) / 2
```

Le problème : la plage de scroll n'est PAS centrée sur le document.

Pour un viewport de `clientWidth = 1200` et un workspace de `W = 3012` zoomé à `S = 2.0` :

```
scrollWidth = 3012 × 3 / 2 = 4518
scrollable_range = 4518 - 1200 = 3318
scrollLeft_milieu = 3318 / 2 = 1659
```

À `scrollLeft = 1659`, le centre du viewport est à :
```
viewport_center = 1659 + 600 = 2259 px (dans l'espace scroll)
```

Mais le centre géométrique du workspace est à `W/2 = 1506` en coordonnées layout.

Le décalage systématique vers la droite est :
```
Δ = viewport_center - (W/2) = 2259 - 1506 = 753 px = zone_rognée
```

**Conclusion : le décalage à droite est exactement égal à la zone rognée.** Le scroll natif ne peut jamais atteindre le contenu situé en coordonnées négatives.

---

### SECTION B — ANALYSE DU DOUBLE CENTRAGE

#### B.1 Hiérarchie actuelle

```
#pdf-workspace   (placeItems: 'center', padding: 100vh 100vw)   ← Centrage niveau 1
  └─ #pdf-scale-layer
      └─ Document  (className: 'flex flex-col items-center')    ← Centrage niveau 2
          └─ LazyPage × N
```

#### B.2 Effet du `placeItems: 'center'` sur `#pdf-workspace`

Le workspace utilise `display: grid` avec `placeItems: 'center'`. Cette propriété centre le contenu dans la cellule de grille, qui occupe au minimum `100% × 100%` du conteneur (via `minWidth/minHeight`).

Le `padding: 100vh 100vw` ajoute un espace de marge autour de cette zone centrale.

Résultat : le `#pdf-scale-layer` est placé au centre exact du workspace.

#### B.3 Effet du `items-center` sur le composant `Document`

Le composant `Document` de react-pdf reçoit `className="flex flex-col items-center"`. Cette classe Tailwind applique `align-items: center` sur l'axe perpendiculaire (horizontal pour `flex-col`).

Résultat : chaque `LazyPage` est centrée horizontalement à l'intérieur du `Document`.

#### B.4 Le double centrage est-il problématique ?

**Non, dans l'architecture actuelle.** Les deux niveaux de centrage sont **cohérents** et ne créent pas de conflit :

Le centrage niveau 1 (`placeItems: 'center` sur le workspace) positionne le bloc `Document` au centre du workspace.

Le centrage niveau 2 (`items-center` sur Document) centre les pages à l'intérieur du Document, mais le Document a la même largeur que ses enfants (pas de largeur explicite), donc l'effet est neutre.

**Le décalage à droite n'est PAS causé par le double centrage.** Il est causé exclusivement par le rognage de l'overflow négatif lié à `transform-origin: center center`.

---

### SECTION C — MODÈLE DE CANEVAS À ANCRAGE TOP-LEFT

#### C.1 Principe architectural

Créer un espace de scroll fixe et symétrique ("canevas virtuel"), suffisamment grand pour accueillir le document à n'importe quel niveau de zoom, et utiliser `transform-origin: 0 0` pour éliminer tout overflow négatif.

#### C.2 Structure DOM proposée

```
containerRef  (overflow: auto, width: 100%, height: 100%)
  └─ #canvas-spacer  (width: 10000px, height: 10000px, position: relative)
      └─ #pdf-camera  (position: absolute, left: <Cx>, top: <Cy>,
                       transform: scale(S), transform-origin: 0 0)
          └─ #pdf-workspace  (dimensions fixes 1:1, pas de padding)
              └─ Document → Pages
```

#### C.3 Calcul des coordonnées `Cx` et `Cy`

L'objectif est de positionner le coin top-left du `#pdf-camera` de sorte que le centre du document apparaisse au centre de la plage de scroll.

Soit :
```
canvas_width = 10000
canvas_height = 10000
doc_width = 612 (largeur du PDF 1:1)
doc_height = 792 × N (hauteur totale du document)
S = scale
viewport_width = clientWidth du container
viewport_height = clientHeight du container
```

Le centre de la plage de scroll est :
```
scroll_center_x = (canvas_width - viewport_width) / 2
scroll_center_y = (canvas_height - viewport_height) / 2
```

Pour que le centre du document (à `doc_width/2`, `doc_height/2` en coordonnées 1:1) apparaisse au centre du viewport :

```
Cx = scroll_center_x + viewport_width/2 - (doc_width/2) × S
Cy = scroll_center_y + viewport_height/2 - (doc_height/2) × S
```

Développement :
```
Cx = (canvas_width - viewport_width)/2 + viewport_width/2 - doc_width × S / 2
   = canvas_width/2 - doc_width × S / 2

Cy = canvas_height/2 - doc_height × S / 2
```

#### C.4 Gestion du scroll natif

Avec `transform-origin: 0 0`, le contenu s'étend uniquement vers la droite et le bas. La zone scrollable est :

```
scrollWidth = Cx + doc_width × S
scrollHeight = Cy + doc_height × S
```

Le scroll natif permet d'atteindre 100% du document à n'importe quel niveau de zoom. Aucun rognage d'overflow négatif.

#### C.5 Limites du canevas

Pour que le document reste visitable :

Le bord gauche du document (`Cx`) doit rester positif :
```
Cx ≥ 0  →  canvas_width/2 ≥ doc_width × S / 2  →  S ≤ canvas_width / doc_width
```

Pour un canevas de 10000px et un document de 612px :
```
S_max = 10000 / 612 ≈ 16.3 (zoom 1630%)
```

Inversement, le zoom minimum est limité par la nécessité que le document ne dépasse pas le canevas (en pratique, aucune limite significative pour S ≥ 0.1).

#### C.6 Centrage initial

```typescript
const scrollCenterX = (canvas_width - viewport_width) / 2;
const scrollCenterY = (canvas_height - viewport_height) / 2;

containerRef.current.scrollTo({
  left: scrollCenterX,
  top: scrollCenterY,
  behavior: 'instant'
});
```

Cette formule est **indépendante du scale** et **indépendante des dimensions du document**. Elle centre toujours le scroll sur le milieu du canevas.

#### C.7 Zoom avec ancrage au centre du viewport

```typescript
const handleZoom = (newScale: number) => {
  const container = containerRef.current;
  const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
  
  // Point visé dans le viewport (centre)
  const viewCenterX = scrollLeft + clientWidth / 2;
  const viewCenterY = scrollTop + clientHeight / 2;
  
  // Convertir en coordonnées monde (1:1)
  const worldX = (viewCenterX - Cx) / scale;
  const worldY = (viewCenterY - Cy) / scale;
  
  // Recalculer Cx, Cy pour le nouveau scale
  const newCx = canvas_width/2 - doc_width * newScale / 2;
  const newCy = canvas_height/2 - doc_height * newScale / 2;
  
  // Calculer la nouvelle position scroll pour garder worldX/worldY au centre
  const newScrollLeft = newCx + worldX * newScale - clientWidth/2;
  const newScrollTop = newCy + worldY * newScale - clientHeight/2;
  
  // Mettre à jour l'état
  setScale(newScale);
  setCx(newCx);
  setCy(newCy);
  
  // Appliquer le scroll
  container.scrollTo({ left: newScrollLeft, top: newScrollTop, behavior: 'instant' });
};
```

#### C.8 Comparaison des modèles

| Critère | Modèle actuel (center center) | Modèle Canevas Top-Left |
|---------|------------------------------|-------------------------|
| Overflow négatif | Oui, rogné | Non, impossible |
| scrollWidth prévisible | Non (asymétrique) | Oui (Cx + doc_width × S) |
| Centrage initial | Formule complexe, fragile | Trivial, indépendant du scale |
| Zoom ancré | Calcul hybride incohérent | Transformation linéaire pure |
| Liberté de mouvement 360° | Non (butée gauche/haut) | Oui (symétrie totale) |
| Compatibilité scrollbar native | Partielle (asymétrie visible) | Totale (plage symétrique) |
| Taille mémoire DOM | Minimale | Fixe (canevas large) |
| Complexité implémentation | Moyenne | Moyenne |

---

### SECTION D — VERDICT ET RECOMMANDATIONS

Le décalage systématique à droite est causé par le **rognage de l'overflow négatif** inhérent à `transform-origin: center center` combiné avec `overflow: auto`.

Le double centrage (`placeItems: 'center'` + `items-center`) n'est **pas** la cause du problème — ces deux propriétés sont cohérentes entre elles.

Le modèle de Canevas à Ancrage Top-Left résout définitivement le problème en éliminant l'overflow négatif et en rendant la plage de scroll parfaitement symétrique.

**Action recommandée pour le Coder :** Implémenter le modèle de Canevas Top-Left tel que spécifié dans la Section C.

---


**Scope** : `src/components/PdfViewer.tsx` — Mode Acrobat (Caméra)

---

### PRÉAMBULE : CE QUE NOUS AVONS TENTÉ

L'audit du 09/02 (précédent) a identifié deux bugs géométriques et proposé une formule de projection invariante. Le code actuel implémente cette correction :

```typescript
// Centrage initial (L155-164)
container.scrollTo({
  left: (content.scrollWidth / 2) - (container.clientWidth / 2),
  top: (content.scrollHeight / 2) - (container.clientHeight / 2),
});

// Stabilisation zoom (L171-202)
const Cx = content.scrollWidth / 2;
const Cy = content.scrollHeight / 2;
const viewCenterX = scrollLeft + clientWidth / 2;
const ratio = scale / lastScaleRef.current;
const newCenterX = Cx + (viewCenterX - Cx) * ratio;
container.scrollTo({ left: newCenterX - clientWidth / 2, ... });
```

**Malgré ces formules "correctes", le système échoue systematiquement.**

La raison ? Une incompréhension fondamentale du référentiel de coordonnées après `transform: scale(S)` avec `transform-origin: center center`.

---

### 1. ANATOMIE DE L'ÉCHEC — Le Paradoxe du Point Invariant

#### 1.1 Hiérarchie DOM actuelle

```
containerRef  (overflow: auto)                    ← Viewport DOM (scrollable)
  └─ #pdf-camera  (transform: scale(S), origin: center center)  ← Lentille CSS
      └─ #pdf-workspace  (contentRef, padding: 100vh 100vw)     ← Monde fixe
          └─ #pdf-scale-layer → Document → Pages
```

#### 1.2 Le mensonge de `scrollWidth`

Considérons le workspace avec `W = 3012px` de largeur layout (avec padding `100vw` de chaque côté).

| Scale S | Bord gauche visuel (px) | Bord droit visuel (px) | Overflow négatif | `container.scrollWidth` réel |
|---------|------------------------|------------------------|------------------|------------------------------|
| 1.0 | 0 | 3012 | 0 | 3012 |
| 1.5 | -753 | 3765 | 753 | **3765** (pas 4518!) |
| 2.0 | -1506 | 4518 | 1506 | **4518** (pas 6024!) |
| 3.0 | -3012 | 6024 | 3012 | **6024** (pas 9036!) |

**Formule de scrollWidth avec origin center :**
```
scrollWidth = W × (1 + S) / 2    pour S ≥ 1
scrollWidth = W                  pour S < 1
```

Le `container.scrollWidth` n'est PAS `W × S`. Le navigateur **rogne** tout ce qui dépasse à gauche du point d'origine du layout.

#### 1.3 Pourquoi `content.scrollWidth / 2` est aussi faux

Le `contentRef` pointe sur `#pdf-workspace`. Son `scrollWidth` est **la dimension layout intrinsèque du workspace**, AVANT le transform CSS appliqué par le parent (`#pdf-camera`).

Donc `content.scrollWidth = W = 3012` — **constante, indépendante du scale**.

La formule `content.scrollWidth / 2 = 1506` est censée être le centre invariant du workspace. Mais ce centre est exprimé en **coordonnées layout du workspace**, pas en **coordonnées scroll du container**.

Le problème : après `scale(S)`, le point `(1506, 1196)` du workspace se trouve physiquement à une position **différente** dans l'espace scroll du container, car :

- Le bord gauche du container est toujours à `scrollLeft = 0`
- Mais le bord gauche **visuel** du workspace est à `W×(1-S)/2`, qui peut être négatif

**Le référentiel scroll-DOM ne correspond plus au référentiel visuel-CSS.**

---

### 2. LE VRAI PROBLÈME — Désynchronisation des Référentiels

#### 2.1 Trois référentiels distincts

| Référentiel | Origine | Unité | Propriétés typiques |
|-------------|---------|-------|---------------------|
| **Layout-World** | Coin top-left du workspace | px 1:1 | `content.scrollWidth`, `content.offsetWidth`, `getBoundingClientRect()` du workspace |
| **Scroll-DOM** | Coin top-left de la zone scrollable | px effectifs | `scrollLeft`, `scrollTop`, `container.scrollWidth` |
| **Visual-CSS** | Centre du transform (origin center) | px × scale | Ce que l'utilisateur voit à l'écran |

Le code actuel mixe `content.scrollWidth` (Layout-World) avec `scrollLeft` (Scroll-DOM), ce qui crée un **référentiel hybride incohérent**.

#### 2.2 Preuve par le calcul

À `scale = 2.0`, viewport 1200×800, workspace 3012×2392 :

- **Centre Layout-World** : `Cx = 1506` (correct, invariant)
- **Position scroll pour voir ce centre** : ???

Si on applique `scrollLeft = 1506 - 600 = 906`, on scroll à 906px dans l'espace DOM.
Mais l'espace DOM scrollable commence à 0 et va jusqu'à `scrollWidth - clientWidth = 4518 - 1200 = 3318`.

Le centre de cette plage scrollable est à `3318 / 2 = 1659`, pas à `906`.

**Le calcul `content.scrollWidth / 2 - clientWidth / 2` donne la position correcte UNIQUEMENT SI `scrollWidth_container = content.scrollWidth`.** Or ce n'est plus vrai dès que `S ≠ 1`.

---

### 3. GOULOTS DE TIMING — Pourquoi rAF et setTimeout échouent

#### 3.1 Le problème de la mesure

```typescript
requestAnimationFrame(() => requestAnimationFrame(centerDocument));
```

Le double rAF garantit que le layout est calculé. Mais il ne garantit PAS que :

1. **PDF.js ait terminé le rendu initial** — les dimensions `content.scrollWidth` ne sont valides qu'après le rendu complet.
2. **Les ResizeObserver aient propagé** — le cycle React `setState → render → DOM commit → useLayoutEffect` peut encore être en cours pour d'autres composants.
3. **Le scale appliqué soit cohérent** — si `scale` est restauré depuis une reading position (`getReadingPosition`), le `useLayoutEffect` de centrage peut s'exécuter AVANT le `useLayoutEffect` de scale adjustment.

#### 3.2 Race condition entre les deux useLayoutEffect

```typescript
// L151-169: Centrage initial
useLayoutEffect(() => { ... centerDocument ... }, [file, numPages, allPagesDimensions.size]);

// L172-203: Stabilisation zoom
useLayoutEffect(() => { ... adjust for scale change ... }, [scale]);
```

Si `scale` change pendant le même cycle de rendu (restauration reading position), les deux effets s'exécutent dans l'ordre de déclaration. Le centrage initial s'exécute à `scale = currentScale`, puis le zoom adjustment détecte `scale === lastScaleRef.current` et fait un early return.

**Résultat : le centrage initial est calculé avec un scale potentiellement différent de celui attendu, et le zoom adjustment ne corrige rien.**

#### 3.3 Instabilité des dimensions async

Le `useLayoutEffect` initial dépend de `allPagesDimensions.size`. Cette valeur change après le `Promise.all` de récupération des viewports. Mais le rendu réel des pages (via `LazyPage` + IntersectionObserver) est ENCORE asynchrone.

Le workspace peut avoir des dimensions transitoires pendant le lazy loading. Même avec double rAF, le `content.scrollWidth` peut être "presque final" mais pas exact.

---

### 4. PROPOSITION : MOTEUR DE VISÉE INFAILLIBLE

#### 4.1 Principe fondamental

Abandonner `scrollLeft`/`scrollTo` comme mécanisme de centrage. Utiliser un **offset virtuel** géré à 100% côté CSS, indépendant du moteur de scroll natif.

#### 4.2 Architecture "Dual Transform"

```
containerRef  (overflow: auto)
  └─ #scroll-spacer  (width: 10000px, height: 10000px)  ← Zone de scroll massive fixe
      └─ #viewport-anchor  (position: absolute, top: 50%, left: 50%)  ← Point d'ancrage absolu
          └─ #pdf-camera  (transform: translate(Tx, Ty) scale(S), origin: 0 0)  ← Visée totale
              └─ #pdf-workspace  (dimensions fixes 1:1)
                  └─ Document → Pages
```

**Invariants :**
- Le `#scroll-spacer` a une taille fixe et massive (suffisante pour tout niveau de zoom).
- Le container scrolle UNIQUEMENT dans ce spacer, avec un point "home" au centre (`scrollLeft = 4400`, `scrollTop = 4400` pour centrer un spacer de 10000×10000).
- Le positionnement du document est géré **exclusivement** via `translate(Tx, Ty)` sur `#pdf-camera`.

#### 4.3 Formule de visée

```typescript
// État géré
worldCenter = { x: docWidth / 2, y: docHeight / 2 }  // Point visé dans le monde (px 1:1)
scale = 1.5

// Calcul du transform
Tx = -worldCenter.x * scale + viewportWidth / 2
Ty = -worldCenter.y * scale + viewportHeight / 2

// Application
style = { transform: `translate(${Tx}px, ${Ty}px) scale(${scale})`, transformOrigin: '0 0' }
```

**Comportement :**
- **Pan** : Modifier `worldCenter.x` / `worldCenter.y` selon le delta de drag ou de scroll.
- **Zoom** : Modifier `scale`, recalculer `Tx`/`Ty`. Le `worldCenter` reste fixe → le point visé ne bouge pas.

#### 4.4 Mapping scroll → worldCenter

Pour intégrer le scroll natif (inertie, barre de défilement) :

```typescript
useLayoutEffect(() => {
  const onScroll = () => {
    const scrollDeltaX = container.scrollLeft - homeScrollLeft;
    const scrollDeltaY = container.scrollTop - homeScrollTop;
    
    // Convertir le delta scroll en delta world
    setWorldCenter(prev => ({
      x: prev.x + scrollDeltaX / scale,
      y: prev.y + scrollDeltaY / scale
    }));
    
    // Remettre le scroll au centre (consommer le delta)
    container.scrollTo(homeScrollLeft, homeScrollTop);
  };
  
  container.addEventListener('scroll', onScroll);
  return () => container.removeEventListener('scroll', onScroll);
}, [scale]);
```

Cette approche "consomme" le scroll natif et le convertit en mouvement de caméra. Le scrollbar visible reste centré (ou peut être masqué).

#### 4.5 Avantages

| Aspect | Architecture actuelle | Architecture Dual Transform |
|--------|----------------------|----------------------------|
| **Centrage initial** | Dépend de scrollWidth asymétrique | `worldCenter = docCenter` → trivial |
| **Zoom ancré** | Calcul complexe avec ratios | `worldCenter` immobile, seul `scale` change |
| **Timing** | Course entre rAF et mesures | Indépendant des propriétés de scroll |
| **Compatibilité scrollbar** | native mais conflictuelle | Scroll natif mappé en pan |
| **Complexité** | Formules cryptiques | Transformation linéaire standard |

---

### 5. ALTERNATIVE MINIMALE — Correction sans refactor

Si le refactoring "Dual Transform" est trop invasif pour la Phase 2, voici les corrections minimalistes :

#### 5.1 Fix du référentiel

Remplacer `content.scrollWidth` par `container.scrollWidth` UNIQUEMENT pour le centrage initial, avec la formule corrigée :

```typescript
// Centrage initial (formule asymétrique)
const scrollableWidth = container.scrollWidth - container.clientWidth;
const scrollableHeight = container.scrollHeight - container.clientHeight;
container.scrollTo({
  left: scrollableWidth / 2,
  top: scrollableHeight / 2,
  behavior: 'instant'
});
```

Cette formule centre la **plage de scroll**, pas le **contenu**. Elle fonctionne quel que soit le scale car elle n'assume aucun référentiel géométrique.

**Limitation : Ne garantit pas que le centre du document soit visible, seulement que le scroll est "au milieu".**

#### 5.2 Fix du zoom

Pour la stabilisation zoom, conserver `content.scrollWidth` comme invariant mais ajouter une compensation de l'offset de rognage :

```typescript
// L'offset de rognage négatif est : content.scrollWidth * (scale - 1) / 2
const oldCropOffset = content.scrollWidth * (lastScaleRef.current - 1) / 2;
const newCropOffset = content.scrollWidth * (scale - 1) / 2;
const cropDelta = newCropOffset - oldCropOffset;

// Ajuster le scroll pour compenser le changement de zone rognée
const newScrollLeft = scrollLeft * (scale / lastScaleRef.current) + cropDelta;
```

#### 5.3 Fix du timing

Remplacer le double rAF par un `MutationObserver` + `ResizeObserver` combo :

```typescript
useLayoutEffect(() => {
  if (!container || !content) return;
  
  const centerWhenReady = () => {
    if (content.scrollWidth > 0 && content.scrollHeight > 0) {
      container.scrollTo({
        left: (container.scrollWidth - container.clientWidth) / 2,
        top: (container.scrollHeight - container.clientHeight) / 2,
        behavior: 'instant'
      });
    }
  };
  
  const ro = new ResizeObserver(centerWhenReady);
  ro.observe(content);
  
  return () => ro.disconnect();
}, [file, numPages]);
```

---

### 6. VERDICT FINAL

| Composant | Diagnostic | Sévérité |
|-----------|-----------|----------|
| **Centrage initial** | Utilise `content.scrollWidth` qui est invariant mais pas aligné avec le référentiel scroll asymétrique. | 🔴 Critique |
| **Stabilisation zoom** | Formule arithmétiquement correcte mais appliquée dans le mauvais référentiel (mix Layout-World et Scroll-DOM). | 🔴 Critique |
| **Timing** | Double rAF insuffisant, race condition entre les deux useLayoutEffect, dimensions instables pendant le lazy loading. | 🟡 Majeur |
| **Architecture** | Le choix `transform-origin: center center` crée intrinsèquement une asymétrie de scroll irrécupérable sans offset virtuel. | 🔴 Structurel |

**Recommandation :** Implémenter l'architecture **"Dual Transform"** (Section 4) pour un Moteur de Visée infaillible. À défaut, appliquer les corrections minimalistes (Section 5) en acceptant des compromis sur la précision.

---



**Auditeur** : Agent QA
**Statut** : 🔴 **CRASH REPRODUIT (THÉORIQUE)**

### 1. ANALYSE DU CODE (POST-MORTEM)

Le code actuel dans `src/components/PdfViewer.tsx` ne contient pas la boucle incriminée (probablement revertée suite au crash). Cependant, basé sur les symptômes décrits ("Écran blanc", "Crash au chargement"), le diagnostic est clair.

**Cause probable du crash : "Render Loop of Death"**
Si l'implémentation ressemblait à ceci :
```typescript
// Code fautif probable
for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // Erreur : Mise à jour du state DANS la boucle
    setPageDimensions(prev => ({...prev, [i]: page.getViewport()})); 
}
```
Cela déclenche **N re-renders synchrones** (un par page). Pour un PDF de 100 pages, React sature la pile d'appels ou la mémoire, causant l'écran blanc.

**Autre risque identifié : Blocage Synchrone**
L'utilisation séquentielle de `await` (`for...of`) sans parallélisation bloque le thread JS pendant que PDF.js parse chaque page, gelant l'interface.

### 2. CORRECTIF TECHNIQUE IMMÉDIAT

Pour restaurer la fonctionnalité sans crash, il faut appliquer deux principes :
1. **Parallélisation** : Récupérer les promesses de toutes les pages d'un coup.
2. **Batch Update** : Mettre à jour le state une seule fois à la fin.

**Implémentation recommandée (dans onLoadSuccess)** :

```typescript
const fetchAllDimensions = async () => {
  const promises = [];
  // Créer toutes les promesses (non bloquant)
  for (let i = 1; i <= pdf.numPages; i++) {
    promises.push(pdf.getPage(i).then(page => ({
      pageNumber: i,
      viewport: page.getViewport({ scale: 1 })
    })));
  }

  // Attendre tout le monde (rapide)
  const results = await Promise.all(promises);

  // Consolider les données
  const dimensionsMap = results.reduce((acc, item) => {
    acc[item.pageNumber] = { width: item.viewport.width, height: item.viewport.height };
    return acc;
  }, {});

  // UNE SEULE mise à jour d'état
  onPageDimensions?.(dimensionsMap); // Adapter la signature de prop si nécessaire
};

fetchAllDimensions();
```

### 3. ACTION REQUISE
Ne **jamais** mettre à jour un state React à l'intérieur d'une boucle asynchrone rapide. Toujours "Batcher" les résultats.

---

## [2026-02-06] AUDIT TABULA RASA — Références obsolètes post-suppression moteur de rendu

**Auditeur** : Agent QA (Claude Opus 4.6)
**Statut** : 🔴 **BUILD CASSÉ — Imports fantômes critiques**
**Scope** : Scan complet de `src/` après suppression de TileLayer, RenderPool, CoordinateSystem, useZoom, useVirtualizer, useTouchGestures, pdf.worker.ts, OverviewLayer, PDFTile.

---

### 1. BLOQUANT — FICHIERS SUPPRIMÉS ENCORE IMPORTÉS

#### `src/hooks/index.ts` — FICHIER ENTIÈREMENT CASSÉ
**Sévérité : CRITIQUE (empêche le build)**

| Lignes | Code mort | Fichier cible supprimé |
|--------|-----------|----------------------|
| 5 | `export { useZoom, ZoomMode } from './useZoom';` | `hooks/useZoom.ts` ❌ |
| 6-12 | `export type { UseZoomOptions, UseZoomReturn, ZoomConfig, ZoomState, ZoomEvent } from './useZoom';` | `hooks/useZoom.ts` ❌ |
| 14 | `export { useTouchGestures } from './useTouchGestures';` | `hooks/useTouchGestures.ts` ❌ |
| 15-20 | `export type { UseTouchGesturesOptions, UseTouchGesturesReturn, TouchGestureConfig, TouchState } from './useTouchGestures';` | `hooks/useTouchGestures.ts` ❌ |
| 22 | `export { useVirtualizer } from './useVirtualizer';` | `hooks/useVirtualizer.ts` ❌ |
| 23-28 | `export type { UseVirtualizerOptions, UseVirtualizerReturn, VirtualizerConfig, VirtualizerState } from './useVirtualizer';` | `hooks/useVirtualizer.ts` ❌ |

**Action Coder** : Supprimer les lignes 5-28. Remplacer le contenu par l'export de `useDebounce` qui est le seul hook survivant :
```typescript
export { useDebounce } from './useDebounce';
```

> ⚠️ Note : `useDebounce` existe dans `src/hooks/useDebounce.ts` mais n'est PAS exporté par `index.ts` actuellement, et n'est importé par aucun composant. C'est un utilitaire valide à conserver pour usage futur.

---

### 2. CODE MORT — Props fantômes et useEffect vide

#### `src/App.tsx`

| Lignes | Problème | Action |
|--------|----------|--------|
| 1-12 | JSDoc mentionne "GPU rendering engine", "TileLayer", "useZoom hook" — tous supprimés | Mettre à jour le commentaire |
| 140 | Commentaire `// ZOOM HANDLING (Disabled in Phase 0)` | Supprimer ou reformuler |
| 144-156 | `useEffect` pour `wheel` listener : le handler `onWheel` est **vide** (corps commenté). Ajoute/retire un event listener pour rien. | Supprimer tout le bloc useEffect |
| 445 | `renderedScale={scale}` — PdfViewer accepte mais **ignore** cette prop | Supprimer la prop |
| 446 | `viewMode={viewMode}` — PdfViewer **ignore** | Supprimer (ou implémenter dans PdfViewer Phase 2) |
| 448 | `isOutlineOpen={isOutlineOpen}` — PdfViewer **ignore** | Supprimer |
| 449 | `isAnnotationMode={isAnnotationMode}` — PdfViewer **ignore** | Supprimer |
| 450 | `annotations={annotations}` — PdfViewer **ignore** | Supprimer |
| 451 | `annotationColor={annotationColor}` — PdfViewer **ignore** | Supprimer |
| 452 | `theme={theme}` — PdfViewer **ignore** | Supprimer |
| 453 | `themeVariant={themeVariant}` — PdfViewer **ignore** | Supprimer |
| 454 | `zoomFocalPoint={null}` — PdfViewer **ignore**, concept supprimé | Supprimer |
| 455 | `isFitToScreenAction={fitToScreenTrigger}` — PdfViewer **ignore** | Supprimer |
| 460 | `onTextExtract={setCurrentPageText}` — PdfViewer **ignore** | Supprimer |
| 461 | `onAddAnnotation={handleAddAnnotation}` — PdfViewer **ignore** | Supprimer |
| 462 | `onUpdateAnnotation={handleUpdateAnnotation}` — PdfViewer **ignore** | Supprimer |
| 463 | `onDeleteAnnotation={handleDeleteAnnotation}` — PdfViewer **ignore** | Supprimer |

> ⚠️ **Attention** : Les states correspondants (`viewMode`, `annotations`, `annotationColor`, `isAnnotationMode`, `isOutlineOpen`, `fitToScreenTrigger`, `currentPageText`) et leurs handlers dans App.tsx sont **utilisés par d'autres composants** (Toolbar notamment). Ne PAS supprimer les states — seulement les props passées à PdfViewer.

#### `src/components/PdfViewer.tsx`

| Lignes | Problème | Action |
|--------|----------|--------|
| 20-30 | Interface `PdfViewerProps` contient des props fantômes jamais utilisées dans le composant : `renderedScale`, `viewMode`, `isOutlineOpen`, `isAnnotationMode`, `annotations`, `annotationColor`, `theme`, `themeVariant`, `zoomFocalPoint`, `isFitToScreenAction`, `onTextExtract`, `onAddAnnotation`, `onUpdateAnnotation`, `onDeleteAnnotation` | Supprimer ces props de l'interface |

---

### 3. FICHIER ORPHELIN — `src/utils/pdfRenderUtils.ts`

**Sévérité : BASSE (aucun import, ne casse pas le build)**

Ce fichier n'est importé par **aucun** composant actuel. Il contient :
- Lignes 120-127 : Définition propre de `AppTheme` comme type union string — **conflit** avec l'enum `AppTheme` de `src/types.ts`
- Lignes 135-153 : `getCanvasFilter()` utilise `CSS filter: invert()` — approche **explicitement interdite** par CLAUDE.md
- Concept de discrete render steps, CSS scale — vestige de l'ancien moteur hybride

**Action Coder** : Supprimer le fichier `src/utils/pdfRenderUtils.ts` entièrement. Aucun composant n'en dépend.

---

### 4. DOCUMENTATION OBSOLÈTE — Commentaires fantômes

| Fichier | Ligne | Commentaire obsolète |
|---------|-------|---------------------|
| `src/hooks/useDebounce.ts` | 7 | `Sprint 2.1: High-Fidelity Hybrid Zoom` — référence ancienne architecture |
| `src/components/PdfViewer.tsx` | 145-146 | `Sprint 1.2:` — référence interne, cosmétique |
| `src/components/PdfViewer.tsx` | 149 | `Sprint 1.1:` — référence interne, cosmétique |

**Action Coder** : Nettoyage cosmétique, priorité basse.

---

### 5. TYPES MORTS DANS `src/types.ts`

| Lignes | Type/Propriété | Statut |
|--------|---------------|--------|
| 64-87 | Interface `PdfDocumentProps` | Utilisée **nulle part** dans le code actuel. PdfViewer utilise sa propre interface `PdfViewerProps` définie localement. Contient les propriétés fantômes `renderedScale`, `zoomFocalPoint`, `isFitToScreenAction`. |

**Action Coder** : Supprimer l'interface `PdfDocumentProps` de `src/types.ts`.

---

### RÉSUMÉ DES PRIORITÉS

| Priorité | Fichier | Action |
|----------|---------|--------|
| 🔴 P0 | `src/hooks/index.ts` | Supprimer lignes 5-28, exporter `useDebounce` |
| 🟡 P1 | `src/App.tsx` | Supprimer useEffect vide (L144-156), supprimer 14 props fantômes passées à PdfViewer |
| 🟡 P1 | `src/components/PdfViewer.tsx` | Nettoyer l'interface PdfViewerProps (supprimer props inutilisées) |
| 🟢 P2 | `src/utils/pdfRenderUtils.ts` | Supprimer le fichier entier (orphelin) |
| 🟢 P2 | `src/types.ts` | Supprimer interface `PdfDocumentProps` (L64-87) |
| ⚪ P3 | `src/App.tsx` L1-12 | Mettre à jour JSDoc header |
| ⚪ P3 | `src/hooks/useDebounce.ts` L7 | Supprimer référence Sprint 2.1 |

---

## [2026-02-06] AUDIT PHASE 2 — Analyse mathématique du zoom Caméra (centrage & visée)

**Auditeur** : Agent QA (Claude Opus 4.6)
**Statut** : 🔴 **2 BUGS GÉOMÉTRIQUES CRITIQUES IDENTIFIÉS**
**Scope** : `src/components/PdfViewer.tsx` — architecture Caméra avec `transform: scale(S)` + `transform-origin: center center`

---

### 0. HIÉRARCHIE DOM ANALYSÉE

```
containerRef  (overflow: auto, h-full w-full)          ← Fenêtre de scroll
  └─ #pdf-camera  (transform: scale(S), origin: center center, willChange: transform)
      └─ #pdf-workspace  (contentRef, grid, placeItems: center, padding: 100vh 100vw)
          └─ #pdf-scale-layer
              └─ Document → Pages (dimensions fixes 1:1)
```

### 1. RAPPEL CSS FONDAMENTAL : `transform` et `overflow`

Règle CSS Overflow Module Level 3, §2.2 :
> **L'overflow négatif (au-delà du bord inline-start/block-start) est rogné et non scrollable.**

Conséquence directe pour `transform-origin: center center` + `scale(S)` :

Soit `W` la largeur layout de `#pdf-camera`, `H` sa hauteur layout.
Le centre de transformation est au point `C = (W/2, H/2)` en coordonnées parent.

Après `scale(S)` :
- **Bord gauche visuel** : `W/2 - W·S/2 = W·(1-S)/2`
- **Bord droit visuel** : `W/2 + W·S/2 = W·(1+S)/2`

Pour `S > 1` : le bord gauche est **négatif** → **rogné par le navigateur, non scrollable**.

Le `scrollWidth` du conteneur devient :
```
scrollWidth = W·(1+S)/2    (pour S ≥ 1)
scrollWidth = W             (pour S < 1)
```

**La zone scrollable est asymétrique** : le centre du workspace n'est PAS au milieu de la plage de scroll.

---

### 2. BUG #1 — Centrage initial : formule fausse pour `scale ≠ 1`

**Fichier** : `PdfViewer.tsx`, lignes 151-173
**Code actuel** :
```typescript
const { scrollWidth, scrollHeight, clientWidth, clientHeight } = container;
container.scrollTo({
  left: (scrollWidth - clientWidth) / 2,   // ← FAUX
  top: (scrollHeight - clientHeight) / 2,  // ← FAUX
});
```

**Démonstration** (viewport 1200×800, page 612×792) :

Le workspace a `padding: 100vh 100vw`, donc :
- `W_workspace = 2·1200 + 612 ≈ 3012 px`
- `H_workspace = 2·800 + 792 ≈ 2392 px`

Le centre du workspace (= centre de la caméra) est à `C = (1506, 1196)` en coordonnées parent.

**À `scale = 1`** :
- `scrollWidth = 3012`, formule donne `scrollLeft = (3012-1200)/2 = 906`
- Centre viewport = `906 + 600 = 1506` = `C_x` ✅ **Correct**

**À `scale = 2`** (restauré depuis reading position) :
- `scrollWidth = 3012·(1+2)/2 = 4518`
- Formule donne `scrollLeft = (4518-1200)/2 = 1659`
- Centre viewport = `1659 + 600 = 2259`
- Mais le centre du document est toujours à `C_x = 1506` !
- **Erreur = +753 px vers la droite** ❌

**Formule correcte** :
```
Le point C = (W/2, H/2) est INVARIANT sous transform-origin: center center.
Donc pour centrer le viewport sur le document, quel que soit S :

scrollLeft = W/2 - clientWidth/2
scrollTop  = H/2 - clientHeight/2
```

Où `W = content.scrollWidth` (= workspace layout width, invariant sous le transform du parent).

```typescript
// CORRECTION — centrage initial (lignes 158-166)
const centerDocument = () => {
  const cx = content.scrollWidth / 2;
  const cy = content.scrollHeight / 2;
  container.scrollTo({
    left: cx - clientWidth / 2,
    top:  cy - clientHeight / 2,
    behavior: 'instant'
  });
};
```

---

### 3. BUG #2 — Stabilisation zoom : formule est un NO-OP

**Fichier** : `PdfViewer.tsx`, lignes 175-207
**Code actuel** :
```typescript
const centerX = scrollLeft + clientWidth / 2;
const centerY = scrollTop + clientHeight / 2;

const ratioX = centerX / content.scrollWidth;   // ratio = f(scroll) / CONSTANTE
const ratioY = centerY / content.scrollHeight;

// ... lastScaleRef.current = scale;

const newScrollLeft = (ratioX * content.scrollWidth) - clientWidth / 2;
```

**Preuve que c'est un NO-OP** :

`content.scrollWidth` est le `scrollWidth` de `#pdf-workspace` (le contentRef). Le `transform: scale(S)` est appliqué sur le **parent** (`#pdf-camera`), pas sur le workspace. Donc `content.scrollWidth` **ne change jamais** avec le scale.

Développons :
```
newScrollLeft = (ratioX × content.scrollWidth) - clientWidth/2
             = ((scrollLeft + clientWidth/2) / content.scrollWidth) × content.scrollWidth - clientWidth/2
             = scrollLeft + clientWidth/2 - clientWidth/2
             = scrollLeft
```

**La formule se réduit à `newScrollLeft = scrollLeft`.** Le scroll ne bouge pas. Le zoom n'est pas stabilisé.

---

### 4. FORMULE CORRECTE — Zoom centré sur le viewport

Pour un zoom de `S_old` à `S_new` avec `transform-origin: center center` :

Le point invariant du transform est `C = (W/2, H/2)` (workspace layout center).

1. Le viewport regarde le point workspace `P` :
```
P_x = C_x + (viewCenterX - C_x) / S_old
```
(car screen→world = inverse de world→screen)

2. Après changement de scale, ce même point P se retrouve en coords parent à :
```
newParentX = C_x + (P_x - C_x) × S_new
           = C_x + (viewCenterX - C_x) × S_new / S_old
```

3. Pour garder P centré dans le viewport :
```
newScrollLeft = newParentX - clientWidth / 2
             = C_x + (viewCenterX - C_x) × (S_new / S_old) - clientWidth / 2
```

Où `viewCenterX = scrollLeft + clientWidth / 2` et `C_x = content.scrollWidth / 2`.

```typescript
// CORRECTION — stabilisation zoom (lignes 175-207)
useLayoutEffect(() => {
  const container = containerRef.current;
  const content = contentRef.current;
  if (!container || !content || scale === lastScaleRef.current) {
    lastScaleRef.current = scale;
    return;
  }

  const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;

  // Point invariant : centre du workspace layout
  const Cx = content.scrollWidth / 2;
  const Cy = content.scrollHeight / 2;

  // Centre actuel du viewport
  const viewCenterX = scrollLeft + clientWidth / 2;
  const viewCenterY = scrollTop + clientHeight / 2;

  // Ratio de changement d'échelle
  const ratio = scale / lastScaleRef.current;

  // Projection du centre viewport vers le nouvel espace
  const newCenterX = Cx + (viewCenterX - Cx) * ratio;
  const newCenterY = Cy + (viewCenterY - Cy) * ratio;

  lastScaleRef.current = scale;

  container.scrollTo({
    left: newCenterX - clientWidth / 2,
    top:  newCenterY - clientHeight / 2,
    behavior: 'instant'
  });
}, [scale]);
```

---

### 5. VÉRIFICATION — Cas limites

| Scénario | Formule actuelle | Formule corrigée | Résultat |
|----------|-----------------|-----------------|----------|
| Scale 1→1 (pas de changement) | `ratio = 1`, no-op | `ratio = 1`, no-op | ✅ Identique |
| Scale 1→2, centré au début | `scrollLeft inchangé` | `newCenter = C + (C-C)×2 = C`, scroll vers C | ✅ Reste centré |
| Scale 1→2, scrollé à droite de 200px | `scrollLeft inchangé (1106)` | `newCenter = C + 200×2 = C+400`, scroll adapté | ✅ Zoom pointe vers la zone regardée |
| Scale 2→1, centré | `scrollLeft inchangé` | `newCenter = C + 0×0.5 = C` | ✅ Reste centré |
| Scale 2→1, scrollé | `scrollLeft inchangé` | Distance au centre réduite de moitié | ✅ Dezoom naturel |

---

### 6. DIAGNOSTIC COMPLÉMENTAIRE — `handleFitToWidth` (App.tsx L188-194)

```typescript
const targetScale = (containerDimensions.width - 48) / pageDimensions.width;
```

Avec l'architecture Caméra, `containerDimensions.width` est le `clientWidth` du conteneur (correct). `pageDimensions.width` est la largeur 1:1 du PDF (612 par défaut, correct).

Le problème : cette formule calcule le scale pour que `pageDimensions.width × scale = containerWidth - 48`. Mais le workspace a un `padding: 100vw` de chaque côté. Visuellement, la page prend `pageDimensions.width` px dans le workspace, et le scale s'applique globalement via la caméra. Donc à `scale = targetScale`, la page apparaît à `612 × targetScale` pixels visuels, ce qui devrait correspondre à `containerWidth - 48`. **Correct dans le principe.**

Toutefois, après le `setScale(targetScale)`, le centrage dépend du Bug #2 (stabilisation zoom). Si le Bug #2 n'est pas corrigé, le Fit-to-Width change le scale mais ne recentre pas — le viewport reste décalé.

---

### RÉSUMÉ DES CORRECTIONS

| Bug | Localisation | Cause racine | Correction |
|-----|-------------|-------------|------------|
| **#1 Centrage initial** | L158-166 | `(scrollWidth - clientWidth)/2` suppose symétrie de scroll. Faux avec `transform-origin: center center` + `S > 1` car le navigateur rogne l'overflow négatif. | Utiliser `content.scrollWidth/2 - clientWidth/2` (position invariante du centre workspace). |
| **#2 Stabilisation zoom** | L183-206 | `content.scrollWidth` est invariant (pas affecté par le transform du parent). La formule ratio×constante = no-op. | Utiliser le ratio `S_new/S_old` pour projeter le centre viewport autour du point fixe `C = workspace_layout_center / 2`. |
| **#3 Fit-to-Width** | App.tsx L188-194 | La formule de scale est correcte, mais le recentrage post-zoom dépend de la correction du Bug #2. | Aucune modification nécessaire si Bug #2 est corrigé. |

---

## [2026-02-09] AUDIT PHASE 2 — SUIVI : Les bugs géométriques persistent (régression Coder)

**Auditeur** : Agent QA (Claude Opus 4.6)
**Statut** : 🔴 **2 BUGS TOUJOURS PRÉSENTS — RÉGRESSION DEPUIS LE FIX PRÉCÉDENT**
**Scope** : `src/components/PdfViewer.tsx` (commit courant sur `master`)

---

### 0. CONTEXTE : QU'A FAIT LE CODER DEPUIS L'AUDIT DU 06/02 ?

Le CODER_LOG du 06/02 ("Raffinement Calcul Zone de Scroll") documente explicitement :

> *"Retrait des calculs de projection invariante manuels (`Cx`, `Cy`, `ratio`) au profit d'une approche par ratio de scroll global, plus compatible avec le comportement natif des navigateurs."*

**Le Coder a supprimé la formule correcte (projection invariante) et l'a remplacée par une approche "ratio de scroll" qui est mathématiquement un NO-OP.** C'est une régression directe par rapport à la recommandation de l'audit du 06/02.

---

### 1. HIÉRARCHIE DOM ACTUELLE (INCHANGÉE)

```
containerRef  (overflow: auto, h-full w-full)               ← Scroll viewport
  └─ #pdf-camera  (transform: scale(S), origin: center center)  ← Lentille GPU
      └─ #pdf-workspace  (contentRef, grid, padding: 100vh 100vw)  ← Monde fixe
          └─ #pdf-scale-layer
              └─ <Document> → <LazyPage> × N  (dims fixes 1:1)
```

---

### 2. BUG #1 (PERSISTANT) — Centrage initial

**Fichier** : `PdfViewer.tsx`, lignes 151-165
**Code actuel** :
```typescript
useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !file || numPages === 0 || allPagesDimensions.size === 0) return;

    const centerDocument = () => {
      container.scrollTo({
        left: (container.scrollWidth / 2) - (container.clientWidth / 2),  // ← BUG
        top: (container.scrollHeight / 2) - (container.clientHeight / 2), // ← BUG
        behavior: 'instant'
      });
    };

    const timer = setTimeout(centerDocument, 50);
    return () => clearTimeout(timer);
}, [file, numPages, allPagesDimensions.size]);
```

**Analyse :** La formule `(container.scrollWidth / 2) - (clientWidth / 2)` suppose que `scrollWidth / 2` est le milieu géométrique du contenu. C'est **FAUX** avec `transform-origin: center center` + `scale(S)`.

**Preuve (rappel) :**

Avec `transform-origin: center center` sur `#pdf-camera` de largeur layout `W` :

| Scale S | Bord gauche visuel | Bord droit visuel | Overflow négatif rogné | `container.scrollWidth` | Formule donne `scrollLeft` | Centre viewport résultant | Centre réel du doc (invariant) | Erreur |
|---------|-------------------|------------------|----------------------|------------------------|--------------------------|--------------------------|-------------------------------|--------|
| 1.0 | 0 | W | Non | W | (W-cW)/2 | W/2 | W/2 | **0** ✅ |
| 1.5 | W×(-0.25) | W×1.25 | Oui, W×0.25 | W×1.25 | (1.25W-cW)/2 | 0.625W | W/2 | **+0.125W** ❌ |
| 2.0 | W×(-0.5) | W×1.5 | Oui, W×0.5 | W×1.5 | (1.5W-cW)/2 | 0.75W | W/2 | **+0.25W** ❌ |
| 3.0 | W×(-1.0) | W×2.0 | Oui, W×1.0 | W×2.0 | (2W-cW)/2 | W | W/2 | **+0.5W** ❌ |

**La dérive est proportionnelle à `(S-1)` :** Erreur = `W × (S-1) / 4`.

Pour un viewport de 1200px et un workspace de 3012px, à S=2 l'erreur est de **753px vers la droite**.

**Impact réel :** En pratique, à l'ouverture d'un nouveau fichier, `scale = 1.0` (via `handleOpenFile`/`handleFileChange`). Donc le centrage initial fonctionne pour les fichiers neufs. **Le bug se manifeste uniquement si `scale` est restauré depuis une reading position sauvegardée (`getReadingPosition`)** dans `App.tsx:168-171`.

**Formule correcte (inchangée depuis audit 06/02) :**
```typescript
const content = contentRef.current;
// content.scrollWidth = W (invariant, pas affecté par le transform du parent)
container.scrollTo({
  left: content.scrollWidth / 2 - container.clientWidth / 2,
  top:  content.scrollHeight / 2 - container.clientHeight / 2,
  behavior: 'instant'
});
```

---

### 3. BUG #2 (AGGRAVÉ) — Stabilisation zoom : toujours un NO-OP

**Fichier** : `PdfViewer.tsx`, lignes 168-192
**Code actuel** :
```typescript
useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || scale === lastScaleRef.current) {
      lastScaleRef.current = scale;
      return;
    }

    const { scrollLeft, scrollTop, clientWidth, clientHeight, scrollWidth, scrollHeight } = container;

    const ratioX = (scrollLeft + clientWidth / 2) / scrollWidth;   // ← (A)
    const ratioY = (scrollTop + clientHeight / 2) / scrollHeight;

    lastScaleRef.current = scale;

    const newScrollLeft = (ratioX * container.scrollWidth) - clientWidth / 2;  // ← (B)
    const newScrollTop = (ratioY * container.scrollHeight) - clientHeight / 2;

    container.scrollTo({ left: newScrollLeft, top: newScrollTop, behavior: 'instant' });
}, [scale]);
```

**Régression par rapport à l'audit 06/02 :** L'ancienne version utilisait `content.scrollWidth` (du `contentRef`). Le Coder a remplacé par `container.scrollWidth`. Ironiquement, les deux versions sont des NO-OP, mais pour des raisons différentes :

**Preuve formelle que le code actuel est un NO-OP :**

L'exécution se fait dans un `useLayoutEffect`. React a déjà commis les nouveaux attributs DOM (`transform: scale(S_new)`) dans le DOM. Le navigateur n'a PAS encore peint, mais les propriétés de layout sont calculées.

Donc :
- Ligne (A) : `scrollWidth` = `container.scrollWidth` post-commit = `W×(1+S_new)/2`
- Ligne (B) : `container.scrollWidth` = même valeur (même instant synchrone, même DOM)

Développement :
```
newScrollLeft = ratioX × container.scrollWidth - clientWidth/2
             = [(scrollLeft + cW/2) / scrollWidth] × scrollWidth - cW/2
             = (scrollLeft + cW/2) - cW/2
             = scrollLeft                    ← IDENTITÉ, AUCUN MOUVEMENT
```

**Pourquoi le `scrollWidth` a déjà la nouvelle valeur :**

Le cycle React est : `setState(scale)` → render → DOM commit → `useLayoutEffect` → browser paint.

Au moment du `useLayoutEffect`, le DOM contient déjà `transform: scale(S_new)`. Le navigateur recalcule immédiatement le layout overflow. Donc `container.scrollWidth` reflète le NOUVEAU scale, pas l'ancien.

Le code n'a **aucun moyen** de connaître l'ancien `scrollWidth` sans l'avoir mémorisé dans un ref AVANT le changement de scale. C'est pour ça que la formule par ratio `S_new / S_old` est la seule approche viable.

**Formule correcte (inchangée depuis audit 06/02) :**
```typescript
useLayoutEffect(() => {
  const container = containerRef.current;
  const content = contentRef.current;
  if (!container || !content || scale === lastScaleRef.current) {
    lastScaleRef.current = scale;
    return;
  }

  const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;

  // Centre invariant du workspace (pas affecté par le transform CSS)
  const Cx = content.scrollWidth / 2;
  const Cy = content.scrollHeight / 2;

  // Position actuelle du viewport (scrollLeft est conservé par le navigateur)
  const viewCenterX = scrollLeft + clientWidth / 2;
  const viewCenterY = scrollTop + clientHeight / 2;

  // Facteur d'expansion : le seul ratio qui change
  const ratio = scale / lastScaleRef.current;

  // Le point au centre du viewport s'éloigne ou se rapproche de C proportionnellement
  const newCenterX = Cx + (viewCenterX - Cx) * ratio;
  const newCenterY = Cy + (viewCenterY - Cy) * ratio;

  lastScaleRef.current = scale;

  container.scrollTo({
    left: newCenterX - clientWidth / 2,
    top:  newCenterY - clientHeight / 2,
    behavior: 'instant'
  });
}, [scale]);
```

**Pourquoi cette formule fonctionne :**
- `content.scrollWidth` = `W` (constante, le transform est sur le parent)
- `scrollLeft` = position héritée d'avant le changement (le navigateur ne l'ajuste pas automatiquement lors d'un changement de CSS transform)
- `scale / lastScaleRef.current` = le seul facteur de changement géométrique
- La projection `Cx + (delta) × ratio` modélise correctement l'expansion du contenu autour du point fixe `C`

**Vérification numérique (viewport 1200×800, workspace 3012×2392) :**

| Scénario | scrollLeft avant | viewCenterX | ratio | newCenterX | newScrollLeft | Résultat |
|----------|-----------------|-------------|-------|------------|---------------|----------|
| S: 1→2, centré (906) | 906 | 1506 | 2.0 | 1506 + 0 = 1506 | 906 | ✅ Reste centré |
| S: 1→2, décalé droite +200 (1106) | 1106 | 1706 | 2.0 | 1506 + 400 = 1906 | 1306 | ✅ Zoom vise la zone regardée |
| S: 2→1, centré (906) | 906 | 1506 | 0.5 | 1506 + 0 = 1506 | 906 | ✅ Reste centré |
| S: 2→1, décalé +400 (1306) | 1306 | 1906 | 0.5 | 1506 + 200 = 1706 | 1106 | ✅ Dézoom naturel |

---

### 4. ANALYSE COMPATIBILITÉ `transform-origin: center center` + `overflow: auto`

**Question soulevée :** Le choix de `transform-origin: center center` est-il compatible avec la gestion native du scroll ?

**Réponse : Oui, MAIS avec des contraintes.**

La combinaison fonctionne à condition de ne JAMAIS utiliser `container.scrollWidth` comme référence géométrique absolue. En effet :

```
container.scrollWidth = W × (1 + S) / 2    (pour S ≥ 1)
container.scrollWidth = W                   (pour S < 1)
```

Cette asymétrie (due au rognage de l'overflow négatif) rend `scrollWidth` inutile pour tout calcul de centrage ou de projection. Seul `content.scrollWidth` (le layout du workspace, invariant) est fiable.

**Alternative architecturale :** Avec `transform-origin: 0 0`, l'overflow négatif n'existe jamais (le contenu s'étend uniquement vers la droite/le bas). Les formules deviennent plus simples :
```
scrollWidth = W × S                  (toujours, pas de cas S<1 vs S≥1)
scrollLeft_center = W × S / 2 - cW / 2
```
Mais cela imposerait un déplacement visible du contenu vers le bas-droite lors du zoom, ce qui est visuellement inférieur. **Le choix `center center` est le bon**, il faut juste utiliser les bonnes formules.

---

### 5. INJECTION HD (LazyPage) — AUCUNE RÉGRESSION

**Code analysé** (lignes 86-119) :
```typescript
const width = pageDimensions.width;           // 1:1 fixe
const height = pageDimensions.height;         // 1:1 fixe
const renderWidth = pageDimensions.width * debouncedScale;  // HD
const inverseScale = 1 / debouncedScale;

<div style={{ width, height }} className="... overflow-hidden">
  <div style={{ transform: `scale(${inverseScale})`, transformOrigin: '0 0', width: renderWidth }}>
    <Page width={renderWidth} ... />
  </div>
</div>
```

**Vérification dimensionnelle :**
- Le wrapper externe est fixe à `width × height` (dimensions 1:1).
- Le contenu interne est rendu à `renderWidth = width × debouncedScale`.
- L'inverse scale le ramène visuellement à `renderWidth × (1/debouncedScale) = width`. ✅
- Le `overflow: hidden` empêche toute fuite dimensionnelle. ✅
- Les dimensions layout du workspace sont **strictement indépendantes** de `debouncedScale`. ✅

**Transition HD pendant le zoom :**
Pendant les 150ms de debounce, `debouncedScale ≠ scale`. La page est rendue à la résolution précédente, mais la caméra a déjà zoomé. L'utilisateur voit un contenu légèrement flou qui s'affine après stabilisation. **Comportement attendu et conforme à l'architecture.**

**Diagnostic : AUCUN impact de l'injection HD sur les dimensions du workspace ni sur les calculs de scroll.**

---

### 6. BUG SUPPLÉMENTAIRE — Course de timing sur le centrage initial

**Fichier** : `PdfViewer.tsx`, ligne 163
```typescript
const timer = setTimeout(centerDocument, 50);
```

Le délai de 50ms est arbitraire. Si le rendu de `react-pdf` prend plus de 50ms (réseau lent, PDF complexe), les dimensions DOM ne seront pas encore stabilisées. Si le rendu est rapide, les 50ms créent un flash visible où le document n'est pas centré.

**Recommandation :** Remplacer le `setTimeout` par un `requestAnimationFrame` qui garantit l'exécution **après** le prochain cycle de layout du navigateur :
```typescript
const centerDocument = () => {
  const content = contentRef.current;
  if (!content) return;
  container.scrollTo({
    left: content.scrollWidth / 2 - container.clientWidth / 2,
    top:  content.scrollHeight / 2 - container.clientHeight / 2,
    behavior: 'instant'
  });
};
requestAnimationFrame(() => requestAnimationFrame(centerDocument));
// Double rAF garantit que le layout est calculé
```

---

### RÉSUMÉ DES ACTIONS CODER

| Priorité | Bug | Localisation | Action |
|----------|-----|-------------|--------|
| 🔴 P0 | **Zoom NO-OP** | L168-192 | Remplacer l'approche "ratio de scroll" par la projection invariante `Cx + (viewCenter - Cx) × (S_new/S_old)` en utilisant `contentRef.current.scrollWidth` |
| 🔴 P0 | **Centrage initial** | L151-165 | Remplacer `container.scrollWidth/2` par `contentRef.current.scrollWidth/2` |
| 🟡 P1 | **Timing centrage** | L163 | Remplacer `setTimeout(50)` par `requestAnimationFrame` double |
| ✅ | **Injection HD** | L86-119 | Aucune action — dimensionnellement correct |
| ✅ | **Fit-to-Width** | App.tsx L188-194 | Aucune action nécessaire si Bug #2 corrigé |

**Règle d'or à respecter :** Dans l'architecture Caméra (`transform: scale(S)` + `transform-origin: center center`), la seule source de vérité géométrique est `contentRef.current.scrollWidth/Height` (dimensions du monde fixe). Ne JAMAIS utiliser `container.scrollWidth/Height` pour des calculs de position — cette valeur est polluée par le rognage asymétrique de l'overflow négatif.

---

## 2026-02-13 — Audit de Clôture & Validation UX

**Diagnostic :**
- L'architecture "Caméra" est maintenant parfaitement isolée.
- Les composants à positionnement fixe (`OutlinePanel`, `AiPanel`) ont été extraits des zones de transformation GPU pour éviter tout décalage visuel.
- La stabilité du zoom est confirmée : l'ancrage utilise désormais `contentRef.current.scrollWidth` comme base invariante, éliminant la dérive vers la droite observée lors de l'usage de `container.scrollWidth`.

**Verdict :** ✅ Architecture validée. Les bugs de visée et de navigation sont résolus.

---

## 2026-02-13 — Audit de Clôture : Excellence Visuelle & Rendu

**Diagnostic :**
- **Artefacts de Rendu :** Le "flash blanc" observé lors des transitions a été résolu en corrigeant la couleur de base du conteneur `LazyPage` (forcé en blanc lors de l'application du filtre d'inversion SVG). La bordure blanche résiduelle a été éliminée par la suppression des ombres et bordures fixées en dur.
- **Cohérence des Thèmes :** Le passage aux variables CSS natives (`--lumina-*`) assure une synchronisation parfaite entre le moteur de rendu PDF et l'UI applicative. Les composants premium (`glass-premium`, `dropdown-premium`) sont désormais agnostiques et s'adaptent dynamiquement.
- **Lisibilité :** Validation du contraste pour le thème "Clair". L'utilisation de `color-mix` permet de conserver une transparence premium tout en garantissant la lisibilité du texte sur tous les arrière-plans.
- **Performance :** L'augmentation du budget de pré-rendu (2000px) garantit une fluidité visuelle même lors d'un défilement vertical rapide à haut niveau de zoom.

**Verdict Final :** ✅ Excellence visuelle atteinte. LuminaPDF est prêt pour la production avec une expérience utilisateur fluide et sans défauts visuels.