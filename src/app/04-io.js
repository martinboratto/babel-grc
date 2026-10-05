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
let lastFoto = null;   // { sha256 } de la última foto exportada en esta sesión
const fotoForm = { period: '', author: '', from: '', to: '', note: '' };   // se conserva al volver a dibujar
VIEWS.exportar = () => {
  const p = project();
  const foto = p ? `<div class="card mb">
      <h2>Foto del período</h2>
      <p class="muted">Congela el estado del proyecto en este momento como prueba de un período: cumplimiento de cada marco, estado de cada requisito y control, exclusiones y alertas. Se descargan dos archivos con el mismo <strong>código de verificación</strong> (SHA-256): un Excel para leer y presentar, y un JSON que permite comprobar más adelante que la foto no se modificó.</p>
      <div class="grid g2">
        <label class="field">Período (obligatorio)<input type="text" id="ft-period" maxlength="120" placeholder="Ej.: 3.er trimestre 2026 · Auditoría interna" value="${esc(fotoForm.period)}" data-inp="foto-form" data-key="period"></label>
        <label class="field">Elaborado por<input type="text" id="ft-author" maxlength="120" placeholder="Nombre y cargo" value="${esc(fotoForm.author)}" data-inp="foto-form" data-key="author"></label>
        <label class="field">Desde<input type="date" id="ft-from" value="${esc(fotoForm.from)}" data-inp="foto-form" data-chg="foto-form" data-key="from"></label>
        <label class="field">Hasta<input type="date" id="ft-to" value="${esc(fotoForm.to)}" data-inp="foto-form" data-chg="foto-form" data-key="to"></label>
      </div>
      <label class="field">Nota (opcional)<textarea id="ft-note" maxlength="2000" placeholder="Contexto: motivo de la foto, alcance, observaciones…" data-inp="foto-form" data-key="note">${esc(fotoForm.note)}</textarea></label>
      <div class="row"><button class="btn primary" data-act="foto-export" type="button">Exportar foto (Excel + JSON)</button><button class="btn" data-act="foto-verify" type="button">Verificar una foto…</button></div>
      ${lastFoto ? `<div class="callout ok small" id="ft-last"><strong>Foto exportada.</strong> Código de verificación:<div class="row mt-s"><code class="mono" id="ft-hash">${esc(lastFoto.sha256)}</code><button class="btn sm" data-act="foto-copy" type="button">Copiar código</button></div>
        <p class="mt-s">Guardá este código también fuera de los archivos (en el acta, un correo o un ticket). Así la prueba no depende solo de los archivos.</p></div>` : ''}
    </div>` : '';
  return head('Exportar', 'Informes, fotos del período y copias de seguridad. Todo se genera en tu navegador: nada sale del equipo.') + foto +
    `<div class="grid g2">
      <div class="card"><h2>Informes del estado actual${p ? ' · ' + esc(p.name) : ''}</h2>
        ${p ? `<div class="stack">
          <div class="card-head"><span>Libro Excel: resumen, declaración de aplicabilidad por marco, controles, plan y alertas</span><button class="btn sm" data-act="exp-xlsx" type="button">Excel</button></div>
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

/** Hojas del informe del estado actual (se reutilizan en la foto). */
function reportSheets(p) {
  const sheets = {}, order = ['Resumen'];
  const sum = [['Marco', 'Cumplimiento %', 'Requisitos aplicables', 'Cubiertos', 'Parciales', 'Brechas', 'Sin mapear', 'Excluidos']];
  scope(p).forEach(id => { const s = E.frameworkScore(S.model, p, id), c = s.counts; sum.push([fw(id).name, Math.round(s.score * 1000) / 10, s.applicable, c.covered, c.partial, c.gap, c.unmapped, c.excluded]); });
  sum.push([], ['Proyecto', p.name], ['Generado', today()], ['Herramienta', 'Babel GRC v' + DATA.version]);
  sheets.Resumen = sum;
  scope(p).forEach(id => { const n = ('SoA ' + fw(id).shortName).slice(0, 31); sheets[n] = E.soaRows(S.model, p, id); order.push(n); });
  sheets.Controles = E.controlRows(S.model, p); order.push('Controles');
  sheets.Plan = [['#', 'Control', 'Título', 'Estado', 'Aporte (pp)', 'Responsable', 'Fecha objetivo']].concat(E.priorities(S.model, p).map((x, i) => { const s = E.ctrlState(p, x.control); return [i + 1, x.control, ctrl(x.control).title, E.STATUS_LABEL[x.status], +(x.gain * 100).toFixed(1), s.owner, s.due]; }));
  order.push('Plan');
  sheets.Alertas = [['Severidad', 'Regla', 'Objeto', 'Detalle']].concat(E.coherence(S.model, p).map(a => [a.severity, RULES[a.rule] || a.rule, a.control || (a.req ? req(a.fw, a.req).ref : fw(a.fw).shortName), a.message]));
  order.push('Alertas');
  return { sheets, order };
}
ACT['exp-xlsx'] = async () => {
  const p = project(); if (!p) return;
  const { sheets, order } = reportSheets(p);
  try { toast('Generando Excel…'); await writeWorkbook(exportName('xlsx'), sheets, order); } catch (e) { toast(e.message); }
};

/* ---------- foto del período ---------- */
const fmtDateTime = iso => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' }); };
const pctx = v => (v === null || v === undefined ? '—' : (Math.round(v * 1000) / 10).toLocaleString('es-AR') + ' %');

INP['foto-form'] = el => { fotoForm[el.dataset.key] = el.value; };
CHG['foto-form'] = INP['foto-form'];
ACT['foto-export'] = async () => {
  const p = project(); if (!p) return;
  const val = id => document.getElementById(id).value.trim();
  const meta = { period: val('ft-period'), author: val('ft-author'), from: val('ft-from'), to: val('ft-to'), note: val('ft-note') };
  if (!meta.period) { toast('Indicá el período de la foto.'); document.getElementById('ft-period').focus(); return; }
  if (meta.from && meta.to && meta.from > meta.to) { toast('La fecha «Desde» es posterior a «Hasta».'); return; }
  if (!scope(p).length) { toast('El proyecto no tiene marcos en el alcance.'); return; }
  try {
    const now = new Date();
    const content = E.snapshot(S.model, p, Object.assign({ takenAt: now.toISOString(), appVersion: DATA.version }, meta));
    const file = await E.sealSnapshot(content);
    const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const base = 'babel-grc-foto-' + slug(p.name) + '-' + slug(meta.period) + '-' + stamp;
    const { sheets, order } = reportSheets(p);
    const head = [
      ['Foto del período · Babel GRC'], [],
      ['Proyecto', p.name], ['Período', meta.period], ['Desde', meta.from || '—'], ['Hasta', meta.to || '—'],
      ['Fecha y hora de la foto', fmtDateTime(content.takenAt) + ' (UTC ' + content.takenAt + ')'],
      ['Elaborado por', meta.author || '—'], ['Nota', meta.note || '—'], ['Versión de Babel GRC', DATA.version], [],
      ['Marco', 'Versión', 'Versión del archivo del marco', 'Cumplimiento %', 'Requisitos aplicables']
    ].concat(content.frameworks.map(f => [f.name, f.version, f.frameworkVersion, Math.round(content.results[f.id].score * 1000) / 10, content.results[f.id].applicable]))
      .concat([[], ['Alertas de coherencia', 'Alta: ' + content.alerts.alta + ' · Media: ' + content.alerts.media + ' · Baja: ' + content.alerts.baja], [],
        ['Código de verificación (SHA-256)', file.sha256],
        ['Cómo verificar', 'En Babel GRC › Exportar › «Verificar una foto», elegí el archivo ' + base + '.json. Debe indicar «Foto íntegra» y el mismo código que figura aquí.']]);
    sheets.Foto = head;
    await writeWorkbook(base + '.xlsx', sheets, ['Foto'].concat(order));
    download(base + '.json', JSON.stringify(file, null, 2) + '\n', 'application/json');
    lastFoto = { sha256: file.sha256 };
    render();
    toast('Foto exportada: Excel y JSON');
  } catch (e) { toast('No se pudo exportar la foto: ' + e.message); }
};
ACT['foto-copy'] = async () => {
  try { await navigator.clipboard.writeText(lastFoto.sha256); toast('Código copiado'); }
  catch (e) { const c = document.getElementById('ft-hash'); if (c) { const r = document.createRange(); r.selectNodeContents(c); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } toast('Seleccioná el código y copialo con Ctrl+C'); }
};

let fotoA = null;   // última foto verificada, para comparar con otra
ACT['foto-verify'] = () => pickFile('.json,application/json', async f => {
  try {
    const v = await E.verifySnapshot(JSON.parse(await readFile(f)));
    if (!v.content) { toast(v.reason); return; }
    fotoA = v.ok ? v.content : null;
    showFoto(v, f.name);
  } catch (e) { toast('No se pudo leer la foto: ' + e.message); }
});
ACT['foto-compare'] = () => pickFile('.json,application/json', async f => {
  try {
    const v = await E.verifySnapshot(JSON.parse(await readFile(f)));
    if (!v.ok) { toast(v.reason || 'La segunda foto no es válida.'); return; }
    const [a, b] = [fotoA, v.content].sort((x, y) => (x.takenAt < y.takenAt ? -1 : 1));
    showComparison(a, b, `${a.period.label} → ${b.period.label}`);
  } catch (e) { toast('No se pudo leer la foto: ' + e.message); }
});

function fotoRows(c) {
  return `<dl class="kv">
    <dt>Proyecto</dt><dd>${esc(c.project.name)}</dd>
    <dt>Período</dt><dd>${esc(c.period.label)}${c.period.from || c.period.to ? ` · ${esc(c.period.from || '…')} a ${esc(c.period.to || '…')}` : ''}</dd>
    <dt>Fecha de la foto</dt><dd>${esc(fmtDateTime(c.takenAt))}</dd>
    ${c.author ? `<dt>Elaborado por</dt><dd>${esc(c.author)}</dd>` : ''}${c.note ? `<dt>Nota</dt><dd>${esc(c.note)}</dd>` : ''}
    <dt>Versión</dt><dd>Babel GRC ${esc(c.appVersion)}</dd>
  </dl>`;
}
function compareTable(d, names, labels) {
  const fwName = id => (names[id] || (fw(id) ? fw(id).name : id));
  return `<div class="tbl-wrap"><table><thead><tr><th>Marco</th><th class="right">${esc(labels[0])}</th><th class="right">${esc(labels[1])}</th><th class="right">Variación</th><th class="right">Mejoran / empeoran</th></tr></thead><tbody>
    ${d.frameworks.map(x => `<tr><td>${esc(fwName(x.fw))}</td><td class="right num">${pctx(x.before)}</td><td class="right num">${pctx(x.after)}</td>
      <td class="right num nowrap">${x.delta === null ? '—' : `<span class="chip ${x.delta > 0 ? 'ok' : x.delta < 0 ? 'bad' : ''}">${x.delta > 0 ? '+' : ''}${(Math.round(x.delta * 1000) / 10).toLocaleString('es-AR')} pp</span>`}</td>
      <td class="right num">${x.delta === null ? '—' : x.improved + ' / ' + x.worsened}</td></tr>`).join('')}
    </tbody></table></div>
    ${d.controls.length ? `<details><summary>${d.controls.length} control(es) cambiaron de estado</summary><div class="tbl-wrap mt-s"><table><tbody>${d.controls.slice(0, 200).map(c => `<tr><td class="ref">${esc(c.control)}</td><td>${esc((ctrl(c.control) || {}).title || '')}</td><td class="nowrap">${stChip(c.before)} → ${stChip(c.after)}</td></tr>`).join('')}</tbody></table></div></details>` : '<p class="muted small">Ningún control cambió de estado.</p>'}`;
}
function showFoto(v, fileName) {
  const c = v.content, p = project();
  const names = {}; (c.frameworks || []).forEach(f => { names[f.id] = f.name; });
  let cmp = '';
  if (v.ok && p) {
    const now = E.snapshot(S.model, p, { takenAt: new Date().toISOString(), appVersion: DATA.version });
    cmp = `<h3>Comparación con el estado actual de «${esc(p.name)}»</h3>${p.name !== c.project.name ? '<div class="callout warn small">El proyecto abierto tiene otro nombre que el de la foto: verificá que estés comparando el proyecto correcto.</div>' : ''}${compareTable(E.compareSnapshots(c, now), names, ['En la foto', 'Actual'])}`;
  }
  openModal(`<div class="panel-head"><h2 id="modal-title">${v.ok ? '✓ Foto íntegra' : '✗ Foto alterada'}</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
    <div class="callout ${v.ok ? 'ok' : 'bad'} small">${v.ok ? 'El contenido coincide con su código de verificación: no se modificó desde que se exportó.' : esc(v.reason)}<div class="mt-s"><span class="muted">Archivo:</span> ${esc(fileName)}<br><span class="muted">Código:</span> <code class="mono">${esc(v.sha256)}</code></div></div>
    ${fotoRows(c)}
    ${v.ok ? `<h3>Cumplimiento en la foto</h3><div class="tbl-wrap"><table><tbody>${(c.frameworks || []).map(f => `<tr><td>${esc(f.name)}</td><td class="right num">${pctx(c.results[f.id] && c.results[f.id].score)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${cmp}
    <div class="row">${v.ok ? '<button class="btn" data-act="foto-compare" type="button">Comparar con otra foto…</button>' : ''}<button class="btn primary" data-act="modal-close" type="button">Cerrar</button></div>`);
}
function showComparison(a, b, title) {
  const names = {}; (a.frameworks || []).concat(b.frameworks || []).forEach(f => { names[f.id] = f.name; });
  openModal(`<div class="panel-head"><h2 id="modal-title">Comparación de fotos</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
    <p><strong>${esc(title)}</strong></p>
    <div class="grid g2"><div class="card flat"><h4>Anterior</h4>${fotoRows(a)}</div><div class="card flat"><h4>Posterior</h4>${fotoRows(b)}</div></div>
    ${compareTable(E.compareSnapshots(a, b), names, [a.period.label || 'Anterior', b.period.label || 'Posterior'])}
    <div class="row"><button class="btn primary" data-act="modal-close" type="button">Cerrar</button></div>`);
}
