import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// PDF de test à 5 pages (360×504) avec deux liens internes, générés sans dépendance :
//  - page 2 : lien dans le quart DROIT de la page  → page 5 (jamais la page voisine 3) ;
//  - page 4 : lien dans le quart GAUCHE de la page → page 1 (jamais la page voisine 3).
export const LINKS = { rightOn: 2, rightTarget: 5, leftOn: 4, leftTarget: 1 };

export function buildLinkedPdf() {
  const count = 5;
  const pageObj = n => 4 + (n - 1) * 3;        // objets : page, contenu, annotation (facultative)
  const objects = new Map();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${pageObj(i + 1)} 0 R`).join(' ')}] /Count ${count} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let n = 1; n <= count; n++) {
    const page = pageObj(n), content = page + 1, annot = page + 2;
    const link = n === LINKS.rightOn
      ? { rect: '250 200 340 300', target: LINKS.rightTarget }
      : n === LINKS.leftOn ? { rect: '20 200 110 300', target: LINKS.leftTarget } : null;
    objects.set(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 504] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R${link ? ` /Annots [${annot} 0 R]` : ''} >>`);
    const stream = `0.8 g 20 20 320 464 re S BT /F1 56 Tf 70 232 Td (Page ${n}) Tj ET`;
    objects.set(content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    if (link) objects.set(annot, `<< /Type /Annot /Subtype /Link /Rect [${link.rect}] /Border [0 0 0] /Dest [${pageObj(link.target)} 0 R /Fit] >>`);
  }
  const max = Math.max(...objects.keys());
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i <= max; i++) {
    if (!objects.has(i)) { objects.set(i, 'null'); }
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects.get(i)}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${max + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= max; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${max + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// Écrit le PDF dans un dossier temporaire neuf ; `cleanup()` le supprime.
export async function writeLinkedPdf() {
  const dir = await mkdtemp(join(tmpdir(), 'lumina-linked-pdf-'));
  const path = join(dir, 'reader-links-5-pages.pdf');
  await writeFile(path, buildLinkedPdf());
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
