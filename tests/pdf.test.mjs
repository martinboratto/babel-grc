import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const P = require('../src/engine/babel-pdf.js');
const E = require('../src/engine/babel-engine.js');
const catalog = require('../catalog/controls.json');

async function pdfLines(path) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push(P.itemsToLines((await (await doc.getPage(i)).getTextContent()).items));
  await doc.destroy();
  return P.cleanPages(pages);
}

test('PDF ficticio: detecta los 8 artículos, sus capítulos y descarta índice, encabezados y referencias cruzadas', async () => {
  const lines = await pdfLines(new URL('./fixtures/norma-ficticia.pdf', import.meta.url));
  assert.ok(!lines.some(l => /\.{5,}/.test(l)), 'el índice no debe quedar');
  assert.ok(!lines.some(l => /^Boletín de Normas Ficticias/.test(l)), 'el encabezado repetido no debe quedar');
  const d = P.detect(lines);
  assert.equal(d.best, 'articulo');
  const reqs = P.segment(lines, 'articulo');
  assert.deepEqual(reqs.map(r => r.ref), ['Art. 1', 'Art. 2', 'Art. 3', 'Art. 4', 'Art. 5', 'Art. 6', 'Art. 7', 'Art. 8']);
  assert.equal(reqs[3].title, 'Copias de seguridad');
  assert.match(reqs[2].group, /Capítulo II · Gestión de la seguridad/);
  assert.match(reqs[2].text, /artículo 4, apartado 2/, 'la referencia cruzada queda como texto del artículo 3');
  assert.deepEqual(reqs.map(r => P.isNonRequirement(r.title)), [true, true, false, false, false, false, false, true]);
});

test('sugerencias: los artículos sustantivos apuntan a los controles esperados', async () => {
  const reqs = P.segment(await pdfLines(new URL('./fixtures/norma-ficticia.pdf', import.meta.url)), 'articulo');
  const sug = P.suggest(reqs, catalog.controls, catalog.domains);
  const top = i => sug[i].map(s => s.control);
  assert.ok(top(2).some(c => c.startsWith('RIE-')), 'riesgos');
  assert.equal(top(3)[0], 'OPE-06', 'copias de seguridad');
  assert.ok(top(4).some(c => c.startsWith('INC-')), 'incidentes');
  assert.ok(top(5).some(c => c.startsWith('ACC-')), 'accesos');
  assert.ok(top(6).some(c => c.startsWith('PRO-')), 'proveedores');
  assert.ok(sug.every(list => list.every(s => s.score > 0 && ['alta', 'media', 'baja'].includes(s.confidence))));
});

test('sugerencias en inglés usan el diccionario bilingüe', () => {
  const sug = P.suggest([{ title: 'Information backup', text: 'Backup copies of information shall be maintained and regularly tested.' }, { title: 'Incident response', text: 'Information security incidents shall be responded to in accordance with documented procedures.' }], catalog.controls, catalog.domains);
  assert.equal(sug[0][0].control, 'OPE-06');
  assert.ok(sug[1].some(s => s.control === 'INC-03'));
});

test('cláusulas numeradas: orden natural y prefijo del anexo', () => {
  const lines = ['4 Context', '4.2 Needs of interested parties', 'Text of 4.2.', '4.1 Understanding the context', 'Text of 4.1.', '10.1 Continual improvement', 'Text.',
    'Annex A', '(normative)', '5.1 Policies for information security', 'Control text.', '5.2 Roles and responsibilities', 'Control text.'];
  const reqs = P.segment(lines, 'clausula');
  assert.deepEqual(reqs.map(r => r.ref), ['4.1', '4.2', '10.1', 'A.5.1', 'A.5.2']);
  assert.match(reqs[3].group, /^Annex A/);
});

test('códigos de control con viñetas y grupos (estilo NIST CSF)', () => {
  const lines = ['• Organizational Context (GV.OC): The circumstances surrounding decisions', 'o GV.OC-01: The organizational mission is understood', 'and informs risk management', 'o GV.OC-02: Stakeholders are understood'];
  const reqs = P.segment(lines, 'codigo');
  assert.deepEqual(reqs.map(r => r.ref), ['GV.OC-01', 'GV.OC-02']);
  assert.equal(reqs[0].group, 'GV.OC · Organizational Context');
  assert.match(reqs[0].text, /informs risk/);
});

test('artículos: referencias cruzadas en mayúscula y saltos inverosímiles se descartan', () => {
  const lines = ['Artículo 1', 'Objeto', 'Texto.', 'Article 6(8), including the risk tolerance', 'Artículo 2', 'Ámbito', 'Texto que cita el', 'Artículo 47 de la Directiva 2014/65/UE', 'Artículo 3', 'Definiciones', 'Texto.', 'Article 290', 'del Tratado'];
  assert.deepEqual(P.segment(lines, 'articulo').map(r => r.ref), ['Art. 1', 'Art. 2', 'Art. 3']);
});

test('toFramework genera un marco válido, con ids únicos y extractos opcionales', () => {
  const reqs = [
    { ref: 'Art. 3', title: 'Gestión de riesgos', text: 'x'.repeat(1000), group: 'Capítulo II', include: true, mappings: [{ control: 'RIE-01', strength: 'full' }] },
    { ref: 'Art. 3', title: 'Duplicado', text: 'y', group: 'Capítulo II', include: true, mappings: [] },
    { ref: 'Art. 8', title: 'Entrada en vigor', text: 'z', group: '', include: false, mappings: [] }
  ];
  const fw = P.toFramework({ name: 'Norma NF 1/2026', fileName: 'norma.pdf' }, reqs, { excerpt: 400 });
  assert.equal(fw.id, 'norma-nf-1-2026');
  assert.equal(fw.requirements.length, 2);
  assert.notEqual(fw.requirements[0].id, fw.requirements[1].id);
  assert.equal(fw.requirements[0].summary.length, 400);
  assert.match(fw.notice, /derechos de autor/);
  assert.ok(E.validateFramework(fw, catalog).ok);
  assert.equal(P.toFramework({ name: 'X' }, reqs, { excerpt: 0 }).requirements[0].summary, '');
});

test('itemsToLines agrupa por renglón y respeta el orden de lectura', () => {
  const it = (s, x, y) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: s.length * 5 });
  assert.deepEqual(P.itemsToLines([it('mundo', 140, 700), it('Hola', 100, 700.5), it('Segunda', 100, 680)]), ['Hola mundo', 'Segunda']);
});
