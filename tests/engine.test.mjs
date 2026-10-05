import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../src/engine/babel-engine.js');

const catalog = {
  domains: [{ id: 'AAA', title: 'Dominio A' }],
  controls: ['AAA-01', 'AAA-02', 'AAA-03', 'AAA-04'].map(id => ({ id, domain: 'AAA', title: 'Control ' + id }))
};
const fwA = {
  id: 'marco-a', name: 'Marco A', shortName: 'A', groups: [{ id: 'g', title: 'G' }],
  requirements: [
    { id: 'A1', ref: '1', group: 'g', title: 'Total', excludable: false, mappings: [{ control: 'AAA-01', strength: 'full' }] },
    { id: 'A2', ref: '2', group: 'g', title: 'Solo parciales', mappings: [{ control: 'AAA-02', strength: 'partial' }, { control: 'AAA-03', strength: 'partial' }] },
    { id: 'A3', ref: '3', group: 'g', title: 'Mixto', mappings: [{ control: 'AAA-01', strength: 'full' }, { control: 'AAA-02', strength: 'partial' }] },
    { id: 'A4', ref: '4', group: 'g', title: 'Solo relación', mappings: [{ control: 'AAA-04', strength: 'related' }] }
  ]
};
const fwB = {
  id: 'marco-b', name: 'Marco B', shortName: 'B',
  requirements: [
    { id: 'B1', title: 'Equivalente a A1', mappings: [{ control: 'AAA-01', strength: 'full' }] },
    { id: 'B2', title: 'Parcial con A2', mappings: [{ control: 'AAA-02', strength: 'full' }] },
    { id: 'A1', title: 'Mismo id que en A (otro marco)', mappings: [{ control: 'AAA-04', strength: 'related' }] }
  ]
};
const model = () => E.buildModel(catalog, [fwA, fwB]);
const proj = (controls, exclusions) => Object.assign(E.newProject('t', ['marco-a', 'marco-b']), { controls: controls || {}, exclusions: exclusions || {} });

test('cobertura: enlace total sigue el estado del control', () => {
  const m = model();
  assert.equal(E.requirementCoverage(m, proj(), 'marco-a', 'A1').state, 'gap');
  assert.equal(E.requirementCoverage(m, proj({ 'AAA-01': { status: 'partial' } }), 'marco-a', 'A1').value, 0.5);
  const c = E.requirementCoverage(m, proj({ 'AAA-01': { status: 'implemented' } }), 'marco-a', 'A1');
  assert.equal(c.value, 1); assert.equal(c.state, 'covered');
});

test('cobertura: solo enlaces parciales no supera el 50 %', () => {
  const c = E.requirementCoverage(model(), proj({ 'AAA-02': { status: 'implemented' }, 'AAA-03': { status: 'implemented' } }), 'marco-a', 'A2');
  assert.equal(c.value, 0.5); assert.equal(c.state, 'partial'); assert.equal(c.cap, 0.5);
});

test('cobertura: media ponderada con enlaces mixtos', () => {
  // w = 1 y 0,5; solo el total implantado → 1·1 / 1,5 = 0,6667
  const c = E.requirementCoverage(model(), proj({ 'AAA-01': { status: 'implemented' } }), 'marco-a', 'A3');
  assert.equal(c.value, 0.6667);
});

test('cobertura: solo relación queda sin mapear; no aplica vale 0', () => {
  const m = model();
  assert.equal(E.requirementCoverage(m, proj({ 'AAA-04': { status: 'implemented' } }), 'marco-a', 'A4').state, 'unmapped');
  assert.equal(E.requirementCoverage(m, proj({ 'AAA-01': { status: 'na' } }), 'marco-a', 'A1').value, 0);
});

test('requisitos con el mismo id en marcos distintos no colisionan', () => {
  const m = model();
  assert.equal(m.requirements.size, 7);
  assert.equal(E.requirementCoverage(m, proj({ 'AAA-01': { status: 'implemented' } }), 'marco-b', 'A1').state, 'unmapped');
  assert.equal(E.requirementCoverage(m, proj({ 'AAA-01': { status: 'implemented' } }), 'marco-a', 'A1').state, 'covered');
});

