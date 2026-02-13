# 📜 PROJECT MANIFESTO : LuminaPDF Native (White Paper)

**Date :** 23 Janvier 2026
**Version :** 1.0 (Release Candidate)
**Auteur :** AI Squad Project Manager

---

## 1. 💎 PHILOSOPHIE & PRINCIPE DE BASE

### L'État de l'Art
LuminaPDF part du constat que les lecteurs PDF traditionnels (basés sur le DOM ou des Canvas simples) échouent à offrir une fluidité parfaite ("Butter Smooth") lors du zoom et du pan.
*   **Approche :** Le document n'est pas une page, c'est un **Univers 2D Infini**.
*   **Technique :** Nous traitons le PDF comme une texture de jeu vidéo ("MegaTexture"). On ne rend jamais la page entière, mais uniquement les tuiles visibles à la résolution requise.
*   **Hybrid Zoom :** Découplage total entre la position (mise à jour à 120Hz via matrice GPU) et la netteté (mise à jour asynchrone via Thread Pool).

### 🧐 Critique & Contre-Argument
*   **Complexité vs Bénéfice :** Cette approche "Tiled" est extrêmement complexe à implémenter (coordonnées, raccords, threads). Pour un simple PDF A4 de 3 pages, c'est de l'"Over-Engineering". Un simple `<img>` suffirait.
*   **Risque Visuel :** Le découplage Géométrie/Qualité introduit un risque de "flou temporaire" si le moteur traîne. C'est un compromis assumé : "Mieux vaut être flou et fluide que net et saccadé". Est-ce vrai pour de la lecture de texte technique ? Pas sûr.
*   **Alternative :** Aurait-on pu utiliser Direct2D pour rendre les vecteurs PDF directement ? Oui, mais PDFium ne sort que du Bitmap. Il aurait fallu un parser PDF vectoriel (comme SkiaPDF), ce qui est un projet en soi.

---

## 2. ⚙️ ARCHITECTURE TECHNIQUE

### L'État de l'Art
*   **Stack :** C++20, WinUI 3, Direct2D, PDFium.
*   **Cerveau (TileManager) :** Algorithme "Ceiling LOD" qui garantit que si on est à zoom 1.1x, on charge la texture 2.0x (downscalée) pour une netteté parfaite.
*   **Moteur (TileRenderPool) :** 12 Threads workers indépendants. Architecture "Fire and Forget" avec promesses (`std::future`).
*   **Sécurité :** Utilisation de `std::jthread` (C++20) pour la gestion automatique du cycle de vie et `stop_token` pour l'annulation instantanée des jobs obsolètes.

