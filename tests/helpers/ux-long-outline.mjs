// Fixture PDF autonome, ASCII et déterministe : 5 pages, 72 vraies entrées de sommaire.
// Régénération : node --input-type=module -e "import {writeFile} from 'node:fs/promises'; import {buildUxOutlinePdf} from './tests/helpers/ux-long-outline.mjs'; await writeFile('tests/fixtures/ux-long-outline.pdf', buildUxOutlinePdf());"
export const OUTLINE_COUNT = 72;
export const outlineTitle = n => `Section ${String(n).padStart(2, '0')} du document`;

export function buildUxOutlinePdf() {
  const pageCount = 5;
  const pageId = n => 4 + (n - 1) * 2;
  const outlineRoot = 14, firstItem = 15;
  const objects = [null,
    `<< /Type /Catalog /Pages 2 0 R /Outlines ${outlineRoot} 0 R >>`,
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${pageId(i + 1)} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let n = 1; n <= pageCount; n++) {
    const id = pageId(n);
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 504] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    const stream = `0 g BT /F1 28 Tf 30 260 Td (Document UX - page ${n}) Tj ET`;
    objects[id + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  objects[outlineRoot] = `<< /Type /Outlines /First ${firstItem} 0 R /Last ${firstItem + OUTLINE_COUNT - 1} 0 R /Count ${OUTLINE_COUNT} >>`;
  for (let n = 1; n <= OUTLINE_COUNT; n++) {
    const id = firstItem + n - 1;
    objects[id] = `<< /Title (${outlineTitle(n)}) /Parent ${outlineRoot} 0 R${n > 1 ? ` /Prev ${id - 1} 0 R` : ''}${n < OUTLINE_COUNT ? ` /Next ${id + 1} 0 R` : ''} /Dest [${pageId(1 + (n - 1) % pageCount)} 0 R /Fit] >>`;
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}
