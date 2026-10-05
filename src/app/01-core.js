/* Babel GRC · núcleo: estado, almacenamiento, navegación y utilidades. */
'use strict';

const E = window.BabelEngine;
const DATA = JSON.parse(document.getElementById('babel-data').textContent);
const LS = { projects: 'babel.projects.v1', active: 'babel.active.v1', custom: 'babel.frameworks.v1', theme: 'babel.theme' };
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado).'); return false; }
  }
};

const S = {
  catalog: DATA.catalog,
  builtins: DATA.frameworks,
  customs: [],
  projects: [],
  activeId: null,
  view: 'inicio',
  params: {},
  f: {},          // filtros por vista
  model: null
};

/* ---------- utilidades ---------- */
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => Math.round(v * 100) + ' %';
const today = () => new Date().toISOString().slice(0, 10);
const HEX = /^#[0-9a-fA-F]{6}$/;
const STATUS_OPTS = ['implemented', 'partial', 'pending', 'na'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function rebuild() {
  const ids = new Set(S.builtins.map(f => f.id));
  S.customs = S.customs.filter(f => !ids.has(f.id));
  S.model = E.buildModel(S.catalog, S.builtins.concat(S.customs));
}
function frameworks() { return S.model.order.map(id => S.model.frameworks.get(id)); }
function fw(id) { return S.model.frameworks.get(id); }
function isCustom(id) { return S.customs.some(f => f.id === id); }
function project() { return S.projects.find(p => p.id === S.activeId) || null; }
function scope(p) { return ((p || project() || {}).scope || []).filter(id => S.model.frameworks.has(id)); }
function saveProjects() { store.set(LS.projects, S.projects); store.set(LS.active, S.activeId); }
function saveCustoms() { store.set(LS.custom, S.customs); }
function ctrl(id) { return S.model.controls.get(id); }
function req(fwId, reqId) { return S.model.requirements.get(E.rkey(fwId, reqId)); }

function dot(fwId) {
  const f = fw(fwId);
  return `<span class="fw-dot" data-color="${esc(f && HEX.test(f.color) ? f.color : '#5b4bdb')}" aria-hidden="true"></span>`;
}
function fwTag(fwId) { const f = fw(fwId); const n = f ? f.shortName : fwId; return `<span class="chip outline" title="${esc(f ? f.name : fwId)}">${dot(fwId)}<span class="trunc">${esc(n)}</span></span>`; }
/** Título de marco con su color: el nombre se ajusta en varias líneas sin desbordar. */
function fwTitle(fwId, extra, tag) { const f = fw(fwId); const t = tag || 'h3'; return `<${t} class="fw-title">${dot(fwId)}<span class="name">${esc(f ? f.name : fwId)}</span>${extra || ''}</${t}>`; }
function stChip(status) { return `<span class="chip ${status}">${esc(E.STATUS_LABEL[status])}</span>`; }
function stateChip(state) { return `<span class="chip ${state}">${esc(E.STATE_LABEL[state])}</span>`; }
function bar(v, cls) { const c = cls || (v >= 0.9999 ? 'ok' : v > 0 ? 'warn' : 'bad'); return `<div class="bar ${c}" role="img" aria-label="${pct(v)}"><span data-w="${Math.round(v * 1000) / 10}"></span></div>`; }
function seg(parts) {
  const total = parts.reduce((a, p) => a + p[1], 0) || 1;
  return `<div class="seg" role="img" aria-label="${esc(parts.map(p => p[2] + ': ' + p[1]).join(', '))}">${parts.filter(p => p[1] > 0).map(p => `<span class="s-${p[0]}" data-w="${(p[1] / total * 100).toFixed(2)}"></span>`).join('')}</div>`;
}
function ctrlChip(id, p) {
  const s = E.ctrlState(p || project(), id).status;
  return `<button type="button" class="chip ctrl-chip ${s}" data-act="ctrl" data-id="${esc(id)}" title="${esc((ctrl(id) || {}).title || '')} · ${esc(E.STATUS_LABEL[s])}">${esc(id)}</button>`;
}
function statusSelect(id, s, label, domId) {
  return `<select class="st ${s}"${domId ? ` id="${esc(domId)}"` : ''} data-chg="status" data-id="${esc(id)}" aria-label="${esc(label || 'Estado de ' + id)}">${STATUS_OPTS.map(o => `<option value="${o}"${o === s ? ' selected' : ''}>${E.STATUS_LABEL[o]}</option>`).join('')}</select>`;
}
function needProject() {
  return `<div class="card empty"><h2>No hay un proyecto abierto</h2><p class="mt-s">Creá un proyecto o cargá el caso de ejemplo desde Inicio.</p><div class="mt"><button class="btn primary" data-act="go" data-view="inicio" type="button">Ir a Inicio</button></div></div>`;
}
function head(title, sub, actions) {
  return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="row">${actions}</div>` : ''}</div>`;
}

/* ---------- proyectos ---------- */
function setCtrl(id, patch, rerender) {
  const p = project(); if (!p) return;
  const cur = own(p.controls, id) ? p.controls[id] : {};
  p.controls[id] = Object.assign({}, cur, patch);
  saveProjects();
  if (rerender !== false) render();
}

/** Limpia un proyecto importado: solo campos y tipos conocidos. */
function cleanProject(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('El archivo no contiene un proyecto.');
  const s = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);
  const d = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const p = E.newProject(s(o.name, 120) || 'Proyecto importado', Array.isArray(o.scope) ? o.scope.filter(x => typeof x === 'string').slice(0, 50) : []);
  if (d(o.created)) p.created = o.created;
  const ctrls = o.controls && typeof o.controls === 'object' ? o.controls : {};
  Object.keys(ctrls).slice(0, 5000).forEach(k => {
    const c = ctrls[k];
    if (!/^[A-Z]{2,5}-[A-Z0-9]{1,6}$/.test(k) || !c || typeof c !== 'object') return;
    p.controls[k] = {
      status: STATUS_OPTS.indexOf(c.status) >= 0 ? c.status : 'pending',
      owner: s(c.owner, 120), evidence: s(c.evidence, 2000), reviewed: d(c.reviewed), due: d(c.due),
      plan: ['todo', 'doing', 'done'].indexOf(c.plan) >= 0 ? c.plan : 'todo', notes: s(c.notes, 2000)
    };
  });
  const ex = o.exclusions && typeof o.exclusions === 'object' ? o.exclusions : {};
  Object.keys(ex).slice(0, 50).forEach(f => {
    if (!ex[f] || typeof ex[f] !== 'object' || !/^[a-z0-9][a-z0-9._-]{1,48}$/.test(f)) return;
    p.exclusions[f] = {};
    Object.keys(ex[f]).slice(0, 5000).forEach(r => { p.exclusions[f][String(r).slice(0, 80)] = s(ex[f][r], 1000); });
  });
  return p;
}

