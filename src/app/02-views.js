/* Babel GRC · vistas de trabajo: inicio, resumen, requisitos, controles, equivalencias, brechas y plan. */

/* ================= INICIO ================= */
VIEWS.inicio = () => {
  const fws = frameworks();
  const nReq = fws.reduce((a, f) => a + f.requirements.length, 0);
  const projects = S.projects.map(p => {
    const sc = scope(p);
    return `<div class="card">
      <div class="row spread"><h3>${esc(p.name)}</h3>${p.id === S.activeId ? '<span class="chip accent">Abierto</span>' : ''}</div>
      <div class="stack">${sc.length ? sc.map(id => { const s = E.frameworkScore(S.model, p, id); return `<div class="row spread small"><span class="row">${dot(id)}${esc(fw(id).shortName)}</span><span class="num">${pct(s.score)}</span></div>${bar(s.score)}`; }).join('') : '<p class="muted small">Sin marcos en el alcance.</p>'}</div>
      <div class="row">
        ${p.id === S.activeId ? `<button class="btn primary sm" data-act="go" data-view="resumen" type="button">Ver resumen</button>` : `<button class="btn primary sm" data-act="open-project" data-id="${esc(p.id)}" type="button">Abrir</button>`}
        <button class="btn sm" data-act="rename-project" data-id="${esc(p.id)}" type="button">Renombrar</button>
        <button class="btn sm" data-act="dup-project" data-id="${esc(p.id)}" type="button">Duplicar</button>
        <button class="btn sm danger" data-act="del-project" data-id="${esc(p.id)}" type="button">Eliminar</button>
      </div></div>`;
  }).join('');
  return head('Babel GRC', 'Un catálogo común de controles para traducir entre marcos normativos. Registrás el estado de cada control una sola vez y la herramienta calcula el cumplimiento de cada marco, las equivalencias, las brechas y el orden de implantación.') +
    `<div class="grid g3 mb">
      <div class="card"><h4>Marcos disponibles</h4><div class="score"><span class="big">${fws.length}</span><span class="muted">${S.customs.length} importado(s)</span></div><button class="btn sm" data-act="go" data-view="marcos" type="button">Gestionar marcos</button></div>
      <div class="card"><h4>Requisitos</h4><div class="score"><span class="big">${nReq}</span><span class="muted">en todos los marcos</span></div></div>
      <div class="card"><h4>Controles unificados</h4><div class="score"><span class="big">${S.model.controls.size}</span><span class="muted">en ${S.model.domains.length} dominios</span></div></div>
    </div>
    <div class="grid g2">
      <div class="card">
        <h2>Nuevo proyecto</h2>
        <label class="field">Nombre<input type="text" id="np-name" maxlength="120" placeholder="Ej.: Entidad XYZ · 2026"></label>
        <div class="stack" role="group" aria-label="Marcos en el alcance"><span class="small muted">Marcos en el alcance</span>
          ${fws.map(f => `<label class="check"><input type="checkbox" class="np-fw" value="${esc(f.id)}" checked>${dot(f.id)}${esc(f.name)}</label>`).join('')}
        </div>
        <div class="row"><button class="btn primary" data-act="new-project" type="button">Crear proyecto</button></div>
      </div>
      <div class="card">
        <h2>Empezar rápido</h2>
        <p class="muted">El caso de ejemplo es una entidad de pago ficticia con ISO/IEC 27001 y DORA en el alcance, controles en distintos estados y exclusiones justificadas.</p>
        <div class="row"><button class="btn" data-act="load-example" type="button">Cargar caso de ejemplo</button>
        <button class="btn" data-act="import-project" type="button">Importar proyecto (JSON)</button></div>
        <div class="callout small">Los datos se guardan solo en este navegador. Exportá una copia de seguridad desde <strong>Exportar</strong> antes de borrar datos del navegador o cambiar de equipo.</div>
      </div>
    </div>
    <h2 class="mt mb">Proyectos</h2>
    ${S.projects.length ? `<div class="grid gauto">${projects}</div>` : '<div class="card empty">Todavía no hay proyectos.</div>'}`;
};

