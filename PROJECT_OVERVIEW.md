# 📖 LuminaPDF - Project Overview

## ⚡ Vision du Projet
LuminaPDF est un **lecteur PDF web haute performance** conçu pour offrir une expérience de lecture fluide comparable à **Adobe Acrobat** ou **Figma**, directement dans le navigateur.

L'objectif principal est d'éliminer les compromis habituels des lecteurs PDF web (lag au zoom, pages blanches, freeze UI) grâce à un **moteur de rendu multithreadé par tuiles**.

## 🛠️ Stack Technique
- **Framework** : React 18 (TypeScript)
- **Tooling** : Vite 6.x
- **Core Engine** : PDF.js (Custom Worker Implementation)
- **Performance** : Web Workers (jusqu'à 12 threads), OffscreenCanvas, ImageBitmap
- **Styling** : TailwindCSS (Utility-first) + CSS Variables (Theming dynamique)

## 🌟 Fonctionnalités Clés

### 1. Moteur de Rendu "Tiled" (Tuiles)
Au lieu de rendre une page entière (lourd), LuminaPDF découpe la vue en petites tuiles (ex: 512x512px).
- **Architecture Hybride** : Découplage total entre la **Géométrie** (60fps, CSS transform) et la **Qualité** (rendu async).
- **LOD (Level of Detail)** : Ajustement dynamique de la résolution selon le zoom.
- **Zero Gray Zone** : Utilisation d'un `OverviewLayer` basse résolution persistant pour éviter les fond gris.

### 2. Système de Thèmes Avancé
- **Dual-Axis Theming** : Chaque thème (Forest, Midnight, Sepia...) possède des variantes **Light** et **Dark** indépendantes.
- **Colorisation Natived** : Les PDFs ne sont pas inversés par CSS (moche), mais **recolorisés au pixel près** dans les Web Workers pour un contraste parfait.
- **Mode eInk** : Simulation fidèle d'une liseuse électronique.

### 3. Performance Extreme
- **Culling** : Seules les tuiles visibles sont calculées.
- **Priorisation Radiale** : Les tuiles au centre du regard chargent en premier.
- **HiDPI Support** : Rendu pixel-perfect sur écrans Retina/4K (DPR scaling).
- **Debounced Quality** : Le zoom rapide reste fluide, la qualité HD s'affine ~100ms après l'arrêt du mouvement.

## 📊 État Actuel du Développement
**Sprint Actuel : 2.2.1 (Stabilisation Rendu)**

### Ce qui fonctionne ✅
- Ouverture instantanée de gros PDF (1000+ pages).
- Scroll continu ultra-fluide (virtualisé).
- Zoom infini (10% - 800%) avec ancrage souris.
- Changement de thème instantané sans flash.

### Points d'Attention (WIP) 🚧
- **Tuiles Floues Partielles** : À fort zoom (>300%), certaines tuiles restent parfois bloquées en basse résolution (LOD mismatch).
- **UX Zoom** : En cours de raffinement pour éliminer tout effet "ressort" lors de zooms rapides.

## 🎯 Environnement Cible
Optimisé pour des machines modernes :
- **CPU** : Multi-cœur (exploitation de 4 à 16 threads).
- **Écran** : Haute densité de pixels (HiDPI/Retina).
- **Input** : Trackpad précision (gestures) et Souris (molette).
