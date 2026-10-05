/* Babel GRC · importación de marcos desde PDF: lectura con pdf.js, detección de requisitos y revisión de mapeos. */

const BP = window.BabelPdf;
const MAX_PDF_BYTES = 60 * 1024 * 1024;
let pdfP = null;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfP) return pdfP;
  pdfP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'vendor/pdf.min.mjs';
    if (DATA.vendor && DATA.vendor.pdfjs) { s.integrity = DATA.vendor.pdfjs; s.crossOrigin = 'anonymous'; }
    s.onload = () => {
      if (!window.pdfjsLib) { pdfP = null; rej(new Error('El lector de PDF no se inicializó.')); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.mjs';
      res(window.pdfjsLib);
    };
    s.onerror = () => { pdfP = null; s.remove(); rej(new Error('No se pudo cargar el lector de PDF (vendor/pdf.min.mjs). Si abriste el archivo localmente, usá «npm run serve» o la versión publicada.')); };
    document.head.appendChild(s);
  });
  return pdfP;
}

/** Extrae las líneas de texto de cada página. */
async function extractPdf(file, onPage) {
  const lib = await loadPdfJs();
  const buf = await readFile(file, true, MAX_PDF_BYTES);
  const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, cMapUrl: 'vendor/cmaps/', cMapPacked: true, disableFontFace: true, stopAtErrors: false }).promise;
  let title = '';
  try { const m = await doc.getMetadata(); title = (m && m.info && m.info.Title) || ''; } catch (e) { /* sin metadatos */ }
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(BP.itemsToLines(tc.items));
    page.cleanup();
    if (onPage && (i % 5 === 0 || i === doc.numPages)) onPage(i, doc.numPages);
  }
  await doc.destroy();
  return { pages, title: String(title).trim(), numPages: pages.length };
}

/* ---------- estado del asistente ---------- */
let W = null;

function uniqueFwId(id) {
  const taken = new Set(S.builtins.map(f => f.id).concat(S.customs.map(f => f.id)));
  const base = (id || 'marco-pdf').slice(0, 40);
  let out = base, n = 2;
  while (taken.has(out)) out = base + '-' + (n++);
  return out;
}
function applyPattern(id) {
  W.pattern = id;
  const reqs = BP.segment(W.lines, id);
  const sug = BP.suggest(reqs, Array.from(S.model.controls.values()), S.model.domains);
  W.reqs = reqs.map((r, i) => {
    const formal = BP.isNonRequirement(r.title);
    return Object.assign(r, {
      include: !formal, formal, excludable: true, sug: sug[i],
      mappings: formal ? [] : sug[i].filter(s => s.confidence !== 'baja').map(s => ({ control: s.control, strength: s.strength }))
    });
  });
  W.limit = 100; W.q = ''; W.onlyUnmapped = false;
}

async function startPdfWizard(file) {
  openModal(`<div class="panel-head"><h2 id="modal-title">Leyendo el PDF…</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
    <p id="pdf-progress" class="muted">Cargando el lector de PDF…</p>`);
  try {
    const r = await extractPdf(file, (i, n) => { const el = document.getElementById('pdf-progress'); if (el) el.textContent = `Página ${i} de ${n}…`; });
    const lines = BP.cleanPages(r.pages);
    if (lines.join('').replace(/\s/g, '').length < 200) {
      openModal(`<div class="panel-head"><h2 id="modal-title">El PDF no tiene texto</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
        <p>«${esc(file.name)}» parece un documento escaneado: no contiene texto seleccionable. Pasalo por un reconocimiento de texto (OCR) y volvé a importarlo, o cargá el marco con la plantilla Excel.</p>
        <div class="row"><button class="btn primary" data-act="modal-close" type="button">Cerrar</button></div>`);
      return;
    }
    const base = file.name.replace(/\.pdf$/i, '').replace(/_+/g, ' ').trim();
    const name = base;   // los metadatos de título de los PDF suelen ser poco fiables («Publications Office», «Microsoft Word…»)
    const detection = BP.detect(lines);
    W = {
      fileName: file.name, numPages: r.numPages, lines, detection, step: 1, excerpt: true,
      meta: { name: name.slice(0, 160), shortName: name.slice(0, 40), id: uniqueFwId(BP.slug(name)), version: '', publisher: '', jurisdiction: '', url: '', color: '#8A5CF5' }
    };
    applyPattern(detection.best || 'articulo');
    renderWizard(true);
  } catch (e) {
    openModal(`<div class="panel-head"><h2 id="modal-title">No se pudo leer el PDF</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
      <p>${esc(e && e.message ? e.message : String(e))}</p><div class="row"><button class="btn primary" data-act="modal-close" type="button">Cerrar</button></div>`);
  }
}

