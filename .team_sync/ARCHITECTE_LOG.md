# ARCHITECTE_LOG

## 2026-02-05 - Analyse Structurelle et Plan de Nettoyage
(Contenu précédent conservé par référence)

---

## 2026-02-05 - Stabilisation Documentaire
(Contenu précédent conservé par référence)

---

## 2026-02-05 - PHASE 1 : SCROLL CONTINU ET LAZY LOADING
(Terminée - Succès)

---

## 2026-02-05 - PHASE 2 : ARCHITECTURE "CAMÉRA" (Global Scale)
(En cours)

---

## 2026-02-05 - PLAN CORRECTIF : STABILISATION BASÉE SUR LE RÉFÉRENTIEL NAVIGATEUR (Sprint 2.11)

L'audit montre que les ratios focalaux calculés sur le contenu (1:1) sont erronés car ils ne reflètent pas l'expansion réelle gérée par le transform du parent. Nous basculons tous les calculs sur le référentiel `scrollWidth` du conteneur de scroll.

### 1. Correction du Centrage Initial
**Diagnostic** : L'usage de `content.scrollWidth` renvoie la taille non-scalée, décentrant le document à l'ouverture.
**Action** :
- Utiliser `container.scrollWidth` et `container.scrollHeight`.
- Formule : `left = (container.scrollWidth - container.clientWidth) / 2`.
- Cela garantit un centrage parfait quel que soit le niveau de zoom initial ou la taille du bureau.

### 2. Nouvelle Logique de Maintien du Focus
**Diagnostic** : La projection actuelle est complexe et sujette à l'erreur. La méthode des ratios sur l'espace scrollable total est plus robuste.
**Mathématiques (Capture & Restauration) :**
- **Capture (avant le changement de scale)** :
    - `Sw = container.scrollWidth` (Largeur totale scrollable actuelle)
    - `RatioX = (container.scrollLeft + container.clientWidth / 2) / Sw`
- **Restauration (dans useLayoutEffect, après rendu)** :
    - `Sw_new = container.scrollWidth` (Nouvelle largeur totale après expansion du transform)
    - `newScrollLeft = (RatioX * Sw_new) - container.clientWidth / 2`
- **Pourquoi ?** : `container.scrollWidth` est la variable de vérité du navigateur. Elle inclut l'effet du `transform: scale()` sur les enfants. En maintenant le ratio du centre visuel par rapport à cette largeur, le zoom reste parfaitement ancré.

### 3. Alignement des Variables
- Supprimer toute dépendance à `content.scrollWidth` dans les calculs de navigation.
- Garder `contentRef` uniquement pour des besoins de layout Grid, pas pour les mathématiques de scroll.

### Directive pour le Coder
Dans `PdfViewer.tsx`, modifier le `useLayoutEffect` de stabilisation. Capturer le ratio focal (basé sur `container.scrollWidth`) au moment où l'utilisateur déclenche le zoom (ou via une variable de state intermédiaire) et restaurer la position dans l'effet en utilisant la nouvelle valeur de `container.scrollWidth`. S'assurer que `transform-origin` reste à `center center`.