import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadSources, validateAll } from '../scripts/build.mjs';

const require = createRequire(import.meta.url);
const E = require('../src/engine/babel-engine.js');
const src = loadSources();
const byId = Object.fromEntries(src.frameworks.map(f => [f.data.id, f.data]));
const example = JSON.parse(readFileSync(new URL('../src/data/ejemplo.json', import.meta.url), 'utf8'));

test('catálogo y marcos del repositorio son válidos', () => {
  const { errors } = validateAll(src);
  assert.deepEqual(errors, []);
});

test('ISO/IEC 27001:2022: 25 requisitos de cláusulas (no excluibles) y 93 controles del Anexo A', () => {
  const iso = byId['iso27001-2022'];
  const clauses = iso.requirements.filter(r => !r.ref.startsWith('A.'));
  const annex = iso.requirements.filter(r => r.ref.startsWith('A.'));
  assert.equal(clauses.length, 25);
  assert.equal(annex.length, 93);
  assert.ok(clauses.every(r => r.excludable === false));
  assert.deepEqual(['A5', 'A6', 'A7', 'A8'].map(g => annex.filter(r => r.group === g).length), [37, 8, 14, 34]);
});

test('DORA: capítulos II a VI y requisitos TLPT excluibles con nota', () => {
  const d = byId.dora;
  assert.deepEqual(d.groups.map(g => g.id), ['II', 'III', 'IV', 'V', 'VI']);
  d.groups.forEach(g => assert.ok(d.requirements.some(r => r.group === g.id), 'grupo vacío ' + g.id));
  const tlpt = d.requirements.filter(r => /^Art\. 2[67]\./.test(r.ref));
  assert.ok(tlpt.length >= 6 && tlpt.every(r => r.excludable && r.note));
});

test('todos los requisitos incluidos tienen al menos un enlace con peso', () => {
  Object.values(byId).forEach(f => f.requirements.forEach(r => {
    assert.ok((r.mappings || []).some(m => m.strength !== 'related'), `${f.id} ${r.id} sin enlace efectivo`);
  }));
});

test('todos los controles del catálogo se usan con peso en algún marco', () => {
  const used = new Set();
  Object.values(byId).forEach(f => f.requirements.forEach(r => r.mappings.forEach(m => { if (m.strength !== 'related') used.add(m.control); })));
  const unused = src.catalog.controls.map(c => c.id).filter(id => !used.has(id));
  assert.deepEqual(unused, []);
});

test('el caso de ejemplo usa controles, marcos y requisitos existentes', () => {
  const m = E.buildModel(src.catalog, Object.values(byId));
  Object.keys(example.controls).forEach(id => assert.ok(m.controls.has(id), 'control inexistente ' + id));
  example.scope.forEach(id => assert.ok(m.frameworks.has(id)));
  Object.keys(example.exclusions).forEach(f => Object.keys(example.exclusions[f]).forEach(r => assert.ok(m.requirements.has(E.rkey(f, r)), 'requisito inexistente ' + r)));
  const s = E.frameworkScore(m, example, 'iso27001-2022');
  assert.ok(s.score > 0.5 && s.score < 1);
});

test('equivalencias ISO ↔ DORA: la gestión de cambios es equivalente total', () => {
  const m = E.buildModel(src.catalog, Object.values(byId));
  const eq = E.equivalences(m, 'dora', 'DORA-9.4.e');
  assert.ok(eq.some(e => e.req === 'ISO27001-A8.32' && e.strength === 'full'));
});