/* ---------- navegación ---------- */
const NAV = [
  { id: 'inicio', ico: '⌂', label: 'Inicio' },
  { id: 'resumen', ico: '◔', label: 'Resumen' },
  { id: 'requisitos', ico: '☰', label: 'Requisitos y SoA' },
  { id: 'controles', ico: '▦', label: 'Controles' },
  { id: 'equivalencias', ico: '⇄', label: 'Equivalencias' },
  { id: 'brechas', ico: '△', label: 'Brechas y coherencia', count: true },
  { id: 'plan', ico: '▤', label: 'Plan de acción' },
  { sep: true },
  { id: 'marcos', ico: '◫', label: 'Marcos normativos' },
  { id: 'exportar', ico: '⇩', label: 'Exportar' },
  { id: 'ayuda', ico: '?', label: 'Ayuda' }
];
const VIEWS = {};

function go(view, params) {
  if (!VIEWS[view]) view = 'inicio';
  const q = new URLSearchParams(params || {}).toString();
  const h = '#/' + view + (q ? '?' + q : '');
  if (location.hash !== h) location.hash = h; else route();
}
function route() {
  const m = /^#\/([a-z]+)(?:\?(.*))?$/.exec(location.hash || '');
  const view = m && own(VIEWS, m[1]) ? m[1] : 'inicio';
  const params = {};
  if (m && m[2]) new URLSearchParams(m[2]).forEach((v, k) => { params[k] = v; });
  const changed = view !== S.view;
  S.view = view; S.params = params;
  closeDrawer(true);
  render();
  if (changed) { document.getElementById('main').focus({ preventScroll: true }); window.scrollTo(0, 0); }
}

