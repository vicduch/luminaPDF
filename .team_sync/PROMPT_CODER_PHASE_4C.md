# Mission Coder : Implémentation du Swipe "Pull-to-Turn" Élastique (Phase 4C)

Tu es le Coder. L'application LuminaPDF possède un espace de travail paginé (`ScrollMode.PAGED`) ultra fluide. Cependant, l'expérience tactile lors du changement de page (le `swipe`) manque de naturel natif, particulièrement lorsqu'on est zoomé ou en limite de document.

L'Architecte a rédigé un plan de match rigoureux dans `implementation_plan.md` pour mettre en place une mécanique **"Pull-to-Turn" (Tirer pour tourner)** semblable aux UI iOS/Android.

## Ton Objectif 🎯
Implémenter la physique d'étirement élastique sur l'axe X dans `PdfViewer.tsx` et déclencher le changement de page si le seuil de tension est franchi.

### Les 4 étapes d'implémentation (cf `implementation_plan.md`) :

1. **Variables de Force** : Injecte les `useRef` pour suivre l'offset de balayage (`swipeOffsetRef`). Note que cet effet ne s'applique *que* s'il n'y a plus de scroll natif possible dans la direction du balayage (butée).
2. **Le TouchMove (Tension)** : 
    - Modifie `handleTouchMove` (vers la Ligne 790). 
    - Si l'utilisateur swipe horizontalement et que le container est en butée (`scrollLeft <= 0` ou `scrollLeft >= maxScroll`), intercepte la physique :
        - `e.preventDefault()` pour stopper l'OS.
        - Applique un friction de 30% (`deltaX * 0.3`).
        - Stocke ce delta dans `swipeOffsetRef` et applique-le en *temps réel* (120fps) via `cameraRef.current.style.transform = scale(...) translateX(...)`.
3. **Le TouchEnd (Relâchement / Validation)** :
    - Modifie `handleTouchEnd` (vers la Ligne 845).
    - Un seuil de déclenchement (ex: `120px` visuels ou proportionnels) est-il atteint ?
        - **OUI** : Déclenche `setPageNumber(+1 / -1)`.  Ajoute une transition CSS rapide sur la caméra (ex: `cameraRef.current.style.transition = 'transform 0.2s ease-out'`) et remets `translateX` à 0. (N'oublie pas de vider la transition une fois finie via un `setTimeout`).
        - **NON** : L'utilisateur a relâché trop tôt. Remets `translateX` à 0 avec la même transition fluide (Effet Rebond).
4. **CSS Touch-Action** : Vérifie que `touchAction` sur le container principal (Ligne 960+) permet bien `manipulation` ou `pan-x pan-y` pour autoriser cette surcouche.

### Contraintes & Conseils :
- **Ne casse pas le Pinch-to-Zoom** : Le Pinch a été finement calibré. Tes ajouts de swipe élastique ne doivent s'activer que si `e.touches.length === 1`.
- **Garde le 60fps stable** : Protège les mutations DOM directes via `requestAnimationFrame` où c'est critique (bien que l'assignation de `style.transform` direct sur `cameraRef` soit la norme ici pour le touchMove).
- Assure-toi que la translation élastique se combine bien avec l'échelle ! La formule de visuel direct est généralement : `cameraRef.current.style.transform = 'scale(' + scale + ') translateX(' + (swipeOffset / scale) + 'px)'` ou similaire.

Une fois implémenté, mets à jour le `CODER_LOG.md` pour détailler ton intégration physique !