ACT['new-project'] = () => {
  const name = document.getElementById('np-name').value.trim() || 'Proyecto ' + (S.projects.length + 1);
  const sc = Array.from(document.querySelectorAll('.np-fw:checked')).map(x => x.value);
  const p = E.newProject(name, sc);
  S.projects.push(p); S.activeId = p.id; saveProjects();
  toast('Proyecto creado'); go('resumen');
};
ACT['open-project'] = t => { S.activeId = t.dataset.id; saveProjects(); go('resumen'); };
ACT['dup-project'] = t => {
  const src = S.projects.find(p => p.id === t.dataset.id); if (!src) return;
  const p = cleanProject(JSON.parse(JSON.stringify(src))); p.name = (src.name + ' (copia)').slice(0, 120);
  S.projects.push(p); saveProjects(); render(); toast('Proyecto duplicado');
};
ACT['rename-project'] = t => {
  const p = S.projects.find(x => x.id === t.dataset.id); if (!p) return;
  openModal(`<div class="panel-head"><h2 id="modal-title">Renombrar proyecto</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
    <label class="field">Nombre<input type="text" id="rn-name" maxlength="120" value="${esc(p.name)}" autofocus></label>
    <div class="row"><button class="btn primary" data-act="modal-ok" type="button">Guardar</button><button class="btn" data-act="modal-close" type="button">Cancelar</button></div>`,
  () => { const v = document.getElementById('rn-name').value.trim(); if (!v) return false; p.name = v.slice(0, 120); saveProjects(); render(); });
};
ACT['del-project'] = t => {
  const p = S.projects.find(x => x.id === t.dataset.id); if (!p) return;
  confirmBox('Eliminar proyecto', `Se eliminará «${esc(p.name)}» de este navegador. Esta acción no se puede deshacer.`, 'Eliminar', () => {
    S.projects = S.projects.filter(x => x.id !== p.id);
    if (S.activeId === p.id) S.activeId = S.projects.length ? S.projects[0].id : null;
    saveProjects(); render(); toast('Proyecto eliminado');
  }, true);
};
ACT['load-example'] = () => {
  const p = cleanProject(DATA.example);
  S.projects.push(p); S.activeId = p.id; saveProjects();
  toast('Caso de ejemplo cargado'); go('resumen');
};
ACT['import-project'] = () => pickFile('.json,application/json', async file => {
  try {
    const o = JSON.parse(await readFile(file));
    const list = Array.isArray(o.projects) ? o.projects : [o];
    let nf = 0;
    if (Array.isArray(o.frameworks)) nf = importFrameworkList(o.frameworks);
    list.slice(0, 100).forEach(x => { const p = cleanProject(x); S.projects.push(p); S.activeId = p.id; });
    saveProjects(); render(); toast(list.length + ' proyecto(s) importado(s)' + (nf ? ' y ' + nf + ' marco(s)' : ''));
  } catch (e) { toast('No se pudo importar: ' + e.message); }
});