/* ---------- vistas del asistente ---------- */
function wizardHtml() {
  const included = W.reqs.filter(r => r.include);
  const mapped = included.filter(r => r.mappings.some(m => m.strength !== 'related')).length;
  const steps = `<div class="row small"><span class="chip ${W.step === 1 ? 'accent' : ''}">1 · Datos y detección</span><span class="chip ${W.step === 2 ? 'accent' : ''}">2 · Revisar requisitos y controles</span></div>`;
  const headHtml = `<div class="panel-head"><div><h2 id="modal-title">Importar marco desde PDF</h2><p class="muted small">${esc(W.fileName)} · ${W.numPages} páginas</p></div><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>${steps}`;
  if (W.step === 1) {
    const m = W.meta;
    const field = (k, label, extra) => `<label class="field">${label}<input type="text" id="pw-${k}" value="${esc(m[k])}" data-inp="pw-meta" data-key="${k}" ${extra || ''}></label>`;
    return headHtml + `
      <div class="grid g2">
        ${field('name', 'Nombre del marco', 'maxlength="160"')}
        ${field('shortName', 'Nombre corto', 'maxlength="40"')}
        ${field('id', 'Identificador (minúsculas, sin espacios)', 'maxlength="49"')}
        ${field('version', 'Versión o fecha', 'maxlength="120"')}
        ${field('publisher', 'Emisor', 'maxlength="120"')}
        ${field('jurisdiction', 'Ámbito', 'maxlength="120"')}
      </div>
      ${field('url', 'Fuente (https://…, opcional)', 'maxlength="500"')}
      <h3>¿Cómo están organizados los requisitos en el documento?</h3>
      <div class="stack">${W.detection.patterns.map(p => `<label class="check card flat"><input type="radio" name="pw-pattern" value="${p.id}" data-chg="pw-pattern"${p.id === W.pattern ? ' checked' : ''}${p.count ? '' : ' disabled'}>
          <span class="grow"><strong>${esc(p.label)}</strong> · ${p.count} detectado(s)${p.id === W.detection.best ? ' <span class="chip ok">recomendado</span>' : ''}
          ${p.sample.length ? `<br><span class="small muted">${p.sample.map(esc).join(' · ')}</span>` : ''}</span></label>`).join('')}</div>
      <div class="row"><button class="btn primary" data-act="pw-next" type="button"${W.reqs.length ? '' : ' disabled'}>Revisar ${W.reqs.length} requisitos →</button><button class="btn" data-act="modal-close" type="button">Cancelar</button></div>`;
  }
  const q = W.q.toLowerCase();
  const rows = W.reqs.map((r, i) => ({ r, i })).filter(({ r }) => (!q || (r.ref + ' ' + r.title + ' ' + r.group).toLowerCase().includes(q)) && (!W.onlyUnmapped || !r.mappings.some(m => m.strength !== 'related')));
  const ctrlTitle = id => (ctrl(id) || {}).title || '';
  return headHtml + `
    <div class="callout small">Revisá los requisitos detectados y los controles sugeridos. Las sugerencias se calculan por similitud de texto con el catálogo: <strong>confirmalas o corregilas</strong>. Hacé clic en un control para alternar entre enlace total y parcial; con × lo quitás; con «+» sumás otra sugerencia.</div>
    <div class="row"><span class="chip accent">${included.length} de ${W.reqs.length} incluidos</span><span class="chip ${mapped === included.length ? 'ok' : 'warn'}">${mapped} con controles</span>
      <label class="vh" for="pw-q">Buscar</label><input type="search" id="pw-q" placeholder="Buscar requisito…" value="${esc(W.q)}" data-inp="pw-q">
      <label class="check small"><input type="checkbox" data-chg="pw-only"${W.onlyUnmapped ? ' checked' : ''}>Solo sin controles</label>
      <button class="btn sm" data-act="pw-all" data-v="1" type="button">Incluir todos</button><button class="btn sm" data-act="pw-all" data-v="0" type="button">Excluir todos</button></div>
    <datalist id="pw-ctrls">${Array.from(S.model.controls.values()).map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</datalist>
    <div class="tbl-wrap"><table><thead><tr><th>Incluir</th><th>Ref.</th><th>Requisito</th><th>Controles</th></tr></thead><tbody>
      ${rows.slice(0, W.limit).map(({ r, i }) => `<tr>
        <td><label class="vh" for="pw-inc-${i}">Incluir ${esc(r.ref)}</label><input type="checkbox" id="pw-inc-${i}" data-chg="pw-inc" data-i="${i}"${r.include ? ' checked' : ''}></td>
        <td class="ref">${esc(r.ref)}</td>
        <td><label class="vh" for="pw-t-${i}">Título de ${esc(r.ref)}</label><input type="text" id="pw-t-${i}" value="${esc(r.title)}" maxlength="300" data-inp="pw-title" data-i="${i}">
          <div class="sub">${r.formal ? '<span class="chip na">Artículo de forma: no incluido</span> ' : ''}${r.group ? esc(r.group) + ' · ' : ''}${esc(r.text.slice(0, 160))}${r.text.length > 160 ? '…' : ''}</div></td>
        <td><div class="row">${r.mappings.map((m, j) => {
            const s = (r.sug || []).find(x => x.control === m.control);
            return `<span class="chip ${m.strength === 'full' ? 'ok' : 'warn'}"><button class="linkish small" data-act="pw-str" data-i="${i}" data-j="${j}" type="button" title="${esc(ctrlTitle(m.control))}${s ? ' · similitud ' + Math.round(s.score * 100) + ' %' : ''} · clic para cambiar a ${m.strength === 'full' ? 'parcial' : 'total'}"><span class="mono">${esc(m.control)}</span> ${m.strength === 'full' ? 'Total' : 'Parcial'}</button><button class="x small" data-act="pw-del" data-i="${i}" data-j="${j}" type="button" aria-label="Quitar ${esc(m.control)}">×</button></span>`;
          }).join('')}${(r.sug || []).filter(s => !r.mappings.some(m => m.control === s.control)).map(s => `<button class="chip outline" data-act="pw-add" data-i="${i}" data-c="${esc(s.control)}" type="button" title="${esc(ctrlTitle(s.control))} · similitud ${Math.round(s.score * 100)} %">+ ${esc(s.control)}</button>`).join('')}</div>
          <div class="row mt-s"><label class="vh" for="pw-c-${i}">Agregar control a ${esc(r.ref)}</label><input type="text" id="pw-c-${i}" list="pw-ctrls" placeholder="Agregar control…" maxlength="12"><button class="btn sm" data-act="pw-add" data-i="${i}" type="button">Agregar</button></div></td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty">Sin resultados.</td></tr>'}
    </tbody></table></div>
    ${rows.length > W.limit ? `<button class="btn sm" data-act="pw-more" type="button">Mostrar ${Math.min(100, rows.length - W.limit)} más (de ${rows.length})</button>` : ''}
    <label class="check small"><input type="checkbox" data-chg="pw-excerpt"${W.excerpt ? ' checked' : ''}>Guardar un extracto del texto de cada requisito (400 caracteres) como resumen. Desmarcalo si el documento tiene derechos de autor y pensás compartir el marco.</label>
    <div class="row"><button class="btn" data-act="pw-back" type="button">← Volver</button><button class="btn primary" data-act="pw-create" type="button"${included.length ? '' : ' disabled'}>Crear marco con ${included.length} requisitos</button></div>`;
}
function renderWizard(first) {
  if (first) { openModal(wizardHtml(), null, true); return; }
  const panel = document.querySelector('#modal .panel');
  if (!panel || !W) return;
  const top = panel.scrollTop;
  const a = document.activeElement;
  const keep = a && a.id && panel.contains(a) ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  panel.innerHTML = wizardHtml();
  post(panel);
  panel.scrollTop = top;
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch (e) { /* no aplica */ } } }
}

/* ---------- eventos ---------- */
INP['pw-meta'] = el => { if (W) W.meta[el.dataset.key] = el.value; };
CHG['pw-pattern'] = el => { applyPattern(el.value); renderWizard(); };
ACT['pw-next'] = () => {
  const id = (W.meta.id || '').trim();
  W.meta.id = id;
  if (!/^[a-z0-9][a-z0-9._-]{1,48}$/.test(id)) { toast('El identificador debe tener minúsculas, números, punto o guion (2 a 49 caracteres).'); document.getElementById('pw-id').focus(); return; }
  if (S.builtins.some(f => f.id === id)) { toast('Ese identificador ya lo usa un marco incluido. Elegí otro.'); document.getElementById('pw-id').focus(); return; }
  if (!W.meta.name.trim()) { toast('Indicá el nombre del marco.'); document.getElementById('pw-name').focus(); return; }
  W.step = 2; renderWizard();
  const panel = document.querySelector('#modal .panel'); if (panel) panel.scrollTop = 0;
};
ACT['pw-back'] = () => { W.step = 1; renderWizard(); };
ACT['pw-more'] = () => { W.limit += 100; renderWizard(); };
INP['pw-q'] = debounce(el => { if (!W) return; W.q = el.value; W.limit = 100; renderWizard(); }, 200);
CHG['pw-only'] = el => { W.onlyUnmapped = el.checked; W.limit = 100; renderWizard(); };
CHG['pw-inc'] = el => { W.reqs[+el.dataset.i].include = el.checked; renderWizard(); };
CHG['pw-excerpt'] = el => { W.excerpt = el.checked; };
INP['pw-title'] = el => { if (W) W.reqs[+el.dataset.i].title = el.value; };
ACT['pw-all'] = t => { W.reqs.forEach(r => { r.include = t.dataset.v === '1'; }); renderWizard(); };
ACT['pw-str'] = t => { const m = W.reqs[+t.dataset.i].mappings[+t.dataset.j]; m.strength = m.strength === 'full' ? 'partial' : 'full'; renderWizard(); };
ACT['pw-del'] = t => { W.reqs[+t.dataset.i].mappings.splice(+t.dataset.j, 1); renderWizard(); };
ACT['pw-add'] = t => {
  const r = W.reqs[+t.dataset.i];
  const input = document.getElementById('pw-c-' + t.dataset.i);
  const id = (t.dataset.c || (input ? input.value : '')).trim().toUpperCase();
  if (!S.model.controls.has(id)) { toast('El control «' + id + '» no existe.'); return; }
  if (!r.mappings.some(m => m.control === id)) r.mappings.push({ control: id, strength: 'partial' });
  renderWizard();
};
ACT['pw-create'] = () => {
  const fwObj = BP.toFramework(Object.assign({}, W.meta, { fileName: W.fileName }), W.reqs, { excerpt: W.excerpt ? 400 : 0 });
  W = null;
  reviewFramework(fwObj);
};