test('puntuación del marco: promedio de aplicables; excluidos fuera', () => {
  const m = model();
  const p = proj({ 'AAA-01': { status: 'implemented' } }, { 'marco-a': { A2: 'No aplica a la entidad' } });
  const s = E.frameworkScore(m, p, 'marco-a');
  assert.equal(s.applicable, 3); assert.equal(s.counts.excluded, 1); assert.equal(s.counts.unmapped, 1);
  assert.equal(s.score, Math.round((1 + 0.6667 + 0) / 3 * 10000) / 10000);
});

test('prioridades: ordena por aporte y excluye implantados y no aplica', () => {
  const m = model();
  const pr = E.priorities(m, proj({ 'AAA-03': { status: 'na' } }));
  assert.equal(pr[0].control, 'AAA-01');
  assert.ok(pr.every(x => x.control !== 'AAA-03'));
  assert.ok(pr.every((x, i) => i === 0 || pr[i - 1].gain >= x.gain));
  assert.ok(E.priorities(m, proj({ 'AAA-01': { status: 'implemented' } })).every(x => x.control !== 'AAA-01'));
});

test('equivalencias: fuerza mínima entre enlaces y vía', () => {
  const m = model();
  const e1 = E.equivalences(m, 'marco-a', 'A1');
  assert.deepEqual(e1.map(e => [e.fw, e.req, e.strength]), [['marco-b', 'B1', 'full']]);
  const e2 = E.equivalences(m, 'marco-a', 'A2');
  assert.equal(e2[0].req, 'B2'); assert.equal(e2[0].strength, 'partial'); assert.deepEqual(e2[0].via, ['AAA-02']);
  const e4 = E.equivalences(m, 'marco-a', 'A4');
  assert.equal(e4[0].strength, 'related');
});

test('solapamiento entre 0 y 1', () => {
  const m = model();
  const ab = E.overlap(m, 'marco-a', 'marco-b');
  assert.ok(ab > 0 && ab <= 1);
  assert.equal(E.overlap(m, 'marco-a', 'no-existe'), 0);
});

test('coherencia: reglas principales', () => {
  const m = model();
  const p = proj({
    'AAA-01': { status: 'implemented', reviewed: '2020-01-01' },
    'AAA-02': { status: 'na' },
    'AAA-03': { status: 'pending', due: '2020-01-01' }
  }, { 'marco-a': { A1: '', A3: 'motivo' } });
  const rules = new Set(E.coherence(m, p, Date.parse('2026-10-05')).map(a => a.rule));
  ['sin-evidencia', 'sin-responsable', 'revision-vencida', 'na-requerido', 'plazo-vencido', 'exclusion-no-permitida', 'exclusion-sin-justificar', 'exclusion-contradictoria', 'sin-mapear']
    .forEach(r => assert.ok(rules.has(r), 'falta la regla ' + r));
});

test('validación: detecta errores típicos de un marco nuevo', () => {
  const bad = { id: 'Mal Id', name: '', requirements: [
    { id: 'X', title: 'a', mappings: [{ control: 'NOPE-01', strength: 'full' }] },
    { id: 'X', title: '', mappings: [{ control: 'AAA-01', strength: 'total' }] }
  ] };
  const v = E.validateFramework(bad, catalog);
  assert.equal(v.ok, false);
  const txt = v.errors.join('\n');
  ['«id»', '«name»', 'NOPE-01', 'repetido', 'falta «title»', 'fuerza «total»'].forEach(k => assert.ok(txt.includes(k), 'falta error: ' + k));
});

test('validación: controles nuevos del marco y avisos de requisitos sin mapear', () => {
  const fw = { id: 'nuevo', name: 'Nuevo', controls: [{ id: 'NEW-01', domain: 'NEW', title: 'Propio' }],
    requirements: [{ id: 'N1', title: 'Usa control propio', mappings: [{ control: 'NEW-01', strength: 'full' }] }, { id: 'N2', title: 'Sin mapear' }] };
  const v = E.validateFramework(fw, catalog, { existingIds: ['marco-a'] });
  assert.equal(v.ok, true);
  assert.equal(v.stats.unmapped, 1);
  assert.ok(v.warnings.some(w => w.includes('sin mapear')));
  assert.equal(E.validateFramework(Object.assign({}, fw, { id: 'marco-a' }), catalog, { existingIds: ['marco-a'] }).ok, false);
  const m = E.buildModel(catalog, [fwA, E.normalizeFramework(fw)]);
  assert.ok(m.controls.has('NEW-01'));
  assert.ok(m.domains.some(d => d.id === 'NEW'));
});

