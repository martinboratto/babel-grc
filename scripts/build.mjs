#!/usr/bin/env node
/**
 * Babel GRC · build reproducible.
 * src/ + catalog/ + frameworks/ → dist/index.html (aplicación completa en un fichero) + dist/vendor/.
 * - Valida el catálogo y cada marco con el motor: si hay errores, el build falla.
 * - Incrusta datos, estilos y scripts, y genera la CSP con el hash de cada bloque.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = require(join(ROOT, 'src/engine/babel-engine.js'));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const json = p => JSON.parse(read(p));
const sha = (alg, data) => `${alg}-` + createHash(alg).update(data).digest('base64');

export function loadSources() {
  const pkg = json('package.json');
  const catalog = json('catalog/controls.json');
  const frameworks = readdirSync(join(ROOT, 'frameworks')).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ file: f, data: json('frameworks/' + f) }));
  return { pkg, catalog, frameworks };
}

/** Devuelve { errors, warnings } del catálogo y de todos los marcos del repositorio. */
export function validateAll({ catalog, frameworks }) {
  const errors = [], warnings = [];
  const ids = new Set(), dom = new Set(catalog.domains.map(d => d.id));
  catalog.controls.forEach(c => {
    if (ids.has(c.id)) errors.push(`catalog: control repetido ${c.id}`);
    ids.add(c.id);
    if (!dom.has(c.domain)) errors.push(`catalog: ${c.id} usa un dominio inexistente (${c.domain})`);
    if (!/^[A-Z]{2,5}-[A-Z0-9]{1,6}$/.test(c.id)) errors.push(`catalog: id con formato inválido ${c.id}`);
  });
  const fwIds = [];
  const extra = { controls: catalog.controls.slice() };
  frameworks.forEach(({ file, data }) => {
    const v = E.validateFramework(data, extra, { existingIds: fwIds });
    v.errors.forEach(e => errors.push(`${file}: ${e}`));
    v.warnings.forEach(w => warnings.push(`${file}: ${w}`));
    if (data && data.id && file !== data.id + '.json') errors.push(`${file}: el nombre del archivo debe ser «${data.id}.json»`);
    if (data && data.id) fwIds.push(data.id);
  });
  return { errors, warnings };
}

export function build({ out = join(ROOT, 'dist') } = {}) {
  const src = loadSources();
  const { errors } = validateAll(src);
  if (errors.length) throw new Error('Validación fallida:\n  - ' + errors.join('\n  - '));

  const vendorSrc = join(ROOT, 'node_modules/exceljs/dist/exceljs.min.js');
  if (!existsSync(vendorSrc)) throw new Error('Falta node_modules/exceljs: ejecutá «npm ci».');
  const vendor = readFileSync(vendorSrc);
  const vendorSri = sha('sha384', vendor);

  const fws = src.frameworks.map(f => f.data).sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));
  const data = {
    version: src.pkg.version,
    catalog: src.catalog,
    frameworks: fws,
    example: json('src/data/ejemplo.json'),
    vendor: { exceljs: vendorSri }
  };
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));

  const css = read('src/styles/app.css');
  const appFiles = readdirSync(join(ROOT, 'src/app')).filter(f => f.endsWith('.js')).sort();
  const app = appFiles.map(f => `/* ---- ${f} ---- */\n` + read('src/app/' + f)).join('\n');
  const js = read('src/engine/babel-engine.js') + '\n;(function () {\n' + app + '\n})();\n';
  if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('El código contiene una etiqueta de cierre no permitida.');

  const csp = [
    "default-src 'none'",
    `script-src '${sha('sha256', js)}' '${vendorSri}' 'self'`,
    `style-src '${sha('sha256', css)}'`,
    "img-src 'self' data:",
    "connect-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "manifest-src 'none'",
    "worker-src 'none'"
  ].join('; ');

  let html = read('src/index.html');
  const put = (marker, value) => {
    if (html.split(marker).length !== 2) throw new Error('La plantilla debe contener una sola vez ' + marker);
    html = html.replace(marker, () => value);
  };
  put('/*@css*/', css);
  put('/*@js*/', js);
  put('@data', dataJson);
  put('@csp', csp);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'vendor'), { recursive: true });
  writeFileSync(join(out, 'index.html'), html);
  copyFileSync(vendorSrc, join(out, 'vendor/exceljs.min.js'));
  copyFileSync(join(ROOT, 'node_modules/exceljs/LICENSE'), join(out, 'vendor/exceljs.LICENSE.txt'));
  writeFileSync(join(out, '.nojekyll'), '');
  return { out, bytes: Buffer.byteLength(html), frameworks: fws.map(f => `${f.id} (${f.requirements.length})`), controls: src.catalog.controls.length, csp, js, css, vendorSri };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const r = build();
    console.log(`✓ dist/index.html (${(r.bytes / 1024).toFixed(0)} KB) · ${r.controls} controles · marcos: ${r.frameworks.join(', ')}`);
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
}
