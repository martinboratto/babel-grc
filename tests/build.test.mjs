import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

const out = mkdtempSync(join(tmpdir(), 'babel-build-'));
const r = build({ out });
const html = readFileSync(join(out, 'index.html'), 'utf8');

test('genera index.html autocontenido y vendor', () => {
  assert.ok(existsSync(join(out, 'vendor/exceljs.min.js')));
  assert.ok(existsSync(join(out, '.nojekyll')));
  assert.ok(!/@csp|\/\*@css\*\/|\/\*@js\*\/|>@data</.test(html), 'quedan marcadores sin reemplazar');
  assert.ok(!/<script[^>]+src=/i.test(html), 'no debe haber scripts externos en el HTML');
  assert.ok(!/<link[^>]+href="https?:/i.test(html), 'no debe haber hojas de estilo remotas');
});

test('la CSP usa hashes y no permite unsafe-inline ni conexiones', () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
  assert.ok(csp.includes("connect-src 'none'") && csp.includes("default-src 'none'"));
  const sha = s => "'sha256-" + createHash('sha256').update(s).digest('base64') + "'";
  assert.ok(csp.includes(sha(r.js)), 'hash del script');
  assert.ok(csp.includes(sha(r.css)), 'hash del estilo');
  const vendor = readFileSync(join(out, 'vendor/exceljs.min.js'));
  const sri = 'sha384-' + createHash('sha384').update(vendor).digest('base64');
  assert.equal(r.vendorSri, sri);
  assert.ok(csp.includes(sri));
});

test('los datos incrustados se pueden leer y no cierran la etiqueta', () => {
  const m = /<script type="application\/json" id="babel-data">([\s\S]*?)<\/script>/.exec(html);
  const data = JSON.parse(m[1]);
  assert.equal(data.frameworks.length, 2);
  assert.equal(data.frameworks[0].id, 'iso27001-2022');
  assert.ok(data.catalog.controls.length > 100);
  assert.ok(data.vendor.exceljs.startsWith('sha384-'));
});
