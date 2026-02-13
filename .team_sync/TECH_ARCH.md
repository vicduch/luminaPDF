# TECH_ARCH.md

## Stack technique (Existante & Normalisée)

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Langage | TypeScript | ~5.8.2 |
| Framework | Vite / React | 6.2.0 / 19.2.3 |
| PDF Engine | standard react-pdf / PDF.js | 10.2.0 / 4.8.69 |
| Runtime | Electron | 39.2.7 |
| Styling | TailwindCSS | 3.4.19 (Local + PostCSS) |

## Phase 0 & 1 : Reconstruction Stable
Le socle minimaliste avec scroll continu et Lazy Loading (IntersectionObserver) est validé et stable.

## Phase 2 : Architecture "Caméra" (Global Scale)
Abandon du zoom physique au profit d'un zoom optique global (transform CSS).

### Principes de la Caméra
- **Le Monde Fixe** : Un canevas contenant le document et ses marges avec des proportions constantes (`originalSize`).
- **Zoom Optique** : Application d'un `transform: scale(scale)` unique sur l'ensemble du "Monde".
- **Résolution Hybride** : Rendu CPU haute densité (`debouncedScale`) injecté dans un layout de taille fixe pour maintenir la netteté sans décalage.

## Navigation & Architecture Workspace

| Concept | Solution | Implémentation |
|----------|----------|----------------|
| Workspace Panning | Monde fixe | Padding Grid constant relative à `originalSize`. |
| Zoom Caméra | Transform CSS | `scale(scale)` sur le conteneur global. |
| Netteté | Rendu HD debounced | Prop `devicePixelRatio` ou scale interne inversé. |
| Centrage | Constant | Cible le centre géométrique du Monde. |

## Dette technique (Reset)
- **Transform Performance** : Le scale CSS global est extrêmement performant (GPU).
- **Redondance Rendu** : Nécessité de bien gérer le debounce pour éviter des rendus CPU inutiles durant le mouvement de la caméra.