function renderSide() {
  const p = project();
  const alerts = p ? E.coherence(S.model, p).filter(a => a.severity === 'alta').length : 0;
  document.getElementById('nav').innerHTML = NAV.map(n => n.sep ? '<div class="sep" role="separator"></div>' :
    `<button type="button" data-act="go" data-view="${n.id}"${S.view === n.id ? ' aria-current="page"' : ''}><span class="ico" aria-hidden="true">${n.ico}</span>${n.label}${n.count && alerts ? `<span class="count" title="${alerts} alertas de severidad alta">${alerts}</span>` : ''}</button>`).join('');
  document.getElementById('proj-switch').innerHTML = S.projects.length
    ? `<label for="proj-sel">Proyecto</label><select id="proj-sel" data-chg="project">${S.projects.map(x => `<option value="${esc(x.id)}"${x.id === S.activeId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`
    : '';
  document.getElementById('ver').textContent = 'v' + DATA.version;
}

let lastFocus = null;
function render() {
  renderSide();
  const main = document.getElementById('main');
  const active = document.activeElement;
  const keep = active && active.id && main.contains(active) ? { id: active.id, s: active.selectionStart, e: active.selectionEnd } : null;
  main.innerHTML = VIEWS[S.view]();
  post(main);
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.focus({ preventScroll: true }); try { if (keep.s !== null && keep.s !== undefined) el.setSelectionRange(keep.s, keep.e); } catch (e) { /* no aplica */ } }
  }
}
/** Aplica anchos y colores con CSSOM (la CSP no permite atributos style). */
function post(root) {
  root.querySelectorAll('[data-w]').forEach(el => { el.style.width = Math.max(0, Math.min(100, parseFloat(el.dataset.w) || 0)) + '%'; });
  root.querySelectorAll('[data-color]').forEach(el => { if (HEX.test(el.dataset.color)) el.style.background = el.dataset.color; });
}

/* ---------- panel lateral, modal y avisos ---------- */
function openDrawer(html) {
  const d = document.getElementById('drawer');
  if (d.hidden) lastFocus = document.activeElement;
  d.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">${html}</div>`;
  d.hidden = false; post(d);
  const f = d.querySelector('.x'); if (f) f.focus();
}
function closeDrawer(silent) {
  const d = document.getElementById('drawer');
  if (d.hidden) return;
  d.hidden = true; d.innerHTML = '';
  if (!silent && lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
}
let modalOk = null;
function openModal(html, onOk) {
  const m = document.getElementById('modal');
  if (m.hidden) lastFocus = document.activeElement;
  modalOk = onOk || null;
  m.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">${html}</div>`;
  m.hidden = false; post(m);
  const f = m.querySelector('[autofocus]') || m.querySelector('input,select,textarea,button');
  if (f) f.focus();
}
function closeModal() {
  const m = document.getElementById('modal');
  if (m.hidden) return;
  m.hidden = true; m.innerHTML = ''; modalOk = null;
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
}
function confirmBox(title, text, okLabel, onOk, danger) {
  openModal(`<div class="panel-head"><h2 id="modal-title">${esc(title)}</h2><button class="x" data-act="modal-close" type="button" aria-label="Cerrar">×</button></div>
    <p>${text}</p><div class="row"><button class="btn ${danger ? 'danger' : 'primary'}" data-act="modal-ok" type="button" autofocus>${esc(okLabel)}</button><button class="btn" data-act="modal-close" type="button">Cancelar</button></div>`, onOk);
}
let toastT = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- tema ---------- */
function applyTheme() {
  const t = store.get(LS.theme, null);
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  store.set(LS.theme, dark ? 'light' : 'dark');
  applyTheme();
}

/* ---------- archivos ---------- */
function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function slug(s) { return String(s || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'proyecto'; }
function readFile(file, asBuffer) {
  return new Promise((res, rej) => {
    if (file.size > MAX_IMPORT_BYTES) return rej(new Error('El archivo supera ' + (MAX_IMPORT_BYTES / 1048576) + ' MB.'));
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(new Error('No se pudo leer el archivo.'));
    if (asBuffer) r.readAsArrayBuffer(file); else r.readAsText(file);
  });
}
function pickFile(accept, cb) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = accept; i.className = 'vh';
  i.addEventListener('change', () => { if (i.files[0]) cb(i.files[0]); i.remove(); });
  document.body.appendChild(i); i.click();
}

/* ---------- acciones y eventos ---------- */
const ACT = {}, CHG = {}, INP = {};
function debounce(fn, ms) { let t; return function (a) { clearTimeout(t); t = setTimeout(() => fn(a), ms); }; }
function filt(key, def) { const f = S.f[S.view] || {}; return own(f, key) ? f[key] : def; }

ACT.go = t => go(t.dataset.view, t.dataset.fw ? { fw: t.dataset.fw } : undefined);
ACT.theme = toggleTheme;
ACT['drawer-close'] = () => closeDrawer();
ACT['modal-close'] = () => closeModal();
ACT['modal-ok'] = () => { const f = modalOk; if (f && f() === false) return; closeModal(); };
CHG.project = el => { S.activeId = el.value; saveProjects(); render(); };
CHG.status = el => {
  setCtrl(el.dataset.id, { status: el.value });
  if (!document.getElementById('drawer').hidden && el.closest('#drawer')) ACT.ctrl({ dataset: { id: el.dataset.id } });
};
CHG.field = el => {
  const v = el.value.slice(0, el.dataset.max ? +el.dataset.max : 2000);
  const inPanel = !!el.closest('#drawer');
  setCtrl(el.dataset.id, { [el.dataset.field]: v }, inPanel);
  toast('Guardado');
};
INP.filter = debounce(el => { S.f[S.view] = Object.assign({}, S.f[S.view], { [el.dataset.key]: el.value }); render(); }, 160);
CHG.filter = el => { S.f[S.view] = Object.assign({}, S.f[S.view], { [el.dataset.key]: el.type === 'checkbox' ? el.checked : el.value }); render(); };

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (t && own(ACT, t.dataset.act)) { e.preventDefault(); ACT[t.dataset.act](t, e); return; }
  if (e.target.id === 'drawer') closeDrawer();
  if (e.target.id === 'modal') closeModal();
});
document.addEventListener('change', e => { const t = e.target.closest('[data-chg]'); if (t && own(CHG, t.dataset.chg)) CHG[t.dataset.chg](t, e); });
document.addEventListener('input', e => { const t = e.target.closest('[data-inp]'); if (t && own(INP, t.dataset.inp)) INP[t.dataset.inp](t, e); });
document.addEventListener('keydown', e => {
  const modal = document.getElementById('modal'), drawer = document.getElementById('drawer');
  if (e.key === 'Escape') { if (!modal.hidden) closeModal(); else closeDrawer(); }
  if (e.key === 'Tab') {
    const open = !modal.hidden ? modal : (!drawer.hidden ? drawer : null);
    if (!open) return;
    const els = Array.from(open.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')).filter(x => !x.disabled);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
