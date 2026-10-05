/* Babel GRC · entrada/salida: Excel (ExcelJS bajo demanda, con SRI), Markdown, CSV, JSON y copias de seguridad. */

let excelP = null;
function loadExcel() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (excelP) return excelP;
  excelP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/exceljs.min.js';
    if (DATA.vendor && DATA.vendor.exceljs) { s.integrity = DATA.vendor.exceljs; s.crossOrigin = 'anonymous'; }
    s.onload = () => (window.ExcelJS ? res(window.ExcelJS) : rej(new Error('La librería de Excel no se inicializó.')));
    s.onerror = () => { excelP = null; s.remove(); rej(new Error('No se pudo cargar la librería de Excel (vendor/exceljs.min.js). Si abriste el archivo localmente, usá «npm run serve» o la versión publicada.')); };
    document.head.appendChild(s);
  });
  return excelP;
}

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

/** Lee un .xlsx y devuelve { nombreHoja: [[celdas…]…] } con texto plano (nunca evalúa fórmulas). */
async function readWorkbook(buffer) {
  const X = await loadExcel();
  const wb = new X.Workbook();
  await wb.xlsx.load(buffer);
  const out = {};
  wb.eachSheet(ws => {
    const rows = [];
    const maxR = Math.min(ws.rowCount, 6000), maxC = Math.min(ws.columnCount, 40);
    for (let r = 1; r <= maxR; r++) {
      const row = ws.getRow(r), vals = [];
      for (let c = 1; c <= maxC; c++) vals.push(cellText(row.getCell(c).value).slice(0, 4000));
      rows.push(vals);
    }
    out[ws.name] = rows;
  });
  return out;
}

/** Escribe un .xlsx a partir de { hoja: matriz }. Neutraliza fórmulas en todas las celdas de texto. */
async function writeWorkbook(filename, sheets, order) {
  const X = await loadExcel();
  const wb = new X.Workbook();
  wb.creator = 'Babel GRC'; wb.created = new Date();
  (order || Object.keys(sheets)).forEach(name => {
    const rows = sheets[name]; if (!rows) return;
    const ws = wb.addWorksheet(name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    rows.forEach(r => ws.addRow(r.map(c => (typeof c === 'number' ? c : E.safeCell(c)))));
    if (name === 'Instrucciones') ws.getRow(1).font = { bold: true, size: 13 };
    else if (rows.length > 1) { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; }
    const widths = [];
    rows.slice(0, 200).forEach(r => r.forEach((c, i) => { widths[i] = Math.max(widths[i] || 8, Math.min(70, String(c === null || c === undefined ? '' : c).length + 2)); }));
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  });
  const buf = await wb.xlsx.writeBuffer();
  download(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/* ================= EXPORTAR ================= */
VIEWS.exportar = () => {
  const p = project();
  return head('Exportar y copias de seguridad', 'Todo se genera en tu navegador: nada sale del equipo.') +
    `<div class="grid g2">
      <div class="card"><h2>Proyecto${p ? ' · ' + esc(p.name) : ''}</h2>
        ${p ? `<div class="stack">
          <div class="card-head"><span>Libro Excel: resumen, declaración de aplicabilidad por marco, controles, plan y alertas</span><button class="btn primary sm" data-act="exp-xlsx" type="button">Excel</button></div>
          <div class="card-head"><span>Informe en Markdown</span><button class="btn sm" data-act="exp-md" type="button">Markdown</button></div>
          <div class="card-head"><span>Controles en CSV</span><button class="btn sm" data-act="exp-csv" type="button">CSV</button></div>
          <div class="card-head"><span>Proyecto en JSON (para compartir o versionar)</span><button class="btn sm" data-act="exp-json" type="button">JSON</button></div>
        </div>` : '<p class="muted">Abrí un proyecto para exportarlo.</p>'}
      </div>
      <div class="card"><h2>Copia de seguridad completa</h2>
        <p class="muted">Incluye todos los proyectos y los marcos importados de este navegador.</p>
        <div class="row"><button class="btn" data-act="backup" type="button">Descargar copia</button><button class="btn" data-act="import-project" type="button">Restaurar copia…</button></div>
        <div class="callout warn small">Restaurar suma los proyectos de la copia a los existentes; no borra nada.</div>
      </div>
    </div>`;
};
function exportName(ext) { const p = project(); return 'babel-grc-' + slug(p ? p.name : 'proyecto') + '-' + today() + '.' + ext; }
ACT['exp-md'] = () => { const p = project(); if (p) download(exportName('md'), E.markdownReport(S.model, p), 'text/markdown;charset=utf-8'); };
ACT['exp-csv'] = () => { const p = project(); if (p) download(exportName('csv'), '﻿' + E.csv(E.controlRows(S.model, p)), 'text/csv;charset=utf-8'); };
ACT['exp-json'] = () => { const p = project(); if (p) download(exportName('json'), JSON.stringify(Object.assign({ app: 'babel-grc', version: DATA.version }, p), null, 2), 'application/json'); };
ACT.backup = () => download('babel-grc-copia-' + today() + '.json', JSON.stringify({ app: 'babel-grc', version: DATA.version, exported: today(), projects: S.projects, frameworks: S.customs }, null, 2), 'application/json');
ACT['exp-xlsx'] = async () => {
  const p = project(); if (!p) return;
  const sheets = {}, order = ['Resumen'];
  const sum = [['Marco', 'Cumplimiento %', 'Requisitos aplicables', 'Cubiertos', 'Parciales', 'Brechas', 'Sin mapear', 'Excluidos']];
  scope(p).forEach(id => { const s = E.frameworkScore(S.model, p, id), c = s.counts; sum.push([fw(id).name, Math.round(s.score * 100), s.applicable, c.covered, c.partial, c.gap, c.unmapped, c.excluded]); });
  sum.push([], ['Proyecto', p.name], ['Generado', today()], ['Herramienta', 'Babel GRC v' + DATA.version]);
  sheets.Resumen = sum;
  scope(p).forEach(id => { const n = ('SoA ' + fw(id).shortName).slice(0, 31); sheets[n] = E.soaRows(S.model, p, id); order.push(n); });
  sheets.Controles = E.controlRows(S.model, p); order.push('Controles');
  sheets.Plan = [['#', 'Control', 'Título', 'Estado', 'Aporte (pp)', 'Responsable', 'Fecha objetivo']].concat(E.priorities(S.model, p).map((x, i) => { const s = E.ctrlState(p, x.control); return [i + 1, x.control, ctrl(x.control).title, E.STATUS_LABEL[x.status], +(x.gain * 100).toFixed(1), s.owner, s.due]; }));
  order.push('Plan');
  sheets.Alertas = [['Severidad', 'Regla', 'Objeto', 'Detalle']].concat(E.coherence(S.model, p).map(a => [a.severity, RULES[a.rule] || a.rule, a.control || (a.req ? req(a.fw, a.req).ref : fw(a.fw).shortName), a.message]));
  order.push('Alertas');
  try { toast('Generando Excel…'); await writeWorkbook(exportName('xlsx'), sheets, order); } catch (e) { toast(e.message); }
};
