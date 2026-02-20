# KNOWLEDGE_BASE.md

## Registre erreurs / solutions

### Format d'entrée

### [DATE] - [TITRE COURT]
- **Contexte :** [Quelle action a provoqué l'erreur]
- **Erreur :** [Message ou comportement observé]
- **Cause :** [Raison identifiée]
- **Solution :** [Ce qui a fonctionné]
- **Généralisation :** [Règle à retenir pour le futur]

---

## Entrées

### 2026-02-19 — Flash blanc/disparition du texte lors du zoom
- **Contexte :** L'utilisateur zoome sur le document. Pendant ~200ms, le texte disparaît puis réapparaît.
- **Erreur :** Flash visuel (canvas blanc) entre l'ancien et le nouveau rendu.
- **Cause :** react-pdf utilise `pageKey = \`${pageIndex}@${scale}/${rotate}\`` pour le composant Canvas. Changer `width` dans `<Page>` modifie le `scale` interne → `pageKey` change → Canvas est **unmount + remount** (destruction DOM complète). Pendant le remount, `Canvas.js` applique `visibility: hidden` jusqu'à la fin du rendu.
- **Solution :** Garder `<Page width={pageDimensions.width}>` constant et contrôler la résolution via `devicePixelRatio` uniquement. Le `pageKey` ne change jamais → le Canvas DOM persiste → pas de flash. Un clone canvas couvre le `visibility: hidden` pendant le re-rendu.
- **Généralisation :** Ne JAMAIS modifier dynamiquement `width` ou `scale` passés à `<Page>` de react-pdf. Utiliser `devicePixelRatio` pour contrôler la qualité sans remontage.

---

### 2026-02-19 — Sub-pixel shift ("glitch des lettres") pendant le zoom
- **Contexte :** Après le fix du flash, les lettres se décalaient légèrement (~0.5px) pendant la transition qualité.
- **Erreur :** Micro-mouvement du texte quand le snapshot est remplacé par le canvas HD.
- **Cause :** Le snapshot utilisait `drawImage` avec redimensionnement (source haute-res → destination basse-res), introduisant des artefacts d'anti-aliasing et des décalages sub-pixel.
- **Solution :** Avec l'approche DPR-based, le canvas a toujours les mêmes dimensions CSS (seul le nombre de pixels internes change). Le clone `drawImage(canvas, 0, 0)` copie pixel-pour-pixel, même `style.cssText` → zéro décalage.
- **Généralisation :** Un canvas snapshot doit copier les pixels sans redimensionnement (`drawImage(src, 0, 0)`) et conserver le même `style.cssText` pour éviter tout shift sub-pixel.

---

### 2026-02-19 — Version mismatch pdfjs-dist / react-pdf
- **Contexte :** Après installation de dépendances, le PDF ne charge plus.
- **Erreur :** `UnknownErrorException: The API version "5.4.296" does not match the Worker version "4.8.69"`
- **Cause :** `pdfjs-dist@4.8.69` était une dépendance directe dans `package.json`, mais `react-pdf@10.2.0` nécessite `pdfjs-dist@5.4.296`. npm ne dédupliquait pas car les versions majeurs différaient.
- **Solution :** Aligner `pdfjs-dist` dans `package.json` sur `"5.4.296"` et `npm install`. Vérifier avec `npm ls pdfjs-dist` qu'il n'y a qu'une seule version (deduped).
- **Généralisation :** Toujours vérifier la version de `pdfjs-dist` requise par `react-pdf` (`node_modules/react-pdf/package.json` → `peerDependencies`). Ne pas maintenir une version directe différente.

---

### 2026-02-19 — Liens internes PDF inactifs avec virtualisation
- **Contexte :** Clic sur un lien interne (table des matières) ne navigue pas vers la page cible.
- **Erreur :** Console : `An internal link leading to page 24 was clicked, but neither <Document> was provided with onItemClick nor it was able to find the page within itself.`
- **Cause :** Avec la virtualisation, seules les pages visibles sont dans le DOM. react-pdf cherche la page cible parmi ses enfants et ne la trouve pas.
- **Solution :** Ajouter `onItemClick` à `<Document>` qui appelle `scrollToPage(pageNumber)`. `scrollToPage` gère les deux modes : scroll DOM en continu, `setPageNumber` en paginé.
- **Généralisation :** Avec une virtualisation quelconque, toujours fournir `onItemClick` à `<Document>` pour gérer la navigation manuellement.

---

### 2026-02-19 — pdfjs-dist v5 API: `canvas` requis dans RenderParameters
- **Contexte :** Après upgrade vers `pdfjs-dist@5.4.296`, le build TypeScript échoue.
- **Erreur :** `error TS2345: Property 'canvas' is missing in type '{ canvasContext: ...; viewport: ...; }' is not assignable to parameter of type 'RenderParameters'.`
- **Cause :** `pdfjs-dist` v5 requiert le paramètre `canvas` dans `page.render()`, en plus de `canvasContext` et `viewport`.
- **Solution :** Ajouter `canvas` à l'appel : `page.render({ canvas, canvasContext: ctx, viewport })`.
- **Généralisation :** Lors d'une migration majeure de `pdfjs-dist`, vérifier les changements d'API dans `RenderParameters`.
