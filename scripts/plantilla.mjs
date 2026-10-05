#!/usr/bin/env node
/** Genera templates/plantilla-marco.xlsx (la misma plantilla que se descarga desde la aplicación). */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadSources } from './build.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = require(join(ROOT, 'src/engine/babel-engine.js'));
const ExcelJS = require('exceljs');

const { catalog } = loadSources();
const dom = Object.fromEntries(catalog.domains.map(d => [d.id, d.title]));
const sample = {
  id: 'mi-marco', name: 'Mi marco normativo', shortName: 'Mi marco', version: '2026', publisher: 'Organismo emisor', jurisdiction: 'Argentina',
  type: 'regulacion', color: '#C2410C', url: 'https://www.ejemplo.org/norma', description: 'Descripción breve del marco.', notice: 'Resúmenes propios; no reproduce el texto oficial.',
  groups: [{ id: 'G1', title: 'Capítulo 1 · Gobierno' }, { id: 'G2', title: 'Capítulo 2 · Operación' }],
  requirements: [
    { id: 'MM-1.1', ref: 'Art. 1.1', group: 'G1', title: 'Política de seguridad aprobada por el directorio', summary: 'Ejemplo: reemplazá estas filas por las tuyas.', excludable: false, mappings: [{ control: 'GOB-01', strength: 'full' }, { control: 'GOB-02', strength: 'partial' }] },
    { id: 'MM-2.1', ref: 'Art. 2.1', group: 'G2', title: 'Copias de seguridad probadas', summary: '', excludable: true, mappings: [{ control: 'OPE-06', strength: 'full' }, { control: 'CON-07', strength: 'related' }] }
  ]
};
const sheets = E.frameworkToSheets(sample);
sheets.Instrucciones = [
  ['Babel GRC · plantilla de marco normativo'],
  ['1. Hoja «Marco»: completá id (minúsculas, sin espacios, ej.: nis2), nombre y el resto de los datos.'],
  ['2. Hoja «Grupos» (opcional): capítulos o dominios del marco, para agrupar los requisitos.'],
  ['3. Hoja «Requisitos»: una fila por requisito. id único; referencia (artículo, cláusula…); grupo; título; descripción.'],
  ['   excluible: sí/no. Los requisitos no excluibles no pueden quedar fuera de la declaración de aplicabilidad.'],
  ['   controles_total / controles_parcial / controles_relacion: ids del catálogo separados por coma (ver hoja «Catalogo»).'],
  ['   total = el control cubre el requisito por completo; parcial = lo cubre en parte (máximo 50 % si solo hay parciales); relación = informativo, no cuenta.'],
  ['4. Hoja «Controles_nuevos» (opcional): controles que no existen en el catálogo. id con formato DOM-NN (ej.: AIG-01) y dominio de 2 a 5 letras.'],
  ['5. En Babel GRC: Marcos normativos › Agregar un marco › elegí este archivo. O en el repositorio: npm run xlsx-a-marco -- este-archivo.xlsx'],
  ['Las hojas «Catalogo» e «Instrucciones» se ignoran al importar.']
];
sheets.Catalogo = [['id', 'dominio', 'titulo_dominio', 'titulo', 'descripcion']].concat(catalog.controls.map(c => [c.id, c.domain, dom[c.domain] || '', c.title, c.description || '']));

const wb = new ExcelJS.Workbook();
wb.creator = 'Babel GRC';
wb.created = new Date('2026-01-01T00:00:00Z');
wb.modified = wb.created;
['Instrucciones', 'Marco', 'Grupos', 'Requisitos', 'Controles_nuevos', 'Catalogo'].forEach(name => {
  const ws = wb.addWorksheet(name);
  sheets[name].forEach(r => ws.addRow(r));
  ws.getRow(1).font = name === 'Instrucciones' ? { bold: true, size: 13 } : { bold: true };
  if (name !== 'Instrucciones') ws.views = [{ state: 'frozen', ySplit: 1 }];
  const widths = [];
  sheets[name].forEach(r => r.forEach((c, i) => { widths[i] = Math.max(widths[i] || 8, Math.min(70, String(c).length + 2)); }));
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
});
mkdirSync(join(ROOT, 'templates'), { recursive: true });
await wb.xlsx.writeFile(join(ROOT, 'templates/plantilla-marco.xlsx'));
console.log('✓ templates/plantilla-marco.xlsx');
