/**
 * Pruebas de extremo a extremo en Chromium (Playwright) sobre dist/.
 * Requisito: npm run build (lo hace «npm run test:e2e») y un Chromium de Playwright
 * («npx playwright install chromium»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const PORT = 5199;
const URL_APP = `http://127.0.0.1:${PORT}/`;
const fixture = p => fileURLToPath(new URL(p, import.meta.url));
let server, browser;

async function launch() {
  try { return await chromium.launch(); }
  catch (e) {
    const alt = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
    if (existsSync(alt)) return chromium.launch({ executablePath: alt });
    throw e;
  }
}
async function newPage(viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1440, height: 900 }, acceptDownloads: true });
  page.errors = [];
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(URL_APP);
  return page;
}
const scores = page => page.$$eval('.score .big', els => els.map(e => parseInt(e.textContent, 10)));
async function pickFramework(page, files) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="fw-pick"]')]);
  await chooser.setFiles(files);
}

test.before(async () => {
  if (!existsSync(fixture('../templates/plantilla-marco.xlsx'))) execFileSync('node', [fixture('../scripts/plantilla.mjs')]);
  server = await serve(PORT);
  browser = await launch();
});
test.after(async () => { await browser?.close(); server?.close(); });

test('carga el caso de ejemplo y recorre todas las vistas sin errores ni violaciones de CSP', async () => {
  const page = await newPage();
  await page.click('[data-act="load-example"]');
  await page.waitForSelector('.score .big');
  const s = await scores(page);
  assert.equal(s.length, 2);
  assert.ok(s.every(v => v > 0 && v < 100));
  for (const v of ['requisitos', 'controles', 'equivalencias', 'brechas', 'plan', 'marcos', 'exportar', 'ayuda', 'inicio', 'resumen']) {
    await page.click(`nav [data-view="${v}"]`);
    await page.waitForSelector('main h1');
  }
  await page.click('[data-act="theme"]');
  await page.click('nav [data-view="controles"]');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('cambiar el estado de un control recalcula el cumplimiento', async () => {
  const page = await newPage();
  await page.click('[data-act="load-example"]');
  await page.waitForSelector('.score .big');
  const before = await scores(page);
  await page.locator('main select.st').first().selectOption('implemented');
  await page.waitForTimeout(100);
  const after = await scores(page);
  assert.ok(after[0] + after[1] > before[0] + before[1], `${before} → ${after}`);
  await page.close();
});

test('agrega un marco nuevo desde JSON: validación, alcance, controles propios y equivalencias', async () => {
  const page = await newPage();
  await page.click('[data-act="load-example"]');
  await page.click('nav [data-view="marcos"]');
  await pickFramework(page, fixture('fixtures/marco-prueba.json'));
  await page.waitForSelector('#modal:not([hidden]) #modal-title');
  assert.match(await page.textContent('#modal'), /1 requisito\(s\) sin mapear/);
  await page.click('#modal [data-act="modal-ok"]');
  await page.waitForSelector('main >> text=Marco de prueba (ficticio)');
  await page.click('nav [data-view="resumen"]');
  await page.waitForSelector('.score .big');
  assert.equal((await scores(page)).length, 3);
  await page.goto(URL_APP + '#/equivalencias?fw=marco-prueba&req=P-1');
  await page.waitForSelector('main >> text=Políticas de seguridad de la información');
  await page.goto(URL_APP + '#/controles');
  await page.fill('#ct-q', 'TST-01');
  await page.waitForSelector('main >> text=Control propio del marco de prueba');
  await page.reload();
  await page.goto(URL_APP + '#/marcos');
  await page.waitForSelector('main >> text=Marco de prueba (ficticio)');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('el editor de mapeos completa un requisito sin mapear', async () => {
  const page = await newPage();
  await page.click('[data-act="load-example"]');
  await page.click('nav [data-view="marcos"]');
  await pickFramework(page, fixture('fixtures/marco-prueba.json'));
  await page.click('#modal [data-act="modal-ok"]');
  await page.click('[data-act="fw-map"][data-fw="marco-prueba"]');
  await page.fill('#mc-2', 'DES-08');
  await page.click('#drawer [data-act="map-add"][data-i="2"]');
  await page.waitForSelector('#drawer >> text=DES-08');
  await page.keyboard.press('Escape');
  await page.goto(URL_APP + '#/requisitos?fw=marco-prueba');
  await page.waitForSelector('main [data-act="ctrl"][data-id="DES-08"]');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('agrega un marco desde la plantilla Excel', async () => {
  const page = await newPage();
  await page.click('nav [data-view="marcos"]');
  await pickFramework(page, fixture('../templates/plantilla-marco.xlsx'));
  await page.waitForSelector('#modal:not([hidden]) [data-act="modal-ok"]', { timeout: 15000 });
  await page.click('#modal [data-act="modal-ok"]');
  await page.waitForSelector('main >> text=Mi marco normativo');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('rechaza un marco con errores', async () => {
  const page = await newPage();
  await page.click('nav [data-view="marcos"]');
  await pickFramework(page, { name: 'malo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ id: 'iso27001-2022', name: 'X', requirements: [{ id: 'a', title: 'b', mappings: [{ control: 'ZZZ-99', strength: 'full' }] }] })) });
  await page.waitForSelector('text=El marco tiene errores');
  assert.equal(await page.locator('#modal [data-act="modal-ok"]').count(), 0);
  assert.match(await page.textContent('#modal'), /ZZZ-99/);
  await page.close();
});

test('exporta Excel, Markdown, copia de seguridad y plantilla', async () => {
  const page = await newPage();
  await page.click('[data-act="load-example"]');
  await page.click('nav [data-view="exportar"]');
  for (const act of ['exp-xlsx', 'exp-md', 'backup']) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-act="${act}"]`)]);
    assert.ok(dl.suggestedFilename().length > 5);
  }
  await page.click('nav [data-view="marcos"]');
  const [tpl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('[data-act="tpl-xlsx"]')]);
  assert.equal(tpl.suggestedFilename(), 'plantilla-marco-babel-grc.xlsx');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('móvil: sin desplazamiento horizontal', async () => {
  const page = await newPage({ width: 390, height: 844 });
  await page.click('[data-act="load-example"]');
  for (const v of ['resumen', 'marcos', 'plan']) {
    await page.goto(URL_APP + '#/' + v);
    await page.waitForSelector('main h1');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, `${v}: ${over}px de desborde`);
  }
  await page.close();
});

/** Elementos que se salen de su tarjeta o panel, y desplazamiento horizontal de la página. */
function overflowReport() {
  const out = [];
  const over = document.documentElement.scrollWidth - window.innerWidth;
  if (over > 1) out.push('página con ' + over + 'px de desplazamiento horizontal');
  document.querySelectorAll('main *, #drawer *').forEach(el => {
    if (el.closest('.tbl-wrap, .list, select, textarea')) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const box = el.parentElement && el.parentElement.closest('.card, .kcard, .col, .callout, .panel');
    if (!box) return;
    const b = box.getBoundingClientRect();
    if (r.right > b.right - parseFloat(getComputedStyle(box).borderRightWidth) + 1)
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} «${(el.textContent || '').trim().slice(0, 30)}»`);
  });
  const panel = document.querySelector('#drawer .panel');
  if (panel && panel.scrollWidth - panel.clientWidth > 1) out.push('panel lateral con desplazamiento horizontal');
  return Array.from(new Set(out)).slice(0, 10);
}

test('ningún contenido se desborda, aunque un marco nuevo tenga nombres, URLs y textos muy largos', async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1000, height: 800 }, { width: 390, height: 844 }]) {
    const page = await newPage(viewport);
    await page.click('[data-act="load-example"]');
    await page.goto(URL_APP + '#/marcos');
    await pickFramework(page, fixture('fixtures/marco-estres.json'));
    await page.click('#modal [data-act="modal-ok"]');
    const views = ['inicio', 'resumen', 'requisitos?fw=marco-estres', 'requisitos?fw=dora', 'controles', 'equivalencias?fw=marco-estres', 'equivalencias?fw=dora', 'brechas', 'plan', 'marcos', 'exportar', 'ayuda'];
    for (const v of views) {
      await page.goto(URL_APP + '#/' + v);
      await page.waitForSelector('main h1');
      assert.deepEqual(await page.evaluate(overflowReport), [], `${viewport.width}px · ${v}`);
    }
    await page.goto(URL_APP + '#/requisitos?fw=marco-estres');
    await page.locator('main [data-act="req"]').first().click();
    assert.deepEqual(await page.evaluate(overflowReport), [], `${viewport.width}px · panel de requisito`);
    await page.keyboard.press('Escape');
    await page.click('main [data-act="ctrl"][data-id="GOB-01"]');
    assert.deepEqual(await page.evaluate(overflowReport), [], `${viewport.width}px · panel de control`);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('foto del período: exporta Excel + JSON, verifica, detecta alteraciones y compara', async () => {
  const { readFileSync } = await import('node:fs');
  const page = await newPage();
  await page.click('[data-act="load-example"]');
  await page.goto(URL_APP + '#/exportar');
  await page.click('[data-act="foto-export"]');
  await page.waitForSelector('text=Indicá el período de la foto.');
  await page.fill('#ft-period', '3.er trimestre 2026');
  await page.fill('#ft-author', 'Martín Boratto · CISO');
  await page.fill('#ft-from', '2026-07-01');
  await page.fill('#ft-to', '2026-09-30');
  const downloads = [];
  page.on('download', d => downloads.push(d));
  await page.click('[data-act="foto-export"]');
  await page.waitForSelector('#ft-hash', { timeout: 20000 });
  await page.waitForTimeout(300);
  const names = downloads.map(d => d.suggestedFilename()).sort();
  assert.equal(names.length, 2);
  assert.match(names[0], /^babel-grc-foto-.*-3-er-trimestre-2026-\d{8}-\d{4}\.json$/);
  assert.match(names[1], /\.xlsx$/);
  const shown = (await page.textContent('#ft-hash')).trim();
  const jsonPath = await downloads.find(d => d.suggestedFilename().endsWith('.json')).path();
  const foto = JSON.parse(readFileSync(jsonPath, 'utf8'));
  assert.equal(foto.sha256, shown);
  assert.equal(foto.content.period.label, '3.er trimestre 2026');
  assert.deepEqual(foto.content.project.scope, ['iso27001-2022', 'dora']);

  // Verificación de la foto original
  const verify = async (buffer, name) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="foto-verify"]')]);
    await chooser.setFiles({ name, mimeType: 'application/json', buffer });
    await page.waitForSelector('#modal:not([hidden]) #modal-title');
    return page.textContent('#modal-title');
  };
  assert.match(await verify(readFileSync(jsonPath), 'foto.json'), /Foto íntegra/);
  assert.match(await page.textContent('#modal'), /Comparación con el estado actual/);

  // Comparación con una segunda foto tomada después de un cambio
  await page.click('#modal [data-act="modal-close"]');
  await page.goto(URL_APP + '#/resumen');
  await page.locator('main select.st').first().selectOption('implemented');   // primera prioridad: un control pendiente
  await page.goto(URL_APP + '#/exportar');
  assert.equal(await page.inputValue('#ft-author'), 'Martín Boratto · CISO', 'el formulario conserva los datos');
  await page.fill('#ft-period', '4.º trimestre 2026');
  downloads.length = 0;
  await page.click('[data-act="foto-export"]');
  await page.waitForTimeout(1500);
  const json2 = await downloads.find(d => d.suggestedFilename().endsWith('.json')).path();
  await verify(readFileSync(jsonPath), 'foto1.json');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#modal [data-act="foto-compare"]')]);
  await chooser.setFiles(json2);
  await page.waitForSelector('text=Comparación de fotos');
  assert.match(await page.textContent('#modal'), /3\.er trimestre 2026 → 4\.º trimestre 2026/);
  assert.match(await page.textContent('#modal'), /control\(es\) cambiaron de estado/);
  await page.click('#modal [data-act="modal-close"]');

  // Alteración: cambiar un porcentaje invalida la foto
  const altered = JSON.parse(readFileSync(jsonPath, 'utf8'));
  altered.content.results.dora.score = 0.99;
  assert.match(await verify(Buffer.from(JSON.stringify(altered)), 'alterada.json'), /Foto alterada/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('importa un marco desde PDF: detecta artículos, sugiere controles y crea el marco', async () => {
  const page = await newPage();
  await page.click('[data-act="load-example"]');
  await page.goto(URL_APP + '#/marcos');
  await pickFramework(page, fixture('fixtures/norma-ficticia.pdf'));
  await page.waitForSelector('text=Importar marco desde PDF', { timeout: 30000 });
  assert.equal(await page.inputValue('#pw-name'), 'norma-ficticia', 'el nombre sale del archivo, no de los metadatos');
  assert.match(await page.textContent('#modal'), /Artículos \(Artículo 5, Art\. 12, Article 3…\) · 8 detectado\(s\)/);
  await page.fill('#pw-name', 'Norma NF 1/2026 (ficticia)');
  await page.fill('#pw-id', 'nf-1-2026');
  await page.click('[data-act="pw-next"]');
  await page.waitForSelector('text=Revisar requisitos y controles');
  assert.match(await page.textContent('#modal'), /5 de 8 incluidos/, 'objeto, definiciones y entrada en vigor quedan fuera');
  const chips = await page.locator('#modal tbody tr').nth(3).locator('.chip.ok, .chip.warn').allTextContents();
  assert.ok(chips.some(t => /OPE-06/.test(t)), 'copias de seguridad → OPE-06');
  // Quitar una sugerencia y sumar un control a mano
  await page.locator('#modal tbody tr').nth(3).locator('[data-act="pw-del"]').first().click();
  await page.fill('#pw-c-3', 'CON-07');
  await page.click('#modal [data-act="pw-add"][data-i="3"]:not([data-c])');
  assert.match(await page.locator('#modal tbody tr').nth(3).textContent(), /CON-07/);
  await page.click('[data-act="pw-create"]');
  await page.waitForSelector('text=Revisar marco');
  await page.click('#modal [data-act="modal-ok"]');
  await page.waitForSelector('main >> text=Norma NF 1/2026 (ficticia)');
  await page.goto(URL_APP + '#/requisitos?fw=nf-1-2026');
  await page.waitForSelector('main >> text=Copias de seguridad');
  assert.equal(await page.locator('main tbody tr:not(.group)').count(), 5);
  await page.goto(URL_APP + '#/resumen');
  await page.waitForSelector('.score .big');
  assert.equal((await scores(page)).length, 3);
  assert.deepEqual(page.errors, []);
  await page.close();
});
