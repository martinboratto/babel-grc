/*!
 * Babel GRC · importación de marcos desde PDF (sin DOM).
 * Convierte el texto extraído de un PDF en requisitos y sugiere controles del catálogo.
 * Funciona en el navegador (window.BabelPdf) y en Node (require). Licencia MIT.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BabelPdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function str(x) { return typeof x === 'string' ? x : (x === null || x === undefined ? '' : String(x)); }
  function clean(s) { return str(s).replace(/­/g, '').replace(/[  -​]/g, ' ').replace(/\s+/g, ' ').trim(); }

  /* ------------------------------------------------------------------ *
   * 1. Texto: ítems de pdf.js → líneas → páginas limpias                *
   * ------------------------------------------------------------------ */

  /** Agrupa los ítems de texto de una página (pdf.js getTextContent) en líneas legibles. */
  function itemsToLines(items) {
    var rows = [];
    (items || []).forEach(function (it) {
      if (!it || typeof it.str !== 'string') return;
      var t = it.transform || [1, 0, 0, 1, 0, 0];
      var x = t[4], y = t[5], h = Math.abs(t[3]) || Math.abs(it.height) || 10;
      var row = null;
      for (var i = rows.length - 1; i >= 0 && i >= rows.length - 4; i--) {
        if (Math.abs(rows[i].y - y) <= Math.max(2, h * 0.35)) { row = rows[i]; break; }
      }
      if (!row) { row = { y: y, h: h, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, w: it.width || 0, s: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var out = '', end = null;
      r.parts.forEach(function (p) {
        if (out && end !== null && p.x - end > r.h * 0.15 && !/\s$/.test(out) && !/^\s/.test(p.s)) out += ' ';
        out += p.s;
        end = p.x + p.w;
      });
      return clean(out);
    }).filter(Boolean);
  }

  // Títulos que nunca se descartan como encabezado o pie repetido aunque aparezcan arriba de varias páginas
  var HEADING = /^(art[íi]culo|art\.|article|cap[íi]tulo|chapter|secci[óo]n|section|t[íi]tulo|title|anexo|annex|parte|part)\s+\S+|^(?:[A-Z]{1,2}\.)?\d{1,2}(?:\.\d{1,3}){1,3}\.?\s+\S/i;
  var TOC = /(\.\s?){4,}\s*\d{1,4}$|…{2,}\s*\d{1,4}$/;
  function shape(l) { return l.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' '); }

  /**
   * Une las páginas en una sola lista de líneas, quitando encabezados y pies repetidos,
   * números de página e índices (líneas con puntos de relleno y número de página).
   */
  function cleanPages(pages) {
    var n = pages.length, freq = {};
    pages.forEach(function (lines) {
      var seen = {};
      lines.slice(0, 4).concat(lines.slice(-4)).forEach(function (l) { var k = shape(l); if (!seen[k]) { seen[k] = 1; freq[k] = (freq[k] || 0) + 1; } });
    });
    var limit = Math.max(3, Math.ceil(n * 0.3));
    var out = [];
    pages.forEach(function (lines) {
      lines.forEach(function (l, i) {
        var edge = i < 4 || i >= lines.length - 4;
        if (edge && n >= 4 && freq[shape(l)] >= limit && !HEADING.test(l)) return;
        if (/^(p[aá]gina|page)?\s*\d{1,4}(\s*(de|of|\/)\s*\d{1,4})?$/i.test(l)) return;
        if (TOC.test(l)) return;
        out.push(l);
      });
    });
    // Unir palabras cortadas con guion al final de línea
    for (var i = 0; i < out.length - 1; i++) {
      if (/[a-záéíóúñ]-$/i.test(out[i]) && /^[a-záéíóúñ]/.test(out[i + 1])) {
        var m = /^(\S+)\s?(.*)$/.exec(out[i + 1]);
        out[i] = out[i].slice(0, -1) + m[1];
        out[i + 1] = m[2];
      }
    }
    return out.filter(Boolean);
  }

  /* ------------------------------------------------------------------ *
   * 2. Detección de requisitos                                          *
   * ------------------------------------------------------------------ */

  var GROUP = /^(cap[íi]tulo|t[íi]tulo|secci[óo]n|chapter|title|part|parte|anexo|annex)\s+([IVXLC]+|\d{1,3}|[A-Z])\b[.:\-–—]?\s*(.*)$/i;

  var PATTERNS = [
    {
      id: 'articulo', label: 'Artículos (Artículo 5, Art. 12, Article 3…)',
      re: /^(?:art[íi]culo|art\.|article)\s*(\d{1,3}(?:\s?(?:bis|ter|quater))?|[IVXLC]{1,6})\s*[º°ª]?\s*(?:[.:\-–—]\s*)?(.*)$/i,
      ref: function (m) { return 'Art. ' + m[1].replace(/\s+/g, ' '); },
      ok: function (line, m) {
        var rest = m[2];
        if (!/^[AÁ]/.test(line) || rest.length > 120) return false;
        if (/^[,;(]|^(apartado|párrafo|paragraph|point|letra|del?|of|y|and|or|o|en|in|to|a)\b/i.test(rest)) return false;
        if (/\b(of|del|de la|de los)\s+(this|the|presente|dicho)?\s*(Regulation|Directive|Reglamento|Directiva|Decisi[óo]n|Decision|Ley|Law)\b/i.test(rest)) return false;
        return !/[;,]$/.test(rest) && (rest === '' || /^[A-ZÁÉÍÓÚÑ¿"«]/.test(rest));
      }
    },
    {
      id: 'clausula', label: 'Cláusulas numeradas (4.1, 6.1.2, A.5.15…)',
      re: /^((?:[A-Z]{1,2}\.)?\d{1,2}(?:\.\d{1,3}){1,3})\.?\s+([A-ZÁÉÍÓÚÑ¿(].{1,170})$/,
      ref: function (m) { return m[1]; },
      ok: function (line, m) { return !/\.\s*$/.test(m[2]) || m[2].length < 90; }
    },
    {
      id: 'codigo', label: 'Códigos de control (GV.OC-01, AC-2, PR.AA-01…)',
      re: /^(?:[o•·▪◦●]\s+)?([A-Z]{2}\.[A-Z]{2}-\d{2}|[A-Z]{2,4}-\d{1,3}(?:\(\d{1,2}\))?)\s*[:.\-–—]?\s*(.*)$/,
      group: /^(?:[•·▪◦●]\s+)?(.{3,90}?)\s*\(([A-Z]{2}\.[A-Z]{2})\)\s*:/,
      ref: function (m) { return m[1]; },
      ok: function (line, m) { return m[2].length <= 400; }
    },
    {
      id: 'seccion', label: 'Secciones y puntos (Sección 2, Punto 3.1…)',
      re: /^(?:secci[óo]n|section|punto|apartado|requisito|requirement)\s+(\d{1,3}(?:\.\d{1,3}){0,3})\.?\s*[:.\-–—]?\s*(.*)$/i,
      ref: function (m) { return m[1]; },
      ok: function (line, m) { return /^[A-Z]/.test(line) && m[2].length <= 160; }
    },
    {
      id: 'numerado', label: 'Numeración simple (1., 2., 3.…)',
      re: /^(\d{1,3})[.)]\s+([A-ZÁÉÍÓÚÑ].{2,170})$/,
      ref: function (m) { return m[1]; },
      ok: function () { return true; }
    }
  ];

  /** Subsecuencia creciente más larga por número de artículo (descarta referencias fuera de orden). */
  function increasing(reqs) {
    var nums = reqs.map(function (r) { var m = /(\d+)/.exec(r.ref); return m ? +m[1] : -1; });
    var n = reqs.length, len = [], prev = [], bestEnd = -1;
    for (var i = 0; i < n; i++) {
      len[i] = 1; prev[i] = -1;
      for (var j = 0; j < i; j++) if (nums[j] < nums[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
      if (bestEnd < 0 || len[i] > len[bestEnd]) bestEnd = i;
    }
    var keep = [];
    for (var k = bestEnd; k >= 0; k = prev[k]) keep.unshift(k);
    // Saltos inverosímiles al final (referencias a otros textos, p. ej. «Article 290 TFEU»)
    while (keep.length > 3 && nums[keep[keep.length - 1]] - nums[keep[keep.length - 2]] > 25) keep.pop();
    var set = {}; keep.forEach(function (i) { set[i] = 1; });
    return reqs.filter(function (r, i) { return set[i]; });
  }

  /** Orden natural de referencias numeradas: 4.1 < 4.2 < 10.1 < A.5.1. */
  function cmpRef(a, b) {
    var ka = refKey(a), kb = refKey(b);
    for (var i = 0; i < Math.max(ka.length, kb.length); i++) {
      var x = ka[i] === undefined ? -1 : ka[i], y = kb[i] === undefined ? -1 : kb[i];
      if (x !== y) return x - y;
    }
    return 0;
  }
  function refKey(r) {
    var m = /^([A-Z]{1,2}\.)?(.*)$/.exec(r);
    return [m[1] ? 1000 + m[1].charCodeAt(0) : 0].concat(m[2].split('.').map(function (n) { return parseInt(n, 10) || 0; }));
  }

  /** Recorre las líneas y devuelve los requisitos del patrón indicado. */
  function segment(lines, patternId) {
    var P = PATTERNS.filter(function (p) { return p.id === patternId; })[0];
    if (!P) return [];
    var reqs = [], cur = null, group = '', pendingGroup = null, annex = '';
    lines.forEach(function (line) {
      var pg = P.group ? P.group.exec(line) : null;
      if (pg) { group = clean(pg[2] + ' · ' + pg[1]); cur = null; pendingGroup = null; return; }
      var g = GROUP.exec(line);
      var isGroup = !!g && line.length <= 160 && P.id !== 'seccion';
      var m = isGroup ? null : P.re.exec(line);
      if (m && P.ok(line, m)) {
        var ref = P.ref(m);
        if (annex && P.id === 'clausula' && /^\d/.test(ref)) ref = annex + '.' + ref;
        cur = { ref: ref, title: clean(m[2]), text: [], group: group };
        reqs.push(cur);
        pendingGroup = null;
        return;
      }
      if (g && line.length <= 160) {
        var kind = g[1][0].toUpperCase() + g[1].slice(1).toLowerCase();
        annex = /^(anexo|annex)$/i.test(g[1]) && /^[A-Z]$/.test(g[2]) ? g[2] : (/^(anexo|annex)$/i.test(g[1]) ? annex : '');
        group = clean(kind + ' ' + g[2] + (g[3] ? ' · ' + g[3] : ''));
        pendingGroup = g[3] ? null : group;
        cur = null;
        return;
      }
      if (pendingGroup && line.length < 140 && !/[.;:,]$/.test(line)) {
        group = pendingGroup + ' · ' + line;
        pendingGroup = null;
        return;
      }
      pendingGroup = null;
      if (cur) {
        if (!cur.title && cur.text.length === 0 && line.length < 140 && !/[.;:,]$/.test(line)) cur.title = line;
        else cur.text.push(line);
      }
    });
    if (P.id === 'articulo') reqs = increasing(reqs);
    // Duplicados (índices, referencias cruzadas): se queda el de texto más largo
    var best = {};
    reqs.forEach(function (r) {
      r.body = clean(r.text.join(' '));
      var k = r.ref.toLowerCase();
      if (!best[k] || r.body.length > best[k].body.length) best[k] = r;
    });
    var list = reqs.filter(function (r) { return best[r.ref.toLowerCase()] === r && (r.title || r.body.length > 20); });
    if (P.id === 'clausula') list.sort(function (a, b) { return cmpRef(a.ref, b.ref); });
    return list.map(function (r) {
      return { ref: r.ref, title: clean(r.title || r.body.slice(0, 120)).replace(/\s+Control$/, '').replace(/[.:;]\s*$/, '').slice(0, 300), text: r.body.slice(0, 6000), group: r.group };
    });
  }

  /** Cuenta cuántos requisitos detecta cada patrón y sugiere el más probable. */
  function detect(lines) {
    var res = PATTERNS.map(function (p) {
      var reqs = segment(lines, p.id);
      var withText = reqs.filter(function (r) { return r.text.length > 40; }).length;
      return { id: p.id, label: p.label, count: reqs.length, withText: withText, sample: reqs.slice(0, 3).map(function (r) { return r.ref + ' ' + r.title; }) };
    });
    var rank = res.slice().sort(function (a, b) { return (b.withText * 2 + b.count) - (a.withText * 2 + a.count); });
    return { patterns: res, best: rank[0] && rank[0].count > 0 ? rank[0].id : null };
  }

  /** Artículos de forma (objeto, ámbito, definiciones, vigencia…) que no son requisitos de control. */
  var NON_REQ = /^(objeto|objetivo|ámbito|ambito|alcance de aplicaci|definiciones|glosario|entrada en vigor|vigencia|aplicaci[óo]n en el tiempo|derogaci|modificaci|disposici[óo]n(es)? (final|transitoria|adicional)|r[ée]gimen transitorio|sanciones|infracciones|destinatarios|ejercicio de la delegaci|procedimiento de comit|evaluaci[óo]n y revisi|revisi[óo]n del reglamento|cl[áa]usula de revisi|subject matter|scope|definitions|entry into force|application$|repeal|amendments? to|transitional|penalties|addressees|exercise of the delegation|committee procedure|review$|introducci[óo]n|introduction|pr[óo]logo|foreword|bibliograf|bibliography|normative references|referencias normativas|terms and definitions|t[ée]rminos y definiciones)/i;
  function isNonRequirement(title) { return NON_REQ.test(clean(title)); }

  /* ------------------------------------------------------------------ *
   * 3. Sugerencia de controles (similitud bilingüe español/inglés)      *
   * ------------------------------------------------------------------ */

  var STOP = ('a al algo ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era es esa ese eso esta este esto estos fue ha han hasta hay la las le les lo los mas me mediante mismo muy no nos o otra otro para pero por porque que se sea segun ser si sin sobre son su sus tal tambien te tiene todo todos tras un una uno unos y ya ' +
    'deberan debera deben debe podran podra puede pueden asi cada dicha dicho dichos dichas forma manera caso casos medida medidas parte partes efectos relacion respecto conformidad acuerdo lugar cuenta virtud presente presentes articulo articulos apartado apartados parrafo letra reglamento directiva norma entidad entidades financiera financieras organizacion organizaciones ' +
    'the of and to in for on by with as at from or be is are was were been this that these those such shall should must may can will which who whom its their there other any all each not no into within upon under between where when also including include includes ensure ensuring appropriate relevant organization organisation organizations entity entities article paragraph point referred accordance').split(' ');
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  // Inglés → palabra española equivalente (sin acentos): el catálogo está redactado en español.
  var EN = {
    security: 'seguridad', secure: 'seguridad', securing: 'seguridad', cybersecurity: 'seguridad', information: 'informacion', data: 'datos',
    risk: 'riesgo', risks: 'riesgo', threat: 'amenaza', threats: 'amenaza', vulnerability: 'vulnerabilidad', vulnerabilities: 'vulnerabilidad',
    incident: 'incidente', incidents: 'incidente', event: 'evento', events: 'evento', response: 'respuesta', respond: 'respuesta', recovery: 'recuperacion', recover: 'recuperacion', restore: 'restauracion', restoration: 'restauracion',
    backup: 'respaldo', backups: 'respaldo', continuity: 'continuidad', resilience: 'resiliencia', resilient: 'resiliencia', disruption: 'disrupcion', crisis: 'crisis',
    access: 'acceso', identity: 'identidad', identities: 'identidad', authentication: 'autenticacion', authenticate: 'autenticacion', password: 'contrasena', passwords: 'contrasena', privileged: 'privilegiado', privilege: 'privilegiado', privileges: 'privilegiado', rights: 'derechos',
    encryption: 'criptografia', cryptography: 'criptografia', cryptographic: 'criptografia', keys: 'claves', key: 'claves',
    supplier: 'proveedor', suppliers: 'proveedor', vendor: 'proveedor', vendors: 'proveedor', provider: 'proveedor', providers: 'proveedor', third: 'terceros', party: 'terceros', outsourcing: 'externalizado', outsourced: 'externalizado', contract: 'contrato', contracts: 'contrato', contractual: 'contrato', supply: 'suministro', chain: 'cadena', cloud: 'nube', exit: 'salida', concentration: 'concentracion', subcontracting: 'subcontratacion',
    policy: 'politica', policies: 'politica', procedure: 'procedimiento', procedures: 'procedimiento', governance: 'gobierno', management: 'gestion', board: 'direccion', leadership: 'liderazgo', responsibilities: 'responsabilidades', responsibility: 'responsabilidades', strategy: 'estrategia', objectives: 'objetivos', budget: 'presupuesto', resources: 'recursos',
    audit: 'auditoria', audits: 'auditoria', auditing: 'auditoria', review: 'revision', reviews: 'revision', monitoring: 'monitorizacion', monitor: 'monitorizacion', measurement: 'medicion', compliance: 'cumplimiento', regulatory: 'regulatorio', improvement: 'mejora', corrective: 'correctiva', nonconformity: 'conformidad',
    training: 'formacion', awareness: 'concienciacion', competence: 'competencia', personnel: 'personal', staff: 'personal', employees: 'personal', employment: 'empleo', screening: 'antecedentes', disciplinary: 'disciplinario', confidentiality: 'confidencialidad', remote: 'remoto',
    asset: 'activos', assets: 'activos', inventory: 'inventario', classification: 'clasificacion', labelling: 'etiquetado', labeling: 'etiquetado', transfer: 'transferencia', media: 'soportes', deletion: 'borrado', masking: 'enmascaramiento', leakage: 'fuga', records: 'registros', privacy: 'privacidad', personal: 'personales',
    physical: 'fisica', perimeter: 'perimetro', entry: 'entrada', premises: 'instalaciones', facilities: 'instalaciones', equipment: 'equipos', environmental: 'ambientales', utilities: 'suministro', cabling: 'cableado', maintenance: 'mantenimiento',
    network: 'redes', networks: 'redes', segmentation: 'segmentacion', segregation: 'segregacion', isolation: 'aislamiento', filtering: 'filtrado', redundancy: 'redundancia', capacity: 'capacidad', configuration: 'configuracion', logging: 'registro', logs: 'registro', log: 'registro', clock: 'relojes', patch: 'parches', patches: 'parches', patching: 'parches', updates: 'actualizaciones', endpoint: 'dispositivos', devices: 'dispositivos', anomalous: 'anomalas', anomalies: 'anomalas', detection: 'deteccion', detect: 'deteccion',
    development: 'desarrollo', coding: 'codificacion', testing: 'pruebas', test: 'pruebas', tests: 'pruebas', change: 'cambios', changes: 'cambios', architecture: 'arquitectura', engineering: 'ingenieria', environments: 'entornos', penetration: 'penetracion', notification: 'notificacion', notify: 'notificacion', reporting: 'notificacion', report: 'informe', reports: 'informe', authority: 'autoridad', authorities: 'autoridades', clients: 'clientes', customers: 'clientes', communication: 'comunicacion', communications: 'comunicacion', lessons: 'lecciones', learned: 'aprendidas', evidence: 'evidencias', sharing: 'intercambio', intelligence: 'inteligencia', legacy: 'heredados', impact: 'impacto', business: 'negocio', critical: 'criticas', functions: 'funciones', plans: 'planes', plan: 'planes', register: 'registro', assessment: 'evaluacion', assess: 'evaluacion', treatment: 'tratamiento', tolerance: 'tolerancia', appetite: 'apetito'
  };

  function fold(s) { return str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function stem(w) {
    if (w.length > 6) w = w.replace(/(aciones|iciones|amientos|imientos|mente|ciones|cion|siones|sion|idades|idad|ables|ibles|able|ible|ados|idos|ada|ido|ado|ida|es|s)$/, '');
    return w.slice(0, 7);
  }
  function tokens(text) {
    var out = [];
    (fold(text).match(/[a-z][a-z0-9]{2,}/g) || []).forEach(function (w) {
      if (STOPSET[w]) return;
      if (Object.prototype.hasOwnProperty.call(EN, w)) w = EN[w];
      if (STOPSET[w]) return;
      out.push(stem(w));
    });
    return out;
  }

  /** Índice TF-IDF del catálogo de controles (el título pesa más que la descripción). */
  function buildIndex(controls, domains) {
    var dom = {}; (domains || []).forEach(function (d) { dom[d.id] = d.title; });
    var docs = controls.map(function (c) {
      var tf = {};
      tokens(c.title).forEach(function (w) { tf[w] = (tf[w] || 0) + 3; });
      tokens(c.description || '').forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
      tokens(dom[c.domain] || '').forEach(function (w) { tf[w] = (tf[w] || 0) + 0.5; });
      return { id: c.id, tf: tf };
    });
    var df = {};
    docs.forEach(function (d) { Object.keys(d.tf).forEach(function (w) { df[w] = (df[w] || 0) + 1; }); });
    var N = docs.length, idf = {};
    Object.keys(df).forEach(function (w) { idf[w] = Math.log(1 + N / df[w]); });
    docs.forEach(function (d) {
      var v = {}, norm = 0;
      Object.keys(d.tf).forEach(function (w) { v[w] = (1 + Math.log(d.tf[w])) * idf[w]; norm += v[w] * v[w]; });
      d.v = v; d.norm = Math.sqrt(norm) || 1;
    });
    return { docs: docs, idf: idf };
  }

  /**
   * Sugiere hasta `max` controles por requisito.
   * Devuelve [[{control, score, strength, confidence}]] en el orden de `reqs`.
   */
  function suggest(reqs, controls, domains, opts) {
    opts = opts || {};
    var max = opts.max || 3, min = opts.min === undefined ? 0.1 : opts.min;
    var idx = buildIndex(controls, domains);
    return reqs.map(function (r) {
      var tf = {};
      tokens(r.title).forEach(function (w) { tf[w] = (tf[w] || 0) + 3; });
      tokens(str(r.text).slice(0, 1500)).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
      var q = {}, qn = 0;
      Object.keys(tf).forEach(function (w) { if (idx.idf[w]) { q[w] = (1 + Math.log(tf[w])) * idx.idf[w]; qn += q[w] * q[w]; } });
      qn = Math.sqrt(qn) || 1;
      var scored = idx.docs.map(function (d) {
        var dot = 0;
        Object.keys(q).forEach(function (w) { if (d.v[w]) dot += q[w] * d.v[w]; });
        return { control: d.id, score: dot / (qn * d.norm) };
      }).filter(function (s) { return s.score >= min; }).sort(function (a, b) { return b.score - a.score; }).slice(0, max);
      return scored.map(function (s, i) {
        var high = i === 0 && s.score >= 0.32 && (!scored[1] || s.score - scored[1].score >= 0.06);
        return { control: s.control, score: Math.round(s.score * 1000) / 1000, strength: high ? 'full' : 'partial', confidence: s.score >= 0.32 ? 'alta' : s.score >= 0.18 ? 'media' : 'baja' };
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. Marco                                                            *
   * ------------------------------------------------------------------ */

  function slug(s) { return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '') || 'marco-pdf'; }

  /**
   * Arma el marco a partir de los requisitos revisados.
   * reqs: [{ref, title, text, group, include, excludable, mappings:[{control,strength}]}]
   * opts.excerpt: caracteres del texto original que se conservan como resumen (0 = ninguno).
   */
  function toFramework(meta, reqs, opts) {
    opts = opts || {};
    var excerpt = opts.excerpt === undefined ? 400 : opts.excerpt;
    var id = meta.id || slug(meta.name);
    var prefix = id.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'REQ';
    var groups = [], gIds = {}, used = {};
    var requirements = reqs.filter(function (r) { return r.include !== false; }).map(function (r, i) {
      var g = r.group || '';
      if (g && !gIds[g]) { gIds[g] = 'G' + (groups.length + 1); groups.push({ id: gIds[g], title: g.slice(0, 200) }); }
      var base = (prefix + '-' + str(r.ref).replace(/^art\.\s*/i, '').replace(/[^A-Za-z0-9.]+/g, '')).slice(0, 70);
      var rid = base, k = 2;
      while (used[rid]) rid = base.slice(0, 64) + '-' + (k++);
      used[rid] = 1;
      return {
        id: rid, ref: str(r.ref).slice(0, 80), group: g ? gIds[g] : '', title: clean(r.title).slice(0, 300) || str(r.ref),
        summary: excerpt ? clean(r.text).slice(0, excerpt) : '', excludable: r.excludable !== false,
        mappings: (r.mappings || []).map(function (m) { return { control: m.control, strength: m.strength }; })
      };
    });
    return {
      id: id, name: clean(meta.name).slice(0, 160) || 'Marco importado desde PDF', shortName: clean(meta.shortName || meta.name).slice(0, 40),
      version: str(meta.version).slice(0, 120), publisher: str(meta.publisher).slice(0, 120), jurisdiction: str(meta.jurisdiction).slice(0, 120),
      type: 'marco', color: /^#[0-9a-fA-F]{6}$/.test(str(meta.color)) ? meta.color : '#8A5CF5', url: /^https:\/\//.test(str(meta.url)) ? meta.url : '',
      description: str(meta.description).slice(0, 2000),
      notice: ('Importado desde el PDF «' + str(meta.fileName).slice(0, 120) + '» con detección automática de requisitos y mapeos revisados por el usuario.' +
        (excerpt ? ' Contiene extractos del texto original: no lo publiques si el texto tiene derechos de autor.' : '')).slice(0, 2000),
      frameworkVersion: '1.0.0',
      groups: groups, requirements: requirements
    };
  }

  return {
    itemsToLines: itemsToLines, cleanPages: cleanPages,
    PATTERNS: PATTERNS.map(function (p) { return { id: p.id, label: p.label }; }),
    segment: segment, detect: detect, isNonRequirement: isNonRequirement, tokens: tokens, suggest: suggest, toFramework: toFramework, slug: slug
  };
});
