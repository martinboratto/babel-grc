/*!
 * Babel GRC · motor de cálculo multinorma (sin DOM).
 * Funciona en el navegador (window.BabelEngine) y en Node (require).
 * Licencia MIT.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BabelEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STRENGTH = { full: 1, partial: 0.5, related: 0 };
  var STRENGTH_LABEL = { full: 'Total', partial: 'Parcial', related: 'Relación' };
  var STATUS = { implemented: 1, partial: 0.5, pending: 0, na: 0 };
  var STATUS_LABEL = { implemented: 'Implantado', partial: 'Parcial', pending: 'Pendiente', na: 'No aplica' };
  var FW_ID = /^[a-z0-9][a-z0-9._-]{1,48}$/;
  var CTRL_ID = /^[A-Z]{2,5}-[A-Z0-9]{1,6}$/;
  var REVIEW_MONTHS = 12;

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function str(x) { return typeof x === 'string' ? x : (x === null || x === undefined ? '' : String(x)); }
  function round(x, d) { var p = Math.pow(10, d || 3); return Math.round(x * p) / p; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ------------------------------------------------------------------ *
   * Modelo                                                             *
   * ------------------------------------------------------------------ */

  /**
   * Construye el índice a partir del catálogo común y de los marcos.
   * Un marco puede aportar controles nuevos en `controls` (se suman al catálogo).
   */
  function buildModel(catalog, frameworks) {
    var model = {
      domains: (catalog.domains || []).slice(),
      controls: new Map(),
      frameworks: new Map(),
      requirements: new Map(), // clave: fwId + '|' + reqId
      byControl: new Map(),    // controlId -> [{fw, req, key, strength}]
      order: []
    };
    var domainIds = new Set(model.domains.map(function (d) { return d.id; }));
    (catalog.controls || []).forEach(function (c) {
      model.controls.set(c.id, Object.assign({ origin: 'catalog' }, c));
    });
    (frameworks || []).forEach(function (fw) {
      (fw.controls || []).forEach(function (c) {
        if (model.controls.has(c.id)) return;
        model.controls.set(c.id, Object.assign({ origin: fw.id }, c));
        if (c.domain && !domainIds.has(c.domain)) {
          domainIds.add(c.domain);
          model.domains.push({ id: c.domain, title: c.domainTitle || ('Dominio ' + c.domain), description: '' });
        }
      });
    });
    model.controls.forEach(function (c, id) { model.byControl.set(id, []); });
    (frameworks || []).forEach(function (fw) {
      if (model.frameworks.has(fw.id)) return;
      model.frameworks.set(fw.id, fw);
      model.order.push(fw.id);
      fw.requirements.forEach(function (r) {
        var key = rkey(fw.id, r.id);
        model.requirements.set(key, Object.assign({}, r, { fw: fw.id, key: key }));
        (r.mappings || []).forEach(function (m) {
          var list = model.byControl.get(m.control);
          if (list) list.push({ fw: fw.id, req: r.id, key: key, strength: m.strength });
        });
      });
    });
    return model;
  }
  function rkey(fwId, reqId) { return fwId + '|' + reqId; }

  /* ------------------------------------------------------------------ *
   * Validación de marcos: la puerta de entrada de los marcos nuevos     *
   * ------------------------------------------------------------------ */

  function validateFramework(fw, catalog, opts) {
    opts = opts || {};
    var errors = [], warnings = [];
    if (!isObj(fw)) return { ok: false, errors: ['El archivo no contiene un objeto de marco.'], warnings: [], stats: null };
    if (!FW_ID.test(str(fw.id))) errors.push('«id» obligatorio: minúsculas, números, punto, guion o guion bajo (2–49 caracteres). Ej.: «nis2» o «bcra-a7724».');
    if (!str(fw.name).trim()) errors.push('«name» (nombre del marco) es obligatorio.');
    if (str(fw.name).length > 160) errors.push('«name» supera 160 caracteres.');
    if (fw.color && !/^#[0-9a-fA-F]{6}$/.test(str(fw.color))) warnings.push('«color» debe ser hexadecimal (#RRGGBB); se usará uno por defecto.');
    if (fw.url && !/^https:\/\//.test(str(fw.url))) warnings.push('«url» debería empezar con https://; se ignorará.');
    if (opts.existingIds && opts.existingIds.indexOf(fw.id) >= 0 && !opts.allowReplace) errors.push('Ya existe un marco con id «' + fw.id + '».');

    var known = new Set((catalog.controls || []).map(function (c) { return c.id; }));
    if (fw.controls !== undefined && !Array.isArray(fw.controls)) errors.push('«controls» debe ser una lista.');
    var newCtrls = Array.isArray(fw.controls) ? fw.controls : [];
    newCtrls.forEach(function (c, i) {
      if (!isObj(c)) { errors.push('Control nuevo #' + (i + 1) + ' no es un objeto.'); return; }
      if (!CTRL_ID.test(str(c.id))) errors.push('Control nuevo «' + str(c.id) + '»: el id debe tener el formato DOM-NN (ej.: «AIG-01»).');
      else if (known.has(c.id)) errors.push('Control nuevo «' + c.id + '» ya existe: usá ese id en los mapeos sin redefinirlo.');
      if (!str(c.title).trim()) errors.push('Control nuevo «' + str(c.id) + '» sin título.');
      if (c.domain && !/^[A-Z]{2,5}$/.test(str(c.domain))) errors.push('Control nuevo «' + str(c.id) + '»: el dominio debe tener 2–5 mayúsculas.');
      known.add(c.id);
    });

    if (fw.groups !== undefined && !Array.isArray(fw.groups)) errors.push('«groups» debe ser una lista.');
    var groups = new Set();
    (Array.isArray(fw.groups) ? fw.groups : []).forEach(function (g) { if (isObj(g) && g.id !== undefined) groups.add(str(g.id)); });

    if (!Array.isArray(fw.requirements) || fw.requirements.length === 0) {
      errors.push('«requirements» debe ser una lista con al menos un requisito.');
      return { ok: false, errors: errors, warnings: warnings, stats: null };
    }
    if (fw.requirements.length > 5000) errors.push('Más de 5000 requisitos: dividí el marco en partes.');
    var seen = new Set(), unmapped = 0, mappings = 0, onlyRelated = 0;
    fw.requirements.forEach(function (r, i) {
      var where = 'Requisito #' + (i + 1) + (r && r.id ? ' («' + str(r.id) + '»)' : '');
      if (!isObj(r)) { errors.push(where + ' no es un objeto.'); return; }
      if (!str(r.id).trim()) errors.push(where + ': falta «id».');
      else if (str(r.id).length > 80) errors.push(where + ': «id» supera 80 caracteres.');
      else if (seen.has(str(r.id))) errors.push(where + ': «id» repetido.');
      seen.add(str(r.id));
      if (!str(r.title).trim()) errors.push(where + ': falta «title».');
      if (str(r.title).length > 300) errors.push(where + ': «title» supera 300 caracteres.');
      if (str(r.summary).length > 2000) errors.push(where + ': «summary» supera 2000 caracteres.');
      if (r.group !== undefined && r.group !== '' && groups.size && !groups.has(str(r.group))) warnings.push(where + ': el grupo «' + str(r.group) + '» no está en «groups».');
      if (r.mappings !== undefined && !Array.isArray(r.mappings)) { errors.push(where + ': «mappings» debe ser una lista.'); return; }
      var ms = r.mappings || [];
      if (ms.length === 0) unmapped++;
      var eff = 0, ctrlSeen = new Set();
      ms.forEach(function (m) {
        mappings++;
        if (!isObj(m)) { errors.push(where + ': mapeo inválido.'); return; }
        if (!known.has(m.control)) errors.push(where + ': el control «' + str(m.control) + '» no existe en el catálogo común ni entre los controles nuevos del marco.');
        if (!own(STRENGTH, m.strength)) errors.push(where + ': fuerza «' + str(m.strength) + '» no válida (full, partial o related).');
        if (ctrlSeen.has(m.control)) warnings.push(where + ': el control «' + str(m.control) + '» está mapeado dos veces.');
        ctrlSeen.add(m.control);
        if (STRENGTH[m.strength] > 0) eff++;
      });
      if (ms.length && !eff) onlyRelated++;
    });
    if (unmapped) warnings.push(unmapped + ' requisito(s) sin mapear: no se pueden evaluar hasta asociarlos a controles.');
    if (onlyRelated) warnings.push(onlyRelated + ' requisito(s) solo con enlaces de relación: no cuentan para el cumplimiento.');
    return {
      ok: errors.length === 0, errors: errors, warnings: warnings,
      stats: { requirements: fw.requirements.length, mappings: mappings, unmapped: unmapped, newControls: newCtrls.length }
    };
  }

  /** Normaliza un marco validado: valores por defecto y descarte de campos desconocidos. */
  function normalizeFramework(fw) {
    var out = {
      id: str(fw.id).trim(), name: str(fw.name).trim(),
      shortName: str(fw.shortName || fw.name).trim().slice(0, 40),
      version: str(fw.version).slice(0, 120), publisher: str(fw.publisher).slice(0, 120),
      jurisdiction: str(fw.jurisdiction).slice(0, 120), type: str(fw.type || 'marco').slice(0, 40),
      color: /^#[0-9a-fA-F]{6}$/.test(str(fw.color)) ? fw.color : '#8A5CF5',
      url: /^https:\/\//.test(str(fw.url)) ? str(fw.url).slice(0, 500) : '',
      description: str(fw.description).slice(0, 2000), notice: str(fw.notice).slice(0, 2000),
      frameworkVersion: str(fw.frameworkVersion || '1.0.0').slice(0, 20),
      groups: (Array.isArray(fw.groups) ? fw.groups : []).filter(isObj).map(function (g) { return { id: str(g.id), title: str(g.title || g.id).slice(0, 200) }; }),
      requirements: fw.requirements.map(function (r) {
        var o = {
          id: str(r.id).trim(), ref: str(r.ref || r.id).slice(0, 80), group: str(r.group),
          title: str(r.title).trim(), summary: str(r.summary), excludable: r.excludable !== false,
          mappings: (r.mappings || []).map(function (m) { return { control: str(m.control), strength: m.strength }; })
        };
        if (r.note) o.note = str(r.note).slice(0, 1000);
        return o;
      })
    };
    if (Array.isArray(fw.controls) && fw.controls.length) {
      out.controls = fw.controls.map(function (c) {
        return { id: str(c.id), domain: str(c.domain || 'EXT'), title: str(c.title).slice(0, 200), description: str(c.description).slice(0, 1000) };
      });
    }
    if (!out.groups.length) {
      var gs = [];
      out.requirements.forEach(function (r) { if (r.group && gs.indexOf(r.group) < 0) gs.push(r.group); });
      out.groups = gs.map(function (g) { return { id: g, title: g }; });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Proyectos                                                          *
   * ------------------------------------------------------------------ */

  function newProject(name, scope) {
    return {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: str(name || 'Proyecto sin nombre').slice(0, 120),
      scope: (scope || []).slice(),
      controls: {}, exclusions: {},
      created: new Date().toISOString().slice(0, 10)
    };
  }

  function ctrlState(project, id) {
    var all = (project && project.controls) || {};
    var s = own(all, id) ? all[id] : {};
    return {
      status: own(STATUS, s.status) ? s.status : 'pending',
      owner: str(s.owner), evidence: str(s.evidence), reviewed: str(s.reviewed),
      due: str(s.due), plan: s.plan === 'doing' || s.plan === 'done' ? s.plan : 'todo', notes: str(s.notes)
    };
  }

  function isExcluded(project, fwId, reqId) {
    var ex = project && project.exclusions && own(project.exclusions, fwId) ? project.exclusions[fwId] : null;
    return !!(ex && own(ex, reqId));
  }

  /* ------------------------------------------------------------------ *
   * Cálculo                                                            *
   * ------------------------------------------------------------------ */

  /**
   * Cobertura de un requisito:
   *   cobertura(r) = max(w) · Σ w·estado / Σ w
   * w = 1 (total), 0,5 (parcial), 0 (relación). Un requisito con solo enlaces
   * parciales no supera el 50 %. Si Σ w = 0 el requisito queda «sin mapear».
   * `override` (Set de controles) simula esos controles como implantados.
   */
  function requirementCoverage(model, project, fwId, reqId, override) {
    var r = model.requirements.get(rkey(fwId, reqId));
    if (!r) return null;
    var links = (r.mappings || []).filter(function (m) { return model.controls.has(m.control); }).map(function (m) {
      var st = override && override.has(m.control) ? 'implemented' : ctrlState(project, m.control).status;
      return { control: m.control, strength: m.strength, weight: STRENGTH[m.strength], status: st, value: STATUS[st] };
    });
    var excluded = isExcluded(project, fwId, reqId);
    var sw = 0, swv = 0, maxw = 0;
    links.forEach(function (l) { sw += l.weight; swv += l.weight * l.value; if (l.weight > maxw) maxw = l.weight; });
    var value = sw > 0 ? maxw * swv / sw : 0;
    var state;
    if (excluded) state = 'excluded';
    else if (sw === 0) state = 'unmapped';
    else if (value >= 0.9999) state = 'covered';
    else if (value > 0) state = 'partial';
    else state = 'gap';
    return { req: r, value: round(value, 4), state: state, links: links, excluded: excluded, cap: maxw };
  }

  function frameworkScore(model, project, fwId, override) {
    var fw = model.frameworks.get(fwId);
    var res = { fw: fwId, score: 0, total: 0, applicable: 0, counts: { covered: 0, partial: 0, gap: 0, unmapped: 0, excluded: 0 } };
    if (!fw) return res;
    var sum = 0;
    fw.requirements.forEach(function (r) {
      var c = requirementCoverage(model, project, fwId, r.id, override);
      res.total++;
      res.counts[c.state]++;
      if (c.state !== 'excluded') { res.applicable++; sum += c.value; }
    });
    res.score = res.applicable ? round(sum / res.applicable, 4) : 0;
    return res;
  }

  function inScope(model, project) {
    return (project.scope || []).filter(function (id) { return model.frameworks.has(id); });
  }

  /** Prioridad: cobertura que añade implantar el control, sumada sobre los marcos del alcance. */
  function priorities(model, project) {
    var scope = inScope(model, project);
    var base = {};
    scope.forEach(function (f) { base[f] = frameworkScore(model, project, f).score; });
    var out = [];
    model.controls.forEach(function (c, id) {
      var st = ctrlState(project, id).status;
      if (st === 'implemented' || st === 'na') return;
      var links = (model.byControl.get(id) || []).filter(function (l) {
        return scope.indexOf(l.fw) >= 0 && STRENGTH[l.strength] > 0 && !isExcluded(project, l.fw, l.req);
      });
      if (!links.length) return;
      var ov = new Set([id]), gain = 0, per = {}, fws = {};
      links.forEach(function (l) { fws[l.fw] = true; });
      Object.keys(fws).forEach(function (f) {
        var g = frameworkScore(model, project, f, ov).score - base[f];
        per[f] = round(g, 4); gain += g;
      });
      out.push({ control: id, status: st, gain: round(gain, 4), perFramework: per, requirements: links.length });
    });
    out.sort(function (a, b) { return b.gain - a.gain || b.requirements - a.requirements || (a.control < b.control ? -1 : 1); });
    return out;
  }

  /** Requisitos equivalentes en otros marcos, a través de controles compartidos. */
  function equivalences(model, fwId, reqId) {
    var r = model.requirements.get(rkey(fwId, reqId));
    if (!r) return [];
    var best = new Map();
    (r.mappings || []).forEach(function (m) {
      (model.byControl.get(m.control) || []).forEach(function (l) {
        if (l.fw === r.fw) return;
        var w = Math.min(STRENGTH[m.strength], STRENGTH[l.strength]);
        var s = w === 1 ? 'full' : (w > 0 ? 'partial' : 'related');
        var cur = best.get(l.key);
        if (!cur) best.set(l.key, { fw: l.fw, req: l.req, strength: s, weight: w, via: [m.control] });
        else {
          if (cur.via.indexOf(m.control) < 0) cur.via.push(m.control);
          if (w > cur.weight) { cur.weight = w; cur.strength = s; }
        }
      });
    });
    return Array.from(best.values()).sort(function (a, b) { return b.weight - a.weight || (a.fw + a.req < b.fw + b.req ? -1 : 1); });
  }

  /** Solapamiento A → B: parte de B cubierta si se implantan los controles que A exige con enlace total. */
  function overlap(model, a, b) {
    var fa = model.frameworks.get(a);
    if (!fa || !model.frameworks.has(b)) return 0;
    var set = new Set();
    fa.requirements.forEach(function (r) { (r.mappings || []).forEach(function (m) { if (m.strength === 'full') set.add(m.control); }); });
    return frameworkScore(model, { controls: {}, exclusions: {} }, b, set).score;
  }

  function monthsSince(isoDate, now) {
    var d = Date.parse(isoDate + 'T00:00:00Z');
    if (isNaN(d)) return Infinity;
    return (now - d) / (1000 * 60 * 60 * 24 * 30.44);
  }

  /** Reglas de coherencia, independientes del marco. */
  function coherence(model, project, now) {
    now = now || Date.now();
    var today = new Date(now).toISOString().slice(0, 10);
    var scope = inScope(model, project);
    var alerts = [];
    var used = new Map();
    scope.forEach(function (f) {
      model.frameworks.get(f).requirements.forEach(function (r) {
        if (isExcluded(project, f, r.id)) return;
        (r.mappings || []).forEach(function (m) {
          if (STRENGTH[m.strength] > 0 && model.controls.has(m.control)) {
            if (!used.has(m.control)) used.set(m.control, []);
            used.get(m.control).push(model.frameworks.get(f).shortName + ' ' + (r.ref || r.id));
          }
        });
      });
    });
    used.forEach(function (reqs, id) {
      var s = ctrlState(project, id);
      if ((s.status === 'implemented' || s.status === 'partial') && !s.evidence.trim())
        alerts.push({ rule: 'sin-evidencia', severity: 'media', control: id, message: 'Control ' + STATUS_LABEL[s.status].toLowerCase() + ' sin evidencias registradas.' });
      if ((s.status === 'implemented' || s.status === 'partial') && !s.owner.trim())
        alerts.push({ rule: 'sin-responsable', severity: 'baja', control: id, message: 'Control sin responsable asignado.' });
      if (s.status === 'implemented') {
        if (!s.reviewed) alerts.push({ rule: 'sin-revision', severity: 'baja', control: id, message: 'Control implantado sin fecha de revisión.' });
        else if (monthsSince(s.reviewed, now) > REVIEW_MONTHS) alerts.push({ rule: 'revision-vencida', severity: 'media', control: id, message: 'Última revisión hace más de ' + REVIEW_MONTHS + ' meses (' + s.reviewed + ').' });
      }
      if (s.status === 'na')
        alerts.push({ rule: 'na-requerido', severity: 'alta', control: id, message: 'Marcado «No aplica», pero lo exigen ' + reqs.length + ' requisito(s) aplicables: ' + reqs.slice(0, 3).join(', ') + (reqs.length > 3 ? '…' : '') + '.' });
      if (s.due && s.status !== 'implemented' && s.due < today)
        alerts.push({ rule: 'plazo-vencido', severity: 'media', control: id, message: 'Fecha objetivo vencida (' + s.due + ').' });
    });
    scope.forEach(function (f) {
      var fw = model.frameworks.get(f);
      var ex = (project.exclusions && own(project.exclusions, f) && project.exclusions[f]) || {};
      Object.keys(ex).forEach(function (rid) {
        var r = model.requirements.get(rkey(f, rid));
        if (!r) return;
        if (r.excludable === false) alerts.push({ rule: 'exclusion-no-permitida', severity: 'alta', fw: f, req: rid, message: (r.ref || rid) + ' no admite exclusión en ' + fw.shortName + '.' });
        if (!str(ex[rid]).trim()) alerts.push({ rule: 'exclusion-sin-justificar', severity: 'media', fw: f, req: rid, message: 'Exclusión de ' + (r.ref || rid) + ' sin justificación.' });
        equivalences(model, f, rid).forEach(function (e) {
          if (e.strength === 'full' && scope.indexOf(e.fw) >= 0 && !isExcluded(project, e.fw, e.req)) {
            var o = model.requirements.get(rkey(e.fw, e.req));
            alerts.push({ rule: 'exclusion-contradictoria', severity: 'media', fw: f, req: rid, message: (r.ref || rid) + ' está excluido en ' + fw.shortName + ', pero su equivalente ' + (o.ref || o.id) + ' es aplicable en ' + model.frameworks.get(e.fw).shortName + '.' });
          }
        });
      });
      var unm = fw.requirements.filter(function (r) {
        return !isExcluded(project, f, r.id) && !(r.mappings || []).some(function (m) { return STRENGTH[m.strength] > 0 && model.controls.has(m.control); });
      });
      if (unm.length) alerts.push({ rule: 'sin-mapear', severity: 'alta', fw: f, message: unm.length + ' requisito(s) de ' + fw.shortName + ' sin controles asociados: no se pueden evaluar.' });
    });
    var rank = { alta: 0, media: 1, baja: 2 };
    alerts.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
    return alerts;
  }

  /** Controles exigidos por el alcance, agrupados por dominio y estado. */
  function domainSummary(model, project) {
    var used = new Set();
    inScope(model, project).forEach(function (f) {
      model.frameworks.get(f).requirements.forEach(function (r) {
        if (isExcluded(project, f, r.id)) return;
        (r.mappings || []).forEach(function (m) { if (STRENGTH[m.strength] > 0) used.add(m.control); });
      });
    });
    return model.domains.map(function (d) {
      var row = { domain: d.id, title: d.title, implemented: 0, partial: 0, pending: 0, na: 0, total: 0 };
      used.forEach(function (id) {
        var c = model.controls.get(id);
        if (c && c.domain === d.id) { row[ctrlState(project, id).status]++; row.total++; }
      });
      return row;
    }).filter(function (r) { return r.total > 0; });
  }

  /* ------------------------------------------------------------------ *
   * Plantilla de hoja de cálculo ↔ marco                               *
   * ------------------------------------------------------------------ */

  function norm(h) {
    return str(h).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
  function splitIds(v) { return str(v).split(/[,;\n]+/).map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean); }
  function yes(v) { var s = norm(v); return ['si', 's', 'yes', 'y', 'true', '1', 'x'].indexOf(s) >= 0; }
  function rowsToObjects(rows) {
    if (!rows || !rows.length) return [];
    var head = rows[0].map(norm);
    return rows.slice(1).filter(function (r) { return r && r.some(function (c) { return str(c).trim() !== ''; }); }).map(function (r) {
      var o = {};
      head.forEach(function (h, i) { if (h) o[h] = r[i] === undefined || r[i] === null ? '' : r[i]; });
      return o;
    });
  }

  /**
   * Convierte las hojas de la plantilla (matrices de celdas) en un marco.
   * sheets: { Marco: [[clave, valor]…], Grupos: [[id, titulo]…], Requisitos: [[…]…], Controles_nuevos: [[…]…] }
   */
  function frameworkFromSheets(sheets) {
    var keys = {};
    Object.keys(sheets || {}).forEach(function (k) { keys[norm(k)] = sheets[k]; });
    var meta = {};
    (keys.marco || []).forEach(function (row) {
      if (row && norm(row[0]) && norm(row[0]) !== 'clave') meta[norm(row[0])] = str(row[1]).trim();
    });
    var fw = {
      id: meta.id, name: meta.nombre || meta.name, shortName: meta.nombre_corto || meta.short_name,
      version: meta.version, publisher: meta.emisor || meta.publisher, jurisdiction: meta.jurisdiccion || meta.jurisdiction,
      type: meta.tipo || meta.type, color: meta.color, url: meta.url, description: meta.descripcion || meta.description,
      notice: meta.aviso || meta.notice, frameworkVersion: meta.version_del_archivo || '1.0.0'
    };
    fw.groups = rowsToObjects(keys.grupos).map(function (g) { return { id: str(g.id).trim(), title: str(g.titulo || g.title || g.id).trim() }; }).filter(function (g) { return g.id; });
    fw.requirements = rowsToObjects(keys.requisitos).map(function (r) {
      var maps = [];
      [['controles_total', 'full'], ['controles_parcial', 'partial'], ['controles_relacion', 'related']].forEach(function (p) {
        splitIds(r[p[0]]).forEach(function (c) { maps.push({ control: c, strength: p[1] }); });
      });
      var o = {
        id: str(r.id).trim(), ref: str(r.referencia || r.ref || r.id).trim(), group: str(r.grupo || r.group).trim(),
        title: str(r.titulo || r.title).trim(), summary: str(r.descripcion || r.resumen || r.summary).trim(),
        excludable: str(r.excluible).trim() === '' ? true : yes(r.excluible), mappings: maps
      };
      if (str(r.nota || r.note).trim()) o.note = str(r.nota || r.note).trim();
      return o;
    });
    var nc = rowsToObjects(keys.controles_nuevos).map(function (c) {
      return { id: str(c.id).trim().toUpperCase(), domain: str(c.dominio || c.domain).trim().toUpperCase(), title: str(c.titulo || c.title).trim(), description: str(c.descripcion || c.description).trim() };
    }).filter(function (c) { return c.id; });
    if (nc.length) fw.controls = nc;
    return fw;
  }

  /** Inversa de frameworkFromSheets: matrices listas para escribir la plantilla. */
  function frameworkToSheets(fw) {
    var by = function (r, s) { return (r.mappings || []).filter(function (m) { return m.strength === s; }).map(function (m) { return m.control; }).join(', '); };
    return {
      Marco: [['clave', 'valor'], ['id', fw.id || ''], ['nombre', fw.name || ''], ['nombre_corto', fw.shortName || ''], ['version', fw.version || ''],
        ['emisor', fw.publisher || ''], ['jurisdiccion', fw.jurisdiction || ''], ['tipo', fw.type || ''], ['color', fw.color || ''],
        ['url', fw.url || ''], ['descripcion', fw.description || ''], ['aviso', fw.notice || '']],
      Grupos: [['id', 'titulo']].concat((fw.groups || []).map(function (g) { return [g.id, g.title]; })),
      Requisitos: [['id', 'referencia', 'grupo', 'titulo', 'descripcion', 'excluible', 'controles_total', 'controles_parcial', 'controles_relacion', 'nota']]
        .concat((fw.requirements || []).map(function (r) {
          return [r.id, r.ref || '', r.group || '', r.title || '', r.summary || '', r.excludable === false ? 'no' : 'sí', by(r, 'full'), by(r, 'partial'), by(r, 'related'), r.note || ''];
        })),
      Controles_nuevos: [['id', 'dominio', 'titulo', 'descripcion']].concat((fw.controls || []).map(function (c) { return [c.id, c.domain, c.title, c.description || '']; }))
    };
  }

  /* ------------------------------------------------------------------ *
   * Exportación                                                        *
   * ------------------------------------------------------------------ */

  /** Neutraliza fórmulas al exportar a CSV u hojas de cálculo. */
  function safeCell(v) {
    var s = str(v);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }
  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (c) { var s = safeCell(c); return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    }).join('\r\n');
  }

  var STATE_LABEL = { covered: 'Cubierto', partial: 'Parcial', gap: 'Brecha', unmapped: 'Sin mapear', excluded: 'Excluido' };

  function soaRows(model, project, fwId) {
    var fw = model.frameworks.get(fwId);
    var rows = [['Referencia', 'Requisito', 'Grupo', 'Aplicable', 'Justificación de exclusión', 'Cobertura %', 'Estado', 'Controles (total)', 'Controles (parcial)', 'Responsables']];
    fw.requirements.forEach(function (r) {
      var c = requirementCoverage(model, project, fwId, r.id);
      var ex = c.excluded ? str(project.exclusions[fwId][r.id]) : '';
      var owners = [];
      c.links.forEach(function (l) { var o = ctrlState(project, l.control).owner; if (o && owners.indexOf(o) < 0) owners.push(o); });
      var lst = function (s) { return c.links.filter(function (l) { return l.strength === s; }).map(function (l) { return l.control + ' (' + STATUS_LABEL[l.status] + ')'; }).join('; '); };
      rows.push([r.ref, r.title, r.group, c.excluded ? 'No' : 'Sí', ex, Math.round(c.value * 100), STATE_LABEL[c.state], lst('full'), lst('partial'), owners.join('; ')]);
    });
    return rows;
  }

  function controlRows(model, project) {
    var scope = inScope(model, project);
    var rows = [['Control', 'Dominio', 'Título', 'Estado', 'Responsable', 'Evidencias', 'Última revisión', 'Fecha objetivo', 'Plan', 'Marcos', 'Requisitos']];
    var PLAN = { todo: 'Pendiente', doing: 'En curso', done: 'Hecha' };
    model.controls.forEach(function (c, id) {
      var links = (model.byControl.get(id) || []).filter(function (l) { return scope.indexOf(l.fw) >= 0; });
      if (!links.length) return;
      var s = ctrlState(project, id), fws = [];
      links.forEach(function (l) { var n = model.frameworks.get(l.fw).shortName; if (fws.indexOf(n) < 0) fws.push(n); });
      rows.push([id, c.domain, c.title, STATUS_LABEL[s.status], s.owner, s.evidence, s.reviewed, s.due, PLAN[s.plan], fws.join('; '),
        links.map(function (l) { var r = model.requirements.get(l.key); return model.frameworks.get(l.fw).shortName + ' ' + (r.ref || r.id); }).join('; ')]);
    });
    return rows;
  }

  function markdownReport(model, project, now) {
    var date = new Date(now || Date.now()).toISOString().slice(0, 10);
    var md = function (s) { return str(s).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' '); };
    var L = ['# Informe de cumplimiento · ' + md(project.name), '', '_Generado con Babel GRC el ' + date + '._', '',
      '## Grado de cumplimiento', '', '| Marco | Cumplimiento | Cubiertos | Parciales | Brechas | Sin mapear | Excluidos |', '|---|---:|---:|---:|---:|---:|---:|'];
    inScope(model, project).forEach(function (f) {
      var s = frameworkScore(model, project, f), fw = model.frameworks.get(f);
      L.push('| ' + md(fw.name) + ' | ' + Math.round(s.score * 100) + ' % | ' + s.counts.covered + ' | ' + s.counts.partial + ' | ' + s.counts.gap + ' | ' + s.counts.unmapped + ' | ' + s.counts.excluded + ' |');
    });
    L.push('', '## Prioridades de implantación', '', '| # | Control | Estado | Aporte |', '|---:|---|---|---:|');
    priorities(model, project).slice(0, 15).forEach(function (p, i) {
      L.push('| ' + (i + 1) + ' | ' + p.control + ' · ' + md(model.controls.get(p.control).title) + ' | ' + STATUS_LABEL[p.status] + ' | +' + (p.gain * 100).toFixed(1) + ' pp |');
    });
    var al = coherence(model, project, now);
    L.push('', '## Alertas de coherencia (' + al.length + ')', '');
    if (!al.length) L.push('Sin alertas.');
    al.forEach(function (a) { L.push('- **' + a.severity + '** · ' + md(a.control || a.req || a.fw || '') + ' · ' + md(a.message)); });
    inScope(model, project).forEach(function (f) {
      var fw = model.frameworks.get(f);
      var gaps = fw.requirements.map(function (r) { return requirementCoverage(model, project, f, r.id); }).filter(function (c) { return c.state === 'gap' || c.state === 'unmapped'; });
      L.push('', '## Brechas · ' + md(fw.shortName) + ' (' + gaps.length + ')', '');
      gaps.forEach(function (c) { L.push('- ' + md(c.req.ref) + ' · ' + md(c.req.title)); });
    });
    return L.join('\n') + '\n';
  }

  return {
    STRENGTH: STRENGTH, STRENGTH_LABEL: STRENGTH_LABEL, STATUS: STATUS, STATUS_LABEL: STATUS_LABEL, STATE_LABEL: STATE_LABEL,
    buildModel: buildModel, rkey: rkey, validateFramework: validateFramework, normalizeFramework: normalizeFramework,
    newProject: newProject, ctrlState: ctrlState, isExcluded: isExcluded,
    requirementCoverage: requirementCoverage, frameworkScore: frameworkScore, priorities: priorities,
    equivalences: equivalences, overlap: overlap, coherence: coherence, domainSummary: domainSummary,
    frameworkFromSheets: frameworkFromSheets, frameworkToSheets: frameworkToSheets,
    safeCell: safeCell, csv: csv, soaRows: soaRows, controlRows: controlRows, markdownReport: markdownReport
  };
});