test('plantilla: hojas ↔ marco ida y vuelta', () => {
  const sheets = E.frameworkToSheets(fwA);
  const back = E.frameworkFromSheets(sheets);
  assert.equal(back.id, fwA.id);
  assert.equal(back.requirements.length, fwA.requirements.length);
  assert.deepEqual(back.requirements[2].mappings, fwA.requirements[2].mappings);
  assert.equal(back.requirements[0].excludable, false);
  assert.equal(back.requirements[1].excludable, true);
  assert.ok(E.validateFramework(back, catalog).ok);
});

test('plantilla: encabezados con mayúsculas y acentos, ids en minúscula', () => {
  const fw = E.frameworkFromSheets({
    MARCO: [['Clave', 'Valor'], ['ID', 'x-1'], ['Nombre', 'X']],
    Requisitos: [['ID', 'Título', 'Excluible', 'Controles total'], ['R1', 'Uno', 'No', 'aaa-01; aaa-02'], ['', '', '', '']]
  });
  assert.equal(fw.id, 'x-1');
  assert.equal(fw.requirements.length, 1);
  assert.deepEqual(fw.requirements[0].mappings.map(m => m.control), ['AAA-01', 'AAA-02']);
  assert.equal(fw.requirements[0].excludable, false);
});

test('exportación: neutraliza fórmulas y escapa CSV', () => {
  assert.equal(E.safeCell('=1+1'), "'=1+1");
  assert.equal(E.safeCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(E.safeCell('normal'), 'normal');
  assert.equal(E.csv([['a,b', '"x"', '-2']]), '"a,b","""x""",\'-2');
});

test('estado de controles: valores desconocidos caen en «pendiente» y no hereda del prototipo', () => {
  const p = proj({ 'AAA-01': { status: 'hackeado' } });
  assert.equal(E.ctrlState(p, 'AAA-01').status, 'pending');
  assert.equal(E.ctrlState(p, 'toString').status, 'pending');
  assert.equal(E.isExcluded(p, 'constructor', 'x'), false);
});

test('informe Markdown incluye marcos y prioridades', () => {
  const md = E.markdownReport(model(), proj(), Date.parse('2026-10-05'));
  assert.ok(md.includes('# Informe de cumplimiento'));
  assert.ok(md.includes('Marco A'));
  assert.ok(md.includes('AAA-01'));
});

test('foto: contenido, sello SHA-256 y verificación', async () => {
  const m = model();
  const p = proj({ 'AAA-01': { status: 'implemented', owner: 'Ana', evidence: 'Acta' } }, { 'marco-a': { A2: 'No aplica' } });
  const meta = { period: '3.er trimestre 2026', from: '2026-07-01', to: '2026-09-30', author: 'Martín', note: 'Cierre', takenAt: '2026-10-05T12:00:00.000Z', appVersion: '1.1.0' };
  const c = E.snapshot(m, p, meta);
  assert.equal(c.format, 'babel-grc-foto');
  assert.deepEqual(c.project.scope, ['marco-a', 'marco-b']);
  assert.equal(c.results['marco-a'].counts.excluded, 1);
  assert.deepEqual(c.results['marco-a'].requirements.A1, [1, 'covered']);
  assert.equal(c.state.controls['AAA-01'].owner, 'Ana');
  assert.deepEqual(E.snapshot(m, p, meta), c, 'determinista con la misma fecha');
  const file = await E.sealSnapshot(c);
  assert.match(file.sha256, /^[0-9a-f]{64}$/);
  const roundTrip = JSON.parse(JSON.stringify(file));
  assert.equal((await E.verifySnapshot(roundTrip)).ok, true);
  roundTrip.content.results['marco-a'].score = 1;
  const bad = await E.verifySnapshot(roundTrip);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /modificó/);
  assert.equal((await E.verifySnapshot({ hola: 1 })).ok, false);
});

test('foto: comparación entre dos momentos', () => {
  const m = model();
  const meta = { takenAt: '2026-10-05T12:00:00.000Z' };
  const a = E.snapshot(m, proj(), meta);
  const b = E.snapshot(m, proj({ 'AAA-01': { status: 'implemented' } }), meta);
  const d = E.compareSnapshots(a, b);
  const fa = d.frameworks.find(x => x.fw === 'marco-a');
  assert.ok(fa.delta > 0 && fa.improved === 2 && fa.worsened === 0);
  assert.deepEqual(d.controls, [{ control: 'AAA-01', before: 'pending', after: 'implemented' }]);
});
