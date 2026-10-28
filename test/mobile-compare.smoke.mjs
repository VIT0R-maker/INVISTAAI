// Optional browser regression: run the app, set PLAYWRIGHT_MODULE if needed.
// API fixtures make visual/interaction checks deterministic; no provider calls.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { buildFiiAnalysis, buildStockAnalysis } from '../lib/analysis.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [], calls = [];
page.on('pageerror', error => errors.push(error.message));
const meta = { source: 'https://investidor10.com.br/', updatedAt: new Date().toISOString(), cacheAgeMs: 0 };
const stock = ticker => buildStockAnalysis({ cotacao: 40, lpa: 4, vpa: 25, cagrlucros5anos: 7, dividendyield: 6, pl: ticker === 'BBAS3' ? 5 : 10, pvp: 1.6, roe: ticker === 'BBAS3' ? 18 : 12 }, { valor: 11 }, ticker, 'moderado', meta);
const fii = ticker => buildFiiAnalysis({ dictNum: { cotacao: 12.89, ultimorendimento: .21, pvp: ticker === 'MXRF11' ? .95 : .12, dividendyield: 12, vacancia: 5 }, dictRaw: { segmento: 'Recebíveis' } }, ticker, 'moderado', meta);
await page.route('**/www.gstatic.com/firebasejs/**', route => route.abort());
await page.route('**/api/auxiliar/status', route => route.fulfill({ json: { configured: false } }));
await page.route(/\/api\/(acoes|fiis)$/, async route => {
  const input = route.request().postDataJSON();
  calls.push(input);
  if (input.ticker === 'FAIL3') return route.fulfill({ status: 503, json: { error: 'Fonte indisponível para este ativo.' } });
  if (input.ticker === 'WAIT3') await new Promise(resolve => setTimeout(resolve, 300));
  await route.fulfill({ json: route.request().url().endsWith('/fiis') ? fii(input.ticker) : stock(input.ticker) });
});
const fit = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page overflows horizontally');
const tooltipFits = async () => {
  const box = await page.locator('#indicator-tooltip').boundingBox();
  const size = page.viewportSize();
  assert.ok(box && box.x >= 10 && box.x + box.width <= size.width - 10, JSON.stringify(box));
  assert.ok(box.y >= 10 && box.y + box.height <= size.height - 10, JSON.stringify(box));
};
try {
  await mkdir('artifacts', { recursive: true });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3000');
  await page.locator('#btn-fiis').tap();
  await page.locator('#tickerInput').fill('mxrf');
  await page.locator('#tickerInput').press('Enter');
  await page.locator('.card-percentage').waitFor();
  assert.equal(calls.at(-1).ticker, 'MXRF11');
  assert.equal(await page.locator('#tickerInput').inputValue(), 'MXRF11');
  assert.match(await page.locator('.card-percentage').innerText(), /1,63%/);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Sobre Último Rendimento', 'Sobre P/VP', 'Avaliação de P/VP']) {
      const trigger = page.getByRole('button', { name, exact: true });
      await trigger.tap();
      await page.locator('#indicator-tooltip').waitFor({ state: 'visible' });
      await tooltipFits();
      assert.equal(await trigger.getAttribute('aria-describedby'), 'indicator-tooltip');
      await page.screenshot({ path: `artifacts/tooltip-${width}-${name.startsWith('Avaliação') ? 'status' : 'help'}.png` });
      await page.touchscreen.tap(width - 3, 3);
      assert.equal(await page.locator('#indicator-tooltip').isVisible(), false);
    }
    await fit();
  }
  await page.getByRole('button', { name: 'Sobre Último Rendimento', exact: true }).focus();
  await page.locator('#indicator-tooltip').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#indicator-tooltip').isVisible(), false);
  await page.locator('#btn-auxiliar').tap();
  await page.locator('.assistant-context-form input[name="ticker"]').fill('hctr');
  await page.locator('.assistant-context-form button[type="submit"]').tap();
  assert.equal(await page.locator('.assistant-context-form input[name="ticker"]').inputValue(), 'HCTR11');
  await page.locator('#btn-comparar').tap();
  await page.locator('#compare-ticker-0').fill('bbas3');
  await page.locator('#compare-ticker-1').fill('sanb4');
  await page.locator('.compare-submit').tap();
  await page.locator('.compare-results[aria-busy="false"] .asset-compare-table').waitFor();
  assert.equal(await page.locator('tr[data-indicator="pl"] td.compare-favorable').count(), 1);
  assert.match(await page.locator('tr[data-indicator="pl"] td.compare-favorable').innerText(), /5/);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await fit();
    await page.screenshot({ path: `artifacts/compare-${width}.png`, fullPage: true });
  }
  await page.locator('#compare-type-0').selectOption('fiis');
  await page.locator('#compare-type-1').selectOption('fiis');
  await page.locator('#compare-ticker-0').fill('mxrf');
  await page.locator('#compare-ticker-1').fill('hctr');
  await page.locator('.compare-submit').click();
  await page.locator('.compare-results[aria-busy="false"] .asset-compare-table').waitFor();
  assert.equal(await page.locator('#compare-ticker-0').inputValue(), 'MXRF11');
  assert.equal(await page.locator('#compare-ticker-1').inputValue(), 'HCTR11');
  assert.equal(await page.locator('tr[data-indicator="pvp"] td.compare-favorable').count(), 1);
  assert.match(await page.locator('tr[data-indicator="pvp"] td.compare-favorable').innerText(), /0,95/);
  // Failed or mixed-type pairs cannot manufacture winners from the available side.
  await page.locator('#compare-type-1').selectOption('acoes');
  await page.locator('#compare-ticker-1').fill('FAIL3');
  await page.locator('.compare-submit').click();
  await page.locator('.compare-results[aria-busy="false"] .asset-compare-table').waitFor();
  assert.match(await page.locator('.compare-results').innerText(), /Fonte indisponível/);
  assert.equal(await page.locator('td.compare-favorable').count(), 0);
  await page.locator('#compare-ticker-1').fill('SANB4');
  await page.locator('.compare-submit').click();
  await page.locator('.compare-results[aria-busy="false"] .asset-compare-table').waitFor();
  assert.equal(await page.locator('td.compare-favorable').count(), 0);
  await page.locator('#compare-ticker-1').fill('WAIT3');
  await page.locator('.compare-submit').click();
  await page.locator('#btn-favoritos').click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.asset-compare-table').count(), 0);
  assert.match(await page.locator('#resultContainer').innerText(), /login/i);
  assert.deepEqual(errors, []);
  console.log('Passed: shorthand/percentage, touch+keyboard tooltips at320/390, five tabs, stocks/FIIs/mixed/error comparisons, mobile fit and cancellation.');
} finally {
  await browser.close();
}
