import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { buscarAcao, buscarFii, parseAcaoHtml, parseFiiHtml, getScraperMetadata, normalizarTicker } from '../lib/scraper.js';

const fiiHtml = `<div class="value">R$ 12,99</div>
  <div class="_card"><div class="_card-header"><span>Último rendimento</span></div><div class="_card-body"><span>R$ 0,21</span></div></div>
  <div class="cell"><span class="name">Número de Cotistas</span><div class="value">123456</div></div>
  <div class="cell"><span class="name">Liquidez diária</span><div class="value">R$ 850 mil</div></div>`;
const stockHtml = `<div class="value">R$ 50,00</div>
  <div class="indicator-card"><div class="indicator-card-title"><span>LPA</span></div><span class="indicator-history-graph" data-current-value="4.25"></span></div>
  <div class="indicator-card"><div class="indicator-card-title"><span>VPA</span></div><div class="indicator-card-value"><span>1.234,56</span></div></div>`;

test('extracts both layouts without truncating counts or decimal data attributes', () => {
  const fii = parseFiiHtml(fiiHtml);
  assert.equal(fii.dictNum.cotacao, 12.99);
  assert.equal(fii.dictNum.ultimorendimento, 0.21);
  assert.equal(fii.dictNum.numerodecotistas, 123456);
  assert.equal(fii.dictNum.liquidezdiaria, 850000);
  const stock = parseAcaoHtml(stockHtml);
  assert.equal(stock.lpa, 4.25);
  assert.equal(stock.vpa, 1234.56);
  assert.throws(() => parseFiiHtml('<html>Access denied</html>'));
  assert.throws(() => parseAcaoHtml('<html>Access denied</html>'));
});

test('ticker validation happens before network access', async t => {
  const get = t.mock.method(axios, 'get', async () => { throw new Error('unexpected'); });
  assert.equal(normalizarTicker(' b3sa3 '), 'B3SA3');
  await assert.rejects(buscarFii('../secret'), { status: 400 });
  await assert.rejects(buscarAcao({ ticker: 'PETR4' }), { status: 400 });
  assert.equal(get.mock.callCount(), 0);
});

test('concurrent requests share one scrape and repeated request uses cached data', async t => {
  const get = t.mock.method(axios, 'get', async () => {
    await new Promise(resolve => setImmediate(resolve));
    return { data: fiiHtml };
  });
  const values = await Promise.all([buscarFii('HCTR11'), buscarFii('hctr11'), buscarFii(' HCTR11 ')]);
  assert.deepEqual(values[0], values[1]);
  await buscarFii('HCTR11');
  assert.equal(get.mock.callCount(), 1);
  const meta = getScraperMetadata('fiis', 'HCTR11');
  assert.match(meta.source, /\/fiis\/hctr11\/$/);
  assert.ok(meta.updatedAt);
  assert.equal(meta.cacheTtlMs, 300000);
});

test('invalid scraped page is not cached and blocks are not retried', async t => {
  let valid = false;
  const get = t.mock.method(axios, 'get', async () => ({ data: valid ? stockHtml : '<html>empty</html>' }));
  await assert.rejects(buscarAcao('TEST3'));
  valid = true;
  assert.equal((await buscarAcao('TEST3')).lpa, 4.25);
  assert.equal(get.mock.callCount(), 2);
  get.mock.mockImplementation(async () => { throw Object.assign(new Error('limited'), { response: { status: 429 } }); });
  await assert.rejects(buscarFii('TEST11'), { possivelBloqueio: true });
  assert.equal(get.mock.callCount(), 3);
});

test('BCB cold failure has no invented rate and suppresses repeated retries', async t => {
  const get = t.mock.method(axios, 'get', async () => { throw new Error('offline'); });
  const bcb = await import('../lib/bcb.js?cold-failure');
  const info = await bcb.getSelicInfo();
  assert.equal(info.valor, null);
  assert.equal(info.unavailable, true);
  assert.equal(info.updatedAt, null);
  assert.equal(await bcb.getSelicAtual(), null);
  assert.equal(get.mock.callCount(), 1);
});

test('BCB coalesces queries and exposes stale rate provenance on refresh failure', async t => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const get = t.mock.method(axios, 'get', async () => ({ data: [{ valor: '13.75', data: '26/10/2026' }] }));
  const bcb = await import('../lib/bcb.js?stale-cache');
  const [info] = await Promise.all([bcb.getSelicInfo(), bcb.getSelicInfo()]);
  assert.equal(info.valor, 13.75);
  assert.equal(info.dataReferencia, '26/10/2026');
  assert.equal(info.stale, false);
  assert.equal(get.mock.callCount(), 1);
  now += 7 * 60 * 60 * 1000;
  get.mock.mockImplementation(async () => { throw new Error('offline'); });
  const stale = await bcb.getSelicInfo();
  assert.equal(stale.valor, 13.75);
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, info.updatedAt);
  assert.equal(stale.unavailable, false);
});
