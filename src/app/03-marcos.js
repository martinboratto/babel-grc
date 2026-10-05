/* Babel GRC · marcos normativos: alcance, importación (JSON/Excel), validación, editor de mapeos y exportación. */

function knownControlsFor(fwId) {
  const list = S.catalog.controls.slice();
  S.customs.forEach(f => { if (f.id !== fwId) (f.controls || []).forEach(c => list.push(c)); });
  return { controls: list };
}
function fwStats(f) {
  const ctrls = new Set(); let mapped = 0;
  f.requirements.forEach(r => {
    let eff = false;
    (r.mappings || []).forEach(m => { if (E.STRENGTH[m.strength] > 0) { ctrls.add(m.control); eff = true; } });
    if (eff) mapped++;
  });
  return { reqs: f.requirements.length, mapped, ctrls: ctrls.size, newCtrls: (f.controls || []).length };
}

VIEWS.marcos = () => {
  const p = project();
  const sc = p ? scope(p) : [];
  const cards = frameworks().map(f => {
    const st = fwStats(f), custom = isCustom(f.id);
    return `<div class="card">
      <div class="row spread"><h3 class="row">${dot(f.id)}${esc(f.name)}</h3><span class="chip ${custom ? 'accent' : ''}">${custom ? 'Importado' : 'Incluido'}</span></div>
      <p class="muted small">${esc(f.description || '')}</p>
      <dl class="kv">
        ${f.version ? `<dt>Versión</dt><dd>${esc(f.version)}</dd>` : ''}${f.publisher ? `<dt>Emisor</dt><dd>${esc(f.publisher)}</dd>` : ''}${f.jurisdiction ? `<dt>Ámbito</dt><dd>${esc(f.jurisdiction)}</dd>` : ''}
        <dt>Requisitos</dt><dd>${st.reqs} · ${st.mapped} mapeados${st.mapped < st.reqs ? ` · <span class="chip unmapped">${st.reqs - st.mapped} sin mapear</span>` : ''}</dd>
        <dt>Controles</dt><dd>${st.ctrls} distintos${st.newCtrls ? ` · ${st.newCtrls} propios del marco` : ''}</dd>
        ${f.url ? `<dt>Fuente</dt><dd><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.url.replace(/^https:\/\//, '').slice(0, 48))}</a></dd>` : ''}
        ${f.importedAt ? `<dt>Importado</dt><dd>${esc(f.importedAt)}</dd>` : ''}
      </dl>
      ${f.notice ? `<p class="faint small">${esc(f.notice)}</p>` : ''}
      ${p ? `<label class="check"><input type="checkbox" data-chg="fw-scope" data-fw="${esc(f.id)}"${sc.indexOf(f.id) >= 0 ? ' checked' : ''}>En el alcance de «${esc(p.name)}»</label>` : ''}
      <div class="row">
        <button class="btn sm" data-act="go" data-view="requisitos" data-fw="${esc(f.id)}" type="button">Ver requisitos</button>
        ${custom ? `<button class="btn sm" data-act="fw-map" data-fw="${esc(f.id)}" type="button">Editar mapeos</button>` : ''}
        <button class="btn sm" data-act="fw-json" data-fw="${esc(f.id)}" type="button">JSON</button>
        <button class="btn sm" data-act="fw-xlsx" data-fw="${esc(f.id)}" type="button">Excel</button>
        ${custom ? `<button class="btn sm danger" data-act="fw-del" data-fw="${esc(f.id)}" type="button">Eliminar</button>` : ''}
      </div>
    </div>`;
  }).join('');
  return head('Marcos normativos', 'Cada marco relaciona sus requisitos con el catálogo común de controles. Podés sumar un marco nuevo en cualquier momento: el cálculo, las equivalencias y el plan lo incorporan al instante.') +
    `<div class="grid g2 mb">
      <div class="card">
        <h2>Agregar un marco</h2>
        <div class="drop" id="fw-drop">
          <p><strong>Arrastrá aquí</strong> un archivo <code>.json</code> o <code>.xlsx</code> con el marco, o</p>
          <div class="mt-s"><button class="btn primary" data-act="fw-pick" type="button">Elegir archivo…</button></div>
        </div>
        <p class="small muted">El archivo se valida antes de agregarlo: ids únicos, controles existentes y fuerzas de enlace válidas. Queda guardado en este navegador.</p>
      </div>
      <div class="card">
        <h2>Plantillas</h2>
        <p class="muted">Completá la plantilla con los requisitos del marco y, para cada uno, los controles del catálogo que lo cubren con enlace total, parcial o de relación.</p>
        <div class="row">
          <button class="btn" data-act="tpl-xlsx" type="button">Plantilla Excel</button>
          <button class="btn" data-act="tpl-json" type="button">Plantilla JSON</button>
          <button class="btn" data-act="cat-csv" type="button">Catálogo de controles (CSV)</button>
        </div>
        <div class="callout small"><strong>Para que el marco quede disponible para todos</strong>, exportalo en JSON y subilo a la carpeta <code>frameworks/</code> del repositorio. GitHub Actions lo valida y publica la nueva versión del sitio.</div>
      </div>
    </div>
    <div class="grid gauto">${cards}</div>`;
};

CHG['fw-scope'] = el => {
  const p = project(); if (!p) return;
  const id = el.dataset.fw;
  p.scope = el.checked ? p.scope.filter(x => x !== id).concat(id) : p.scope.filter(x => x !== id);
  saveProjects(); render(); toast(el.checked ? 'Marco agregado al alcance' : 'Marco quitado del alcance');
};
ACT['fw-pick'] = () => pickFile('.json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', handleFrameworkFile);
ACT['fw-json'] = t => {
  const f = fw(t.dataset.fw); if (!f) return;
  const out = Object.assign({ $schema: '../schema/framework.schema.json' }, f);
  delete out.importedAt;
  download(f.id + '.json', JSON.stringify(out, null, 2) + '\n', 'application/json');
};
ACT['fw-xlsx'] = async t => {
  const f = fw(t.dataset.fw); if (!f) return;
  try { await writeWorkbook(f.id + '.xlsx', sheetsWithCatalog(E.frameworkToSheets(f))); }
  catch (e) { toast(e.message); }
};
ACT['fw-del'] = t => {
  const f = fw(t.dataset.fw); if (!f || !isCustom(f.id)) return;
  confirmBox('Eliminar marco', `Se eliminará «${esc(f.name)}» de este navegador. Los estados de los controles se conservan; las exclusiones de este marco dejan de usarse.`, 'Eliminar', () => {
    S.customs = S.customs.filter(x => x.id !== f.id); saveCustoms(); rebuild(); render(); toast('Marco eliminado');
  }, true);
};

/* ---------- plantillas ---------- */
function sheetsWithCatalog(sheets) {
  const out = Object.assign({}, sheets);
  const dom = {}; S.model.domains.forEach(d => { dom[d.id] = d.title; });
  out.Catalogo = [['id', 'dominio', 'titulo_dominio', 'titulo', 'descripcion']].concat(Array.from(S.model.controls.values()).map(c => [c.id, c.domain, dom[c.domain] || '', c.title, c.description || '']));
  out.Instrucciones = [
    ['Babel GRC · plantilla de marco normativo'],
    ['1. Hoja «Marco»: completá id (minúsculas, sin espacios, ej.: nis2), nombre y el resto de los datos.'],
    ['2. Hoja «Grupos» (opcional): capítulos o dominios del marco, para agrupar los requisitos.'],
    ['3. Hoja «Requisitos»: una fila por requisito. id único; referencia (artículo, cláusula…); grupo; título; descripción.'],
    ['   excluible: sí/no. Los requisitos no excluibles no pueden quedar fuera de la declaración de aplicabilidad.'],
    ['   controles_total / controles_parcial / controles_relacion: ids del catálogo separados por coma (ver hoja «Catalogo»).'],
    ['   total = el control cubre el requisito por completo; parcial = lo cubre en parte (máximo 50 % si solo hay parciales); relación = informativo, no cuenta.'],
    ['4. Hoja «Controles_nuevos» (opcional): controles que no existen en el catálogo. id con formato DOM-NN (ej.: AIG-01) y dominio de 2 a 5 letras.'],
    ['5. En Babel GRC: Marcos normativos › Agregar un marco › elegí este archivo. Se valida antes de agregarlo.'],
    ['Las hojas «Catalogo» e «Instrucciones» se ignoran al importar.']
  ];
  return out;
}
const TEMPLATE_SAMPLE = {
  id: 'mi-marco', name: 'Mi marco normativo', shortName: 'Mi marco', version: '2026', publisher: 'Organismo emisor', jurisdiction: 'Argentina',
  type: 'regulacion', color: '#C2410C', url: 'https://www.ejemplo.org/norma', description: 'Descripción breve del marco.', notice: 'Resúmenes propios; no reproduce el texto oficial.',
  groups: [{ id: 'G1', title: 'Capítulo 1 · Gobierno' }, { id: 'G2', title: 'Capítulo 2 · Operación' }],
  requirements: [
    { id: 'MM-1.1', ref: 'Art. 1.1', group: 'G1', title: 'Política de seguridad aprobada por el directorio', summary: 'Ejemplo: reemplazá estas filas por las tuyas.', excludable: false, mappings: [{ control: 'GOB-01', strength: 'full' }, { control: 'GOB-02', strength: 'partial' }] },
    { id: 'MM-2.1', ref: 'Art. 2.1', group: 'G2', title: 'Copias de seguridad probadas', summary: '', excludable: true, mappings: [{ control: 'OPE-06', strength: 'full' }, { control: 'CON-07', strength: 'related' }] }
  ]
};
ACT['tpl-xlsx'] = async () => {
  try { await writeWorkbook('plantilla-marco-babel-grc.xlsx', sheetsWithCatalog(E.frameworkToSheets(TEMPLATE_SAMPLE)), ['Instrucciones', 'Marco', 'Grupos', 'Requisitos', 'Controles_nuevos', 'Catalogo']); }
  catch (e) { toast(e.message); }
};
ACT['tpl-json'] = () => {
  const t = Object.assign({ $schema: '../schema/framework.schema.json' }, JSON.parse(JSON.stringify(TEMPLATE_SAMPLE)), {
    frameworkVersion: '1.0.0',
    controls: [{ id: 'XYZ-01', domain: 'XYZ', title: 'Control propio que no existe en el catálogo (opcional; borralo si no lo usás)', description: '' }]
  });
  t.requirements[1].mappings.push({ control: 'XYZ-01', strength: 'partial' });
  download('plantilla-marco.json', JSON.stringify(t, null, 2) + '\n', 'application/json');
};
ACT['cat-csv'] = () => {
  const dom = {}; S.model.domains.forEach(d => { dom[d.id] = d.title; });
  const rows = [['id', 'dominio', 'titulo_dominio', 'titulo', 'descripcion']].concat(Array.from(S.model.controls.values()).map(c => [c.id, c.domain, dom[c.domain] || '', c.title, c.description || '']));
  download('catalogo-controles.csv', '﻿' + E.csv(rows), 'text/csv;charset=utf-8');
};

/* ---------- importación ---------- */
async function handleFrameworkFile(file) {
  try {
    let parsed;
    if (/\.xlsx$/i.test(file.name)) parsed = E.frameworkFromSheets(await readWorkbook(await readFile(file, true)));
    else parsed = JSON.parse(await readFile(file));
    if (Array.isArray(parsed)) { const n = importFrameworkList(parsed); render(); toast(n + ' marco(s) importado(s)'); return; }
    if (parsed && Array.isArray(parsed.frameworks) && !parsed.requirements) { const n = importFrameworkList(parsed.frameworks); render(); toast(n + ' marco(s) importado(s)'); return; }
    reviewFramework(parsed);
  } catch (e) { toast('No se pudo leer el marco: ' + e.message); }
}

function reviewFramework(fwObj) {
  const builtinIds = S.builtins.map(f => f.id);
  const exists = !!(fwObj && isCustom(fwObj.id));
  const v = E.validateFramework(fwObj, knownControlsFor(fwObj && fwObj.id), { existingIds: builtinIds });
  const p = project();
  const list = (arr, max) => `<ul>${arr.slice(0, max).map(x => `<li>${esc(x)}</li>`).join('')}${arr.length > max ? `<li>… y ${arr.length - max} más</li>` : ''}</ul>`;
  openModal(`<div class="panel-head"><h2 id="modal-title">${v.ok ? 'Revisar marco' : 'El marco tiene errores'}</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
    ${fwObj && fwObj.name ? `<p><strong>${esc(fwObj.name)}</strong> <span class="ref">${esc(fwObj.id || '')}</span></p>` : ''}
    ${v.stats ? `<dl class="kv"><dt>Requisitos</dt><dd>${v.stats.requirements}</dd><dt>Mapeos</dt><dd>${v.stats.mappings}</dd><dt>Sin mapear</dt><dd>${v.stats.unmapped}</dd><dt>Controles nuevos</dt><dd>${v.stats.newControls}</dd></dl>` : ''}
    ${v.errors.length ? `<div class="callout bad"><strong>${v.errors.length} error(es)</strong>: corregilos en el archivo y volvé a importarlo.${list(v.errors, 30)}</div>` : ''}
    ${v.warnings.length ? `<div class="callout warn"><strong>${v.warnings.length} aviso(s)</strong>${list(v.warnings, 15)}</div>` : ''}
    ${v.ok && exists ? '<div class="callout">Ya existe un marco importado con este id: se reemplazará por esta versión.</div>' : ''}
    ${v.ok && p ? `<label class="check"><input type="checkbox" id="imp-scope" checked>Sumar al alcance de «${esc(p.name)}»</label>` : ''}
    <div class="row">${v.ok ? `<button class="btn primary" data-act="modal-ok" type="button">${exists ? 'Reemplazar marco' : 'Agregar marco'}</button>` : ''}<button class="btn" data-act="modal-close" type="button">${v.ok ? 'Cancelar' : 'Cerrar'}</button></div>`,
  v.ok ? () => {
    const box = document.getElementById('imp-scope');
    const addScope = box && box.checked;
    addFramework(fwObj);
    if (addScope && p && p.scope.indexOf(fwObj.id) < 0) { p.scope.push(fwObj.id); saveProjects(); }
    render(); toast('Marco «' + fwObj.name + '» agregado');
  } : null);
}
function addFramework(fwObj) {
  const n = E.normalizeFramework(fwObj);
  n.importedAt = today();
  S.customs = S.customs.filter(f => f.id !== n.id).concat(n);
  saveCustoms(); rebuild();
}
/** Importa sin preguntar los marcos válidos de una lista (copias de seguridad). Devuelve cuántos agregó. */
function importFrameworkList(list) {
  let n = 0;
  const builtinIds = S.builtins.map(f => f.id);
  list.slice(0, 50).forEach(f => {
    const v = E.validateFramework(f, knownControlsFor(f && f.id), { existingIds: builtinIds });
    if (v.ok) { addFramework(f); n++; }
  });
  return n;
}

/* ---------- editor de mapeos (marcos importados) ---------- */
let mapOnly = false;
ACT['fw-map'] = t => openMapEditor(t.dataset.fw);
function openMapEditor(fwId) {
  const f = S.customs.find(x => x.id === fwId); if (!f) return;
  const rows = f.requirements.map((r, i) => ({ r, i })).filter(x => !mapOnly || !(x.r.mappings || []).some(m => E.STRENGTH[m.strength] > 0));
  openDrawer(`<div class="panel-head"><div><span class="ref">${esc(f.id)}</span><h2 id="drawer-title" class="mt-s">Mapeos · ${esc(f.shortName)}</h2></div><button class="x" data-act="drawer-close" type="button" aria-label="Cerrar">×</button></div>
    <p class="muted small">Asociá cada requisito con controles del catálogo común. Total: el control lo cubre por completo. Parcial: lo cubre en parte. Relación: informativo, no cuenta para el cálculo.</p>
    <label class="check small"><input type="checkbox" data-chg="map-only" data-fw="${esc(f.id)}"${mapOnly ? ' checked' : ''}>Mostrar solo requisitos sin mapear</label>
    <datalist id="ctrl-list">${Array.from(S.model.controls.values()).map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</datalist>
    <div class="stack">${rows.slice(0, 300).map(({ r, i }) => `<div class="card flat"><div class="row"><span class="ref">${esc(r.ref)}</span><strong>${esc(r.title)}</strong></div>
        <div class="row">${(r.mappings || []).map((m, j) => `<span class="chip ${m.strength === 'full' ? 'ok' : m.strength === 'partial' ? 'warn' : ''}"><span class="mono">${esc(m.control)}</span> ${E.STRENGTH_LABEL[m.strength]}<button class="x small" data-act="map-del" data-fw="${esc(f.id)}" data-i="${i}" data-j="${j}" type="button" aria-label="Quitar ${esc(m.control)}">×</button></span>`).join('') || '<span class="chip unmapped">Sin mapear</span>'}</div>
        <div class="row"><label class="vh" for="mc-${i}">Control para ${esc(r.ref)}</label><input type="text" id="mc-${i}" list="ctrl-list" placeholder="Id de control (ej.: GOB-01)" maxlength="12">
          <label class="vh" for="ms-${i}">Fuerza del enlace</label><select id="ms-${i}"><option value="full">Total</option><option value="partial">Parcial</option><option value="related">Relación</option></select>
          <button class="btn sm" data-act="map-add" data-fw="${esc(f.id)}" data-i="${i}" type="button">Agregar</button></div>
      </div>`).join('') || '<p class="muted">No hay requisitos para mostrar.</p>'}${rows.length > 300 ? `<p class="muted small">Se muestran 300 de ${rows.length}. Para ediciones masivas usá la plantilla Excel.</p>` : ''}</div>`);
}
CHG['map-only'] = el => { mapOnly = el.checked; openMapEditor(el.dataset.fw); };
ACT['map-add'] = t => {
  const f = S.customs.find(x => x.id === t.dataset.fw); if (!f) return;
  const i = +t.dataset.i, r = f.requirements[i]; if (!r) return;
  const cid = document.getElementById('mc-' + i).value.trim().toUpperCase();
  const st = document.getElementById('ms-' + i).value;
  if (!S.model.controls.has(cid)) { toast('El control «' + cid + '» no existe.'); return; }
  r.mappings = (r.mappings || []).filter(m => m.control !== cid).concat({ control: cid, strength: st });
  saveCustoms(); rebuild(); render(); openMapEditor(f.id);
  const next = document.getElementById('mc-' + i); if (next) next.focus();
};
ACT['map-del'] = t => {
  const f = S.customs.find(x => x.id === t.dataset.fw); if (!f) return;
  const r = f.requirements[+t.dataset.i]; if (!r) return;
  r.mappings.splice(+t.dataset.j, 1);
  saveCustoms(); rebuild(); render(); openMapEditor(f.id);
};

/* ---------- arrastrar y soltar ---------- */
document.addEventListener('dragover', e => { const d = e.target.closest && e.target.closest('#fw-drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('#fw-drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', e => {
  const d = e.target.closest && e.target.closest('#fw-drop');
  if (!d) return;
  e.preventDefault(); d.classList.remove('over');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleFrameworkFile(file);
});