/* ================= RESUMEN ================= */
VIEWS.resumen = () => {
  const p = project(); if (!p) return needProject();
  const sc = scope(p);
  if (!sc.length) return head('Resumen', esc(p.name)) + `<div class="card empty">El proyecto no tiene marcos en el alcance. <button class="btn sm" data-act="go" data-view="marcos" type="button">Elegir marcos</button></div>`;
  const cards = sc.map(id => {
    const s = E.frameworkScore(S.model, p, id), f = fw(id), c = s.counts;
    return `<div class="card">
      <div class="row spread"><h3 class="row">${dot(id)}${esc(f.name)}</h3><button class="btn sm ghost" data-act="go" data-view="requisitos" data-fw="${esc(id)}" type="button">Ver requisitos →</button></div>
      <div class="score"><span class="big">${pct(s.score)}</span><span class="muted">de cumplimiento · ${s.applicable} requisitos aplicables</span></div>
      ${seg([['covered', c.covered, 'Cubiertos'], ['partial', c.partial, 'Parciales'], ['gap', c.gap, 'Brechas'], ['unmapped', c.unmapped, 'Sin mapear'], ['excluded', c.excluded, 'Excluidos']])}
      <div class="legend"><span><i class="s-covered"></i>Cubiertos ${c.covered}</span><span><i class="s-partial"></i>Parciales ${c.partial}</span><span><i class="s-gap"></i>Brechas ${c.gap}</span>${c.unmapped ? `<span><i class="s-unmapped"></i>Sin mapear ${c.unmapped}</span>` : ''}${c.excluded ? `<span><i class="s-excluded"></i>Excluidos ${c.excluded}</span>` : ''}</div>
    </div>`;
  }).join('');
  const dom = E.domainSummary(S.model, p);
  const pr = E.priorities(S.model, p).slice(0, 8);
  const al = E.coherence(S.model, p);
  const sev = k => al.filter(a => a.severity === k).length;
  const matrix = sc.length > 1 ? `<div class="card"><h3>Solapamiento entre marcos</h3><p class="muted small">Parte del marco de la columna que queda cubierta al implantar los controles que el marco de la fila exige con enlace total.</p>
    <div class="tbl-wrap"><table class="matrix"><thead><tr><th>Desde ↓ · Hacia →</th>${sc.map(b => `<th>${esc(fw(b).shortName)}</th>`).join('')}</tr></thead><tbody>
    ${sc.map(a => `<tr><td>${fwTag(a)}</td>${sc.map(b => a === b ? '<td class="faint">—</td>' : `<td class="hm">${pct(E.overlap(S.model, a, b))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : '';
  return head('Resumen', esc(p.name) + ' · ' + sc.map(id => esc(fw(id).shortName)).join(' + ')) +
    `<div class="grid gauto mb">${cards}</div>
    <div class="grid g2">
      <div class="card"><h3>Controles por dominio</h3>
        <div class="legend"><span><i class="s-implemented"></i>Implantado</span><span><i class="s-partial"></i>Parcial</span><span><i class="s-pending"></i>Pendiente</span><span><i class="s-na"></i>No aplica</span></div>
        <div class="stack">${dom.map(d => `<div><div class="row spread small"><span>${esc(d.title)}</span><span class="muted num">${d.implemented}/${d.total}</span></div>${seg([['implemented', d.implemented, 'Implantados'], ['partial', d.partial, 'Parciales'], ['pending', d.pending, 'Pendientes'], ['na', d.na, 'No aplica']])}</div>`).join('')}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="row spread"><h3>Prioridades</h3><button class="btn sm ghost" data-act="go" data-view="plan" type="button">Plan de acción →</button></div>
          <p class="muted small">Controles pendientes ordenados por la cobertura que suman en todos los marcos del alcance.</p>
          ${pr.length ? `<div class="tbl-wrap"><table><thead><tr><th>Control</th><th class="right">Aporte</th><th>Estado</th></tr></thead><tbody>${pr.map(x => `<tr><td><button class="linkish" data-act="ctrl" data-id="${esc(x.control)}" type="button"><span class="ref">${esc(x.control)}</span> ${esc(ctrl(x.control).title)}</button></td><td class="right num nowrap">+${(x.gain * 100).toFixed(1)} pp</td><td>${statusSelect(x.control, x.status, null, 'pr-' + x.control)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No quedan controles pendientes. ✓</p>'}
        </div>
        <div class="card"><div class="row spread"><h3>Coherencia</h3><button class="btn sm ghost" data-act="go" data-view="brechas" type="button">Ver alertas →</button></div>
          <div class="row"><span class="chip alta">Alta ${sev('alta')}</span><span class="chip media">Media ${sev('media')}</span><span class="chip baja">Baja ${sev('baja')}</span></div>
        </div>
      </div>
    </div>
    <div class="mt">${matrix}</div>`;
};

/* ================= REQUISITOS ================= */
VIEWS.requisitos = () => {
  const p = project(); if (!p) return needProject();
  const all = frameworks();
  const sel = S.params.fw && fw(S.params.fw) ? S.params.fw : (scope(p)[0] || all[0].id);
  const f = fw(sel);
  const q = (filt('q', '') || '').toLowerCase(), st = filt('st', '');
  const inSc = scope(p).indexOf(sel) >= 0;
  const rows = []; let lastG = null, shown = 0;
  const gTitle = {}; (f.groups || []).forEach(g => { gTitle[g.id] = g.title; });
  f.requirements.forEach(r => {
    const c = E.requirementCoverage(S.model, p, sel, r.id);
    if (st && c.state !== st) return;
    if (q && (r.ref + ' ' + r.title + ' ' + (r.summary || '') + ' ' + r.mappings.map(m => m.control).join(' ')).toLowerCase().indexOf(q) < 0) return;
    shown++;
    if (r.group !== lastG) { lastG = r.group; rows.push(`<tr class="group"><td colspan="5">${esc(gTitle[r.group] || r.group || 'Sin grupo')}</td></tr>`); }
    const ex = c.excluded ? p.exclusions[sel][r.id] : null;
    rows.push(`<tr>
      <td class="ref">${esc(r.ref)}</td>
      <td><button class="linkish" data-act="req" data-fw="${esc(sel)}" data-id="${esc(r.id)}" type="button">${esc(r.title)}</button>
        ${c.excluded ? `<div class="sub">Excluido: ${esc(ex) || '<em>sin justificación</em>'}</div>` : ''}${r.note ? `<div class="sub">${esc(r.note)}</div>` : ''}</td>
      <td class="nowrap">${c.state === 'excluded' || c.state === 'unmapped' ? '' : `<div class="row"><span class="num small">${pct(c.value)}</span>${bar(c.value)}</div>`}${stateChip(c.state)}</td>
      <td><div class="row">${c.links.filter(l => l.weight > 0).map(l => ctrlChip(l.control, p) + (l.strength === 'partial' ? '<span class="faint small" title="Enlace parcial">½</span>' : '')).join(' ') || '<span class="faint small">—</span>'}</div></td>
      <td class="nowrap">${r.excludable === false ? '<span class="faint small" title="No admite exclusión">Obligatorio</span>' : c.excluded
        ? `<button class="btn sm" data-act="include" data-fw="${esc(sel)}" data-id="${esc(r.id)}" type="button">Reincluir</button>`
        : `<button class="btn sm ghost" data-act="exclude" data-fw="${esc(sel)}" data-id="${esc(r.id)}" type="button">Excluir</button>`}</td>
    </tr>`);
  });
  const s = E.frameworkScore(S.model, p, sel);
  return head('Requisitos y declaración de aplicabilidad', 'Cobertura de cada requisito calculada a partir del estado de los controles que lo cubren. Los requisitos excluibles se pueden excluir con justificación.') +
    `<div class="filters">
      <label class="vh" for="rq-fw">Marco</label>
      <select id="rq-fw" data-chg="req-fw">${all.map(x => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x.name)}${scope(p).indexOf(x.id) < 0 ? ' (fuera del alcance)' : ''}</option>`).join('')}</select>
      <label class="vh" for="rq-q">Buscar</label><input type="search" id="rq-q" placeholder="Buscar referencia, texto o control…" value="${esc(filt('q', ''))}" data-inp="filter" data-key="q">
      <label class="vh" for="rq-st">Estado</label><select id="rq-st" data-chg="filter" data-key="st"><option value="">Todos los estados</option>${Object.keys(E.STATE_LABEL).map(k => `<option value="${k}"${k === st ? ' selected' : ''}>${E.STATE_LABEL[k]}</option>`).join('')}</select>
      <span class="chip accent">${pct(s.score)} de cumplimiento</span><span class="muted small">${shown} de ${f.requirements.length}</span>
    </div>
    ${inSc ? '' : `<div class="callout warn mb">Este marco no está en el alcance del proyecto: no cuenta en el resumen. <button class="btn sm" data-act="scope-add" data-fw="${esc(sel)}" type="button">Agregar al alcance</button></div>`}
    <div class="tbl-wrap"><table><thead><tr><th>Ref.</th><th>Requisito</th><th>Cobertura</th><th>Controles</th><th>Aplicabilidad</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="5" class="empty">Sin resultados.</td></tr>'}</tbody></table></div>`;
};
CHG['req-fw'] = el => go('requisitos', { fw: el.value });
ACT['scope-add'] = t => { const p = project(); if (p && p.scope.indexOf(t.dataset.fw) < 0) { p.scope.push(t.dataset.fw); saveProjects(); render(); toast('Marco agregado al alcance'); } };
ACT.exclude = t => {
  const r = req(t.dataset.fw, t.dataset.id);
  openModal(`<div class="panel-head"><h2 id="modal-title">Excluir ${esc(r.ref)}</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
    <p>${esc(r.title)}</p>
    <label class="field">Justificación (obligatoria para la declaración de aplicabilidad)<textarea id="ex-just" maxlength="1000" autofocus></textarea></label>
    <div class="row"><button class="btn primary" data-act="modal-ok" type="button">Excluir</button><button class="btn" data-act="modal-close" type="button">Cancelar</button></div>`,
  () => {
    const v = document.getElementById('ex-just').value.trim();
    if (!v) { toast('Escribí una justificación.'); return false; }
    const p = project(); p.exclusions[t.dataset.fw] = p.exclusions[t.dataset.fw] || {};
    p.exclusions[t.dataset.fw][t.dataset.id] = v; saveProjects(); render(); toast('Requisito excluido');
  });
};
ACT.include = t => { const p = project(); if (p.exclusions[t.dataset.fw]) delete p.exclusions[t.dataset.fw][t.dataset.id]; saveProjects(); render(); toast('Requisito reincluido'); };

ACT.req = t => {
  const p = project(), fId = t.dataset.fw, r = req(fId, t.dataset.id); if (!r || !p) return;
  const c = E.requirementCoverage(S.model, p, fId, r.id);
  const eq = E.equivalences(S.model, fId, r.id);
  openDrawer(`<div class="panel-head"><div><div class="row">${fwTag(fId)}<span class="ref">${esc(r.ref)}</span></div><h2 id="drawer-title" class="mt-s">${esc(r.title)}</h2></div><button class="x" data-act="drawer-close" type="button" aria-label="Cerrar">×</button></div>
    ${r.summary ? `<p>${esc(r.summary)}</p>` : ''}${r.note ? `<div class="callout small">${esc(r.note)}</div>` : ''}
    <div class="row">${stateChip(c.state)}${c.state !== 'excluded' && c.state !== 'unmapped' ? `<span class="num">${pct(c.value)}</span>` : ''}${c.cap < 1 && c.cap > 0 ? '<span class="chip warn">Solo enlaces parciales: máximo 50 %</span>' : ''}</div>
    <h3>Controles que lo cubren</h3>
    ${c.links.length ? `<div class="tbl-wrap"><table><thead><tr><th>Control</th><th>Enlace</th><th>Estado</th></tr></thead><tbody>${c.links.map(l => `<tr><td><button class="linkish" data-act="ctrl" data-id="${esc(l.control)}" type="button"><span class="ref">${esc(l.control)}</span> ${esc(ctrl(l.control).title)}</button></td><td><span class="chip">${E.STRENGTH_LABEL[l.strength]}</span></td><td>${stChip(l.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin controles asociados.</p>'}
    <h3>Equivalencias en otros marcos</h3>
    ${eq.length ? `<div class="tbl-wrap"><table><thead><tr><th>Requisito</th><th>Tipo</th><th>Vía</th></tr></thead><tbody>${eq.map(e => { const o = req(e.fw, e.req); return `<tr><td>${fwTag(e.fw)} <button class="linkish" data-act="req" data-fw="${esc(e.fw)}" data-id="${esc(e.req)}" type="button"><span class="ref">${esc(o.ref)}</span> ${esc(o.title)}</button></td><td><span class="chip ${e.strength === 'full' ? 'ok' : e.strength === 'partial' ? 'warn' : ''}">${e.strength === 'full' ? 'Equivalente' : E.STRENGTH_LABEL[e.strength]}</span></td><td class="small mono">${e.via.map(esc).join(', ')}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No comparte controles con otros marcos.</p>'}`);
};

/* ================= CONTROLES ================= */
VIEWS.controles = () => {
  const p = project(); if (!p) return needProject();
  const sc = scope(p);
  const q = (filt('q', '') || '').toLowerCase(), dm = filt('dm', ''), st = filt('st', ''), ff = filt('ff', ''), allC = filt('all', false);
  const rows = [];
  let n = 0, lastD = null;
  const domT = {}; S.model.domains.forEach(d => { domT[d.id] = d.title; });
  const dOrder = {}; S.model.domains.forEach((d, i) => { dOrder[d.id] = i; });
  const list = Array.from(S.model.controls.values()).sort((a, b) => (dOrder[a.domain] - dOrder[b.domain]) || (a.id < b.id ? -1 : 1));
  list.forEach(c => {
    const links = (S.model.byControl.get(c.id) || []).filter(l => E.STRENGTH[l.strength] > 0);
    const inSc = links.filter(l => sc.indexOf(l.fw) >= 0);
    if (!allC && !inSc.length) return;
    if (ff && !links.some(l => l.fw === ff)) return;
    const s = E.ctrlState(p, c.id);
    if (dm && c.domain !== dm) return;
    if (st && s.status !== st) return;
    if (q && (c.id + ' ' + c.title + ' ' + c.description + ' ' + s.owner + ' ' + s.evidence).toLowerCase().indexOf(q) < 0) return;
    n++;
    if (c.domain !== lastD) { lastD = c.domain; rows.push(`<tr class="group"><td colspan="6">${esc(domT[c.domain] || c.domain)}</td></tr>`); }
    const fws = []; inSc.forEach(l => { if (fws.indexOf(l.fw) < 0) fws.push(l.fw); });
    rows.push(`<tr>
      <td class="ref">${esc(c.id)}</td>
      <td><button class="linkish" data-act="ctrl" data-id="${esc(c.id)}" type="button">${esc(c.title)}</button><div class="row mt-s">${fws.map(fwTag).join('')}<span class="faint small">${inSc.length} req.</span></div></td>
      <td>${statusSelect(c.id, s.status, null, 'st-' + c.id)}</td>
      <td><label class="vh" for="ow-${esc(c.id)}">Responsable de ${esc(c.id)}</label><input type="text" id="ow-${esc(c.id)}" value="${esc(s.owner)}" maxlength="120" placeholder="Responsable" data-chg="field" data-field="owner" data-id="${esc(c.id)}" data-max="120"></td>
      <td><label class="vh" for="ev-${esc(c.id)}">Evidencias de ${esc(c.id)}</label><input type="text" id="ev-${esc(c.id)}" value="${esc(s.evidence)}" maxlength="2000" placeholder="Evidencias" data-chg="field" data-field="evidence" data-id="${esc(c.id)}"></td>
      <td><label class="vh" for="rv-${esc(c.id)}">Última revisión de ${esc(c.id)}</label><input type="date" id="rv-${esc(c.id)}" value="${esc(s.reviewed)}" data-chg="field" data-field="reviewed" data-id="${esc(c.id)}" data-max="10"></td>
    </tr>`);
  });
  return head('Controles', 'El estado de cada control se registra una sola vez y se refleja en todos los marcos que lo exigen.') +
    `<div class="filters">
      <label class="vh" for="ct-q">Buscar</label><input type="search" id="ct-q" placeholder="Buscar control, responsable, evidencia…" value="${esc(filt('q', ''))}" data-inp="filter" data-key="q">
      <label class="vh" for="ct-dm">Dominio</label><select id="ct-dm" data-chg="filter" data-key="dm"><option value="">Todos los dominios</option>${S.model.domains.map(d => `<option value="${esc(d.id)}"${d.id === dm ? ' selected' : ''}>${esc(d.title)}</option>`).join('')}</select>
      <label class="vh" for="ct-st">Estado</label><select id="ct-st" data-chg="filter" data-key="st"><option value="">Todos los estados</option>${STATUS_OPTS.map(o => `<option value="${o}"${o === st ? ' selected' : ''}>${E.STATUS_LABEL[o]}</option>`).join('')}</select>
      <label class="vh" for="ct-ff">Marco</label><select id="ct-ff" data-chg="filter" data-key="ff"><option value="">Todos los marcos</option>${frameworks().map(f => `<option value="${esc(f.id)}"${f.id === ff ? ' selected' : ''}>${esc(f.shortName)}</option>`).join('')}</select>
      <label class="check small"><input type="checkbox" data-chg="filter" data-key="all"${allC ? ' checked' : ''}>Incluir controles fuera del alcance</label>
      <span class="muted small">${n} controles</span>
    </div>
    <div class="tbl-wrap"><table><thead><tr><th>Id</th><th>Control</th><th>Estado</th><th>Responsable</th><th>Evidencias</th><th>Revisión</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="6" class="empty">Sin resultados.</td></tr>'}</tbody></table></div>`;
};

ACT.ctrl = t => {
  const p = project(), id = t.dataset.id, c = ctrl(id); if (!c || !p) return;
  const s = E.ctrlState(p, id);
  const links = S.model.byControl.get(id) || [];
  const byFw = {};
  links.forEach(l => { (byFw[l.fw] = byFw[l.fw] || []).push(l); });
  const dom = S.model.domains.find(d => d.id === c.domain);
  openDrawer(`<div class="panel-head"><div><span class="ref">${esc(id)} · ${esc(dom ? dom.title : c.domain)}</span><h2 id="drawer-title" class="mt-s">${esc(c.title)}</h2></div><button class="x" data-act="drawer-close" type="button" aria-label="Cerrar">×</button></div>
    <p>${esc(c.description)}</p>${c.origin !== 'catalog' ? `<p class="small muted">Control aportado por el marco ${esc(fw(c.origin) ? fw(c.origin).shortName : c.origin)}.</p>` : ''}
    <div class="grid g2">
      <label class="field">Estado${statusSelect(id, s.status)}</label>
      <label class="field">Responsable<input type="text" value="${esc(s.owner)}" maxlength="120" data-chg="field" data-field="owner" data-id="${esc(id)}" data-max="120"></label>
      <label class="field">Última revisión<input type="date" value="${esc(s.reviewed)}" data-chg="field" data-field="reviewed" data-id="${esc(id)}" data-max="10"></label>
      <label class="field">Fecha objetivo<input type="date" value="${esc(s.due)}" data-chg="field" data-field="due" data-id="${esc(id)}" data-max="10"></label>
    </div>
    <label class="field">Evidencias<textarea maxlength="2000" data-chg="field" data-field="evidence" data-id="${esc(id)}">${esc(s.evidence)}</textarea></label>
    <label class="field">Notas<textarea maxlength="2000" data-chg="field" data-field="notes" data-id="${esc(id)}">${esc(s.notes)}</textarea></label>
    <h3>Requisitos que cubre</h3>
    ${Object.keys(byFw).map(f => `<div><div class="row mb">${fwTag(f)}${scope(p).indexOf(f) < 0 ? '<span class="faint small">fuera del alcance</span>' : ''}</div><div class="stack">${byFw[f].map(l => { const r = req(f, l.req); return `<div class="row"><span class="chip">${E.STRENGTH_LABEL[l.strength]}</span><button class="linkish small" data-act="req" data-fw="${esc(f)}" data-id="${esc(l.req)}" type="button"><span class="ref">${esc(r.ref)}</span> ${esc(r.title)}</button></div>`; }).join('')}</div></div>`).join('') || '<p class="muted">Ningún marco usa este control.</p>'}`);
};

/* ================= EQUIVALENCIAS ================= */
VIEWS.equivalencias = () => {
  const p = project(); if (!p) return needProject();
  const all = frameworks();
  const sel = S.params.fw && fw(S.params.fw) ? S.params.fw : (scope(p)[0] || all[0].id);
  const f = fw(sel);
  const firstEq = f.requirements.find(x => E.equivalences(S.model, sel, x.id).some(e => e.weight > 0)) || f.requirements[0];
  const rid = S.params.req && req(sel, S.params.req) ? S.params.req : firstEq.id;
  const q = (filt('q', '') || '').toLowerCase();
  const items = f.requirements.filter(r => !q || (r.ref + ' ' + r.title).toLowerCase().indexOf(q) >= 0);
  const r = req(sel, rid);
  const c = E.requirementCoverage(S.model, p, sel, rid);
  const eq = E.equivalences(S.model, sel, rid);
  const grouped = {}; eq.forEach(e => { (grouped[e.fw] = grouped[e.fw] || []).push(e); });
  return head('Equivalencias', 'Para un requisito de cualquier marco: los controles que lo cubren y los requisitos equivalentes en los demás. La equivalencia sale de los controles compartidos: total si ambos enlaces son totales, parcial si alguno es parcial y relación si alguno es informativo.') +
    `<div class="eq">
      <div class="card">
        <div class="filters"><label class="vh" for="eq-fw">Marco</label><select id="eq-fw" data-chg="eq-fw">${all.map(x => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <label class="vh" for="eq-q">Buscar</label><input type="search" id="eq-q" placeholder="Filtrar requisitos…" value="${esc(filt('q', ''))}" data-inp="filter" data-key="q"></div>
        <div class="list">${items.map(x => `<button type="button" data-act="eq-pick" data-fw="${esc(sel)}" data-id="${esc(x.id)}"${x.id === rid ? ' aria-current="true"' : ''}><span class="ref">${esc(x.ref)}</span><span>${esc(x.title)}</span></button>`).join('') || '<p class="muted small">Sin resultados.</p>'}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="row">${fwTag(sel)}<span class="ref">${esc(r.ref)}</span>${stateChip(c.state)}</div><h2>${esc(r.title)}</h2>${r.summary ? `<p class="muted">${esc(r.summary)}</p>` : ''}
          <div class="row">${c.links.map(l => ctrlChip(l.control, p) + `<span class="faint small">${E.STRENGTH_LABEL[l.strength].toLowerCase()}</span>`).join(' ')}</div></div>
        ${Object.keys(grouped).length ? Object.keys(grouped).map(g => `<div class="card"><h3 class="row">${dot(g)}${esc(fw(g).name)} <span class="muted small">${grouped[g].length} requisito(s)</span></h3>
          <div class="tbl-wrap"><table><thead><tr><th>Ref.</th><th>Requisito</th><th>Tipo</th><th>Vía</th><th>Estado</th></tr></thead><tbody>
          ${grouped[g].map(e => { const o = req(e.fw, e.req), oc = E.requirementCoverage(S.model, p, e.fw, e.req); return `<tr><td class="ref">${esc(o.ref)}</td><td><button class="linkish" data-act="eq-pick" data-fw="${esc(e.fw)}" data-id="${esc(e.req)}" type="button">${esc(o.title)}</button></td><td><span class="chip ${e.strength === 'full' ? 'ok' : e.strength === 'partial' ? 'warn' : ''}">${e.strength === 'full' ? 'Equivalente' : E.STRENGTH_LABEL[e.strength]}</span></td><td class="mono small">${e.via.map(esc).join(', ')}</td><td>${stateChip(oc.state)}</td></tr>`; }).join('')}
          </tbody></table></div></div>`).join('') : '<div class="card empty">Este requisito no comparte controles con otros marcos.</div>'}
      </div>
    </div>`;
};
CHG['eq-fw'] = el => { S.f.equivalencias = {}; go('equivalencias', { fw: el.value }); };
ACT['eq-pick'] = t => go('equivalencias', { fw: t.dataset.fw, req: t.dataset.id });

/* ================= BRECHAS ================= */
const RULES = { 'sin-evidencia': 'Sin evidencias', 'sin-responsable': 'Sin responsable', 'sin-revision': 'Sin revisión', 'revision-vencida': 'Revisión vencida', 'na-requerido': '«No aplica» exigido', 'plazo-vencido': 'Plazo vencido', 'exclusion-no-permitida': 'Exclusión no permitida', 'exclusion-sin-justificar': 'Exclusión sin justificar', 'exclusion-contradictoria': 'Exclusión contradictoria', 'sin-mapear': 'Requisitos sin mapear' };
VIEWS.brechas = () => {
  const p = project(); if (!p) return needProject();
  const sc = scope(p);
  const al = E.coherence(S.model, p);
  const sv = filt('sv', '');
  const shown = al.filter(a => !sv || a.severity === sv);
  const gaps = sc.map(id => {
    const list = fw(id).requirements.map(r => E.requirementCoverage(S.model, p, id, r.id)).filter(c => c.state === 'gap' || c.state === 'unmapped');
    return `<div class="card"><h3 class="row">${dot(id)}${esc(fw(id).name)} <span class="chip bad">${list.length} sin cubrir</span></h3>
      ${list.length ? `<div class="tbl-wrap"><table><tbody>${list.map(c => `<tr><td class="ref">${esc(c.req.ref)}</td><td><button class="linkish" data-act="req" data-fw="${esc(id)}" data-id="${esc(c.req.id)}" type="button">${esc(c.req.title)}</button></td><td>${stateChip(c.state)}</td><td><div class="row">${c.links.filter(l => l.weight > 0).map(l => ctrlChip(l.control, p)).join(' ')}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Todos los requisitos aplicables tienen alguna cobertura.</p>'}</div>`;
  }).join('');
  return head('Brechas y coherencia', 'Requisitos sin cobertura en cada marco y alertas de coherencia: controles sin evidencias o sin responsable, revisiones de más de 12 meses, exclusiones no permitidas o contradictorias entre marcos y requisitos sin mapear.') +
    `<div class="card mb"><div class="row spread"><h2>Alertas (${al.length})</h2>
      <div class="row"><label class="vh" for="br-sv">Severidad</label><select id="br-sv" data-chg="filter" data-key="sv"><option value="">Todas</option>${['alta', 'media', 'baja'].map(k => `<option value="${k}"${k === sv ? ' selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></div></div>
      ${shown.length ? `<div class="tbl-wrap"><table><thead><tr><th>Severidad</th><th>Regla</th><th>Objeto</th><th>Detalle</th></tr></thead><tbody>${shown.slice(0, 400).map(a => `<tr><td><span class="chip ${a.severity}">${a.severity}</span></td><td class="nowrap small">${esc(RULES[a.rule] || a.rule)}</td><td>${a.control ? ctrlChip(a.control, p) : a.req ? `<button class="linkish small" data-act="req" data-fw="${esc(a.fw)}" data-id="${esc(a.req)}" type="button">${esc(req(a.fw, a.req).ref)}</button>` : fwTag(a.fw)}</td><td class="small">${esc(a.message)}</td></tr>`).join('')}</tbody></table></div>${shown.length > 400 ? `<p class="muted small">Se muestran las primeras 400 de ${shown.length}.</p>` : ''}` : '<div class="callout ok">Sin incoherencias para este filtro.</div>'}
    </div>
    <div class="stack">${gaps || '<div class="card empty">Sin marcos en el alcance.</div>'}</div>`;
};

/* ================= PLAN ================= */
VIEWS.plan = () => {
  const p = project(); if (!p) return needProject();
  const pr = E.priorities(S.model, p);
  const gain = {}; pr.forEach(x => { gain[x.control] = x.gain; });
  const cols = { todo: [], doing: [], done: [] };
  pr.forEach(x => { cols[E.ctrlState(p, x.control).plan].push(x.control); });
  Object.keys(p.controls).forEach(id => {
    const s = E.ctrlState(p, id);
    if (ctrl(id) && s.status === 'implemented' && (s.plan === 'doing' || s.plan === 'done') && cols[s.plan].indexOf(id) < 0) cols[s.plan].push(id);
  });
  const lim = +filt('lim', 25);
  const STEPS = ['todo', 'doing', 'done'];
  const card = (id, col) => {
    const s = E.ctrlState(p, id), c = ctrl(id);
    const idx = STEPS.indexOf(col);
    return `<div class="kcard">
      <button class="linkish" data-act="ctrl" data-id="${esc(id)}" type="button"><span class="ref">${esc(id)}</span> ${esc(c.title)}</button>
      <div class="row small">${stChip(s.status)}${gain[id] ? `<span class="chip accent">+${(gain[id] * 100).toFixed(1)} pp</span>` : ''}${s.due && s.due < today() && s.status !== 'implemented' ? '<span class="chip bad">Vencido</span>' : ''}</div>
      <div class="row"><label class="vh" for="po-${esc(id)}">Responsable de ${esc(id)}</label><input type="text" id="po-${esc(id)}" value="${esc(s.owner)}" placeholder="Responsable" maxlength="120" data-chg="field" data-field="owner" data-id="${esc(id)}" data-max="120">
        <label class="vh" for="pd-${esc(id)}">Fecha objetivo de ${esc(id)}</label><input type="date" id="pd-${esc(id)}" value="${esc(s.due)}" data-chg="field" data-field="due" data-id="${esc(id)}" data-max="10"></div>
      <div class="row spread">${idx > 0 ? `<button class="btn sm" data-act="plan-move" data-id="${esc(id)}" data-to="${STEPS[idx - 1]}" type="button" aria-label="Mover ${esc(id)} a la columna anterior">←</button>` : '<span></span>'}
        ${col === 'done' && s.status !== 'implemented' ? `<button class="btn sm" data-act="plan-impl" data-id="${esc(id)}" type="button">Marcar implantado</button>` : ''}
        ${idx < 2 ? `<button class="btn sm" data-act="plan-move" data-id="${esc(id)}" data-to="${STEPS[idx + 1]}" type="button" aria-label="Mover ${esc(id)} a la columna siguiente">→</button>` : ''}</div>
    </div>`;
  };
  const col = (k, t) => `<div class="col"><h3>${t}<span class="muted num">${cols[k].length}</span></h3>${cols[k].slice(0, k === 'todo' ? lim : 500).map(id => card(id, k)).join('')}${k === 'todo' && cols.todo.length > lim ? `<button class="btn sm" data-act="plan-more" type="button">Mostrar ${Math.min(25, cols.todo.length - lim)} más</button>` : ''}</div>`;
  return head('Plan de acción', 'Controles pendientes o parciales ordenados por la cobertura que suman en todos los marcos del alcance. Mové cada tarjeta a medida que avanza.') +
    `<div class="kanban">${col('todo', 'Pendiente')}${col('doing', 'En curso')}${col('done', 'Hecha')}</div>`;
};
ACT['plan-move'] = t => setCtrl(t.dataset.id, { plan: t.dataset.to });
ACT['plan-impl'] = t => { setCtrl(t.dataset.id, { status: 'implemented', reviewed: today() }); toast('Control marcado como implantado'); };
ACT['plan-more'] = () => { S.f.plan = Object.assign({}, S.f.plan, { lim: (+filt('lim', 25)) + 25 }); render(); };
