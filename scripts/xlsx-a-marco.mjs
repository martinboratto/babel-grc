#!/usr/bin/env node
/**
 * Convierte una plantilla Excel de marco (hojas Marco, Grupos, Requisitos, Controles_nuevos) en frameworks/<id>.json.
 * Uso: npm run xlsx-a-marco -- ruta/al/marco.xlsx [--out frameworks] [--force]
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadSources } from './build.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = require(join(ROOT, 'src/engine/babel-engine.js'));
const ExcelJS = require('exceljs');

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : join(ROOT, 'frameworks'));
const force = args.includes('--force');
if (!file) { console.error('Uso: npm run xlsx-a-marco -- ruta/al/marco.xlsx [--out carpeta] [--force]'); process.exit(2); }

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return cellText(v.text);
    return '';
  }
  return String(v);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(resolve(file));
const sheets = {};
wb.eachSheet(ws => {
  const rows = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r), vals = [];
    for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(row.getCell(c).value));
    rows.push(vals);
  }
  sheets[ws.name] = rows;
});

const fw = E.frameworkFromSheets(sheets);
const { catalog, frameworks } = loadSources();
const others = frameworks.filter(f => f.data.id !== fw.id).map(f => f.data.id);
const v = E.validateFramework(fw, catalog, { existingIds: others });
v.warnings.forEach(w => console.warn('⚠ ' + w));
if (!v.ok) { v.errors.forEach(e => console.error('✗ ' + e)); process.exit(1); }

const out = join(outDir, fw.id + '.json');
if (existsSync(out) && !force) { console.error(`✗ ${out} ya existe. Usá --force para reemplazarlo.`); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const n = E.normalizeFramework(fw);
writeFileSync(out, JSON.stringify(Object.assign({ $schema: '../schema/framework.schema.json' }, n), null, 2) + '\n');
console.log(`✓ ${out} · ${v.stats.requirements} requisitos · ${v.stats.mappings} mapeos · ${v.stats.unmapped} sin mapear`);
