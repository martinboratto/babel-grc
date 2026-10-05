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