### 🧐 Critique & Contre-Argument
*   **Consommation Mémoire :** Le "Ceiling LOD" est gourmand. Charger du 2.0x pour afficher du 1.1x gaspille 4x plus de pixels que nécessaire. Une approche "MipMap" ou un LOD continu aurait été plus économe, mais impossible avec le rendu vectoriel PDFium qui est lent à générer.
*   **Locking :** Le moteur utilise un `std::mutex` global pour le cache. À 120fps, si l'éviction prend du temps, on bloque le thread UI.
    *   *Amélioration possible :* Passer à une architecture "Double Buffered" pour le cache (un pour la lecture UI, un pour l'écriture Worker) pour supprimer le lock principal.

---

## 3. 🎨 EXPÉRIENCE UTILISATEUR (UX/UI)

### L'État de l'Art
*   **Smooth Zoom :** Interpolation "Cubic Ease-Out" sur 150ms. Donne une sensation physique de poids au document.
*   **High DPI :** Le moteur détecte le `RasterizationScale` de l'écran. Sur une Surface Pro (200%), il génère des tuiles 512x512 pour un espace logique de 256x256.
*   **Thèmes AVX2 :** Le mode "Sombre" n'est pas un filtre CSS post-process (qui rendrait le texte baveux). C'est une recolorisation pixel par pixel utilisant les instructions SIMD du CPU.

### 🧐 Critique & Contre-Argument
*   **Input Lag :** Le Smooth Zoom ajoute artificiellement de la latence (150ms). Pour un utilisateur "Power User" qui veut aller vite, ça peut être frustrant. Il faudrait une option pour désactiver l'inertie.
*   **Accessibilité :** La recolorisation AVX2 est rapide, mais elle ne gère pas intelligemment le contraste sémantique (ex: elle inverse aussi les images/photos, ce qui peut les rendre illisibles).
    *   *Amélioration possible :* Détecter si une zone est une image ou du texte via PDFium et appliquer la recolorisation sélectivement.

---

## 4. 🧠 GESTION DE LA MÉMOIRE (CACHE GPU)

### L'État de l'Art
*   **LRU (Least Recently Used) :** Cache de 800 tuiles (~200 MB). Quand c'est plein, on jette les plus vieilles.
*   **Grace Period :** Une tuile sortie de l'écran reste "en sursis" pendant 5 secondes. Si l'utilisateur scrolle un peu en arrière, elle est déjà là.
*   **Pression Mémoire :** Si le cache dépasse 75% du budget, la Grace Period est annulée pour libérer la VRAM agressivement.

### 🧐 Critique & Contre-Argument
*   **Fragmentations :** On alloue et désalloue des textures Direct2D en permanence. Sur une longue session, cela peut fragmenter la VRAM.
    *   *Amélioration possible :* Utiliser un "Texture Atlas" géant (une seule immense texture de 8000x8000) et y allouer des slots. C'est ce que font les moteurs de jeu (Unreal/Unity). Plus complexe à gérer, mais zéro fragmentation.
*   **Réactivité vs Mémoire :** 200 MB, c'est peu pour un GPU moderne (souvent 8 GB+). On pourrait être beaucoup plus agressif et cacher tout le document si la VRAM le permet. L'architecture actuelle est peut-être trop conservatrice pour un PC Desktop.

---

## 5. 🤖 LA MÉTHODOLOGIE "AI SQUAD"

### L'État de l'Art
*   **Séparation des Pouvoirs :** Architecte (Cerveau) ≠ Dev (Mains). Cela a évité que le Dev ne prenne des raccourcis mathématiques foireux.
*   **Traçabilité (.md) :** Tout est écrit. On peut rejouer le film du projet. Si un agent est remplacé, le nouveau lit le log et continue.
*   **Discipline :** L'interdiction faite aux Devs de modifier le Kanban a été cruciale pour garder le cap.

### 🧐 Critique & Contre-Argument
*   **Surohead de Communication :** Les agents passent beaucoup de temps à écrire des logs (`.md`) et à lire des prompts. Pour un "Hello World", c'est trop lourd.
*   **L'Illusion du Code :** Jusqu'à la vérification finale, les agents "pensaient" avoir écrit le code (ex: l'incident `TileManager.cpp`).
    *   *Leçon :* L'IA est excellente pour concevoir, mais a besoin d'un compilateur (ou d'un humain) comme "Reality Check" constant. Elle ne peut pas s'auto-valider fiablemet sans exécuter le code.

---

## 6. 🚀 ROADMAP & FUTUR

### Ce qui manque vraiment (Gap Analysis Final)
1.  **Selection de Texte :** Actuellement, c'est juste une image. On ne peut pas copier-coller.
    *   *Solution :* Extraire les quads de texte via PDFium et les superposer en couche invisible transparente pour permettre la sélection native Windows.
2.  **Accessibilité (Screen Reader) :** Le PDF est muet pour un lecteur d'écran.
    *   *Solution :* Utiliser l'API UI Automation de Windows pour exposer le texte extrait.
3.  **Support Tactile Avancé :** Le Pan/Zoom est basique. Il manque le "Fling" (inertie cinétique) et la rotation à deux doigts.

---

**Conclusion Générale :**
LuminaPDF Native est une réussite technique brute ("Brute Force Engineering"). Elle résout le problème de performance par la puissance de calcul. La prochaine étape n'est plus l'optimisation, mais l'enrichissement fonctionnel (Texte, Recherche, Annotation) pour en faire un outil de travail réel.
