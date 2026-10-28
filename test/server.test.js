import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

const stockIndicator = (title, value) => `<div class="indicator-card"><div class="indicator-card-title"><span>${title}</span></div><div class="indicator-history-graph" data-current-value="${value}"></div></div>`;
const stockHtml = `<div class="value">R$ 40,00</div>${[
  ['P/L', 10], ['P/VP', 1.6], ['Dividend Yield', 6], ['LPA', 4], ['VPA', 25], ['CAGR Lucros 5 anos', 7], ['ROE', 16],
].map(([title, value]) => stockIndicator(title, value)).join('')}`;
const fiiIndicator = (title, value) => `<div class="cell"><span class="name">${title}</span><span class="value">${value}</span></div>`;
const fiiHtml = `<div class="value">R$ 12,99</div>${[
  ['Último Rendimento', 'R$ 0,21'], ['P/VP', '0,90'], ['Dividend Yield', '12,00%'], ['Vacância', '5,00%'], ['Segmento', 'Recebíveis'],
].map(([title, value]) => fiiIndicator(title, value)).join('')}`;

test('Express integration: public UI, asset analysis, cache, validation and private-file boundaries', async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.NODE_ENV = 'test';
  delete process.env.GEMINI_API_KEY;
  const calls = [];
  t.mock.method(axios, 'get', async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.bcb.gov.br/')) return { data: [{ valor: '11.00', data: '26/10/2026' }] };
    if (url.includes('/acoes/')) return { data: stockHtml };
    if (url.includes('/fiis/')) return { data: fiiHtml };
    throw new Error('Unexpected external request');
  });
  const { default: app } = await import('../server.js');
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => {
    await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  await t.test('renders HTML from root; health and profiles remain available', async () => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /Invista/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'online');
    const profiles = await (await fetch(`${base}/api/perfis`)).json();
    assert.deepEqual(profiles.acoes, ['conservador', 'moderado', 'arrojado']);
    assert.deepEqual(profiles.fiis, profiles.acoes);
  });

  await t.test('stock endpoint combines numeric indicators, correct estimates and source metadata', async () => {
    const response = await post('/api/acoes', { ticker: 'b3sa3', perfil: 'moderado' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ticker, 'B3SA3');
    assert.equal(result.metrics.cotacao, 40);
    assert.equal(result.valorGrahamPadrao.raw, Math.sqrt(2250));
    assert.equal(result.valorGrahamRev.raw, 36);
    assert.equal(result.precoTeto6.raw, 40);
    assert.equal(result.precoTeto6.class, 'neutral');
    assert.equal(result.selicUtilizada, 11);
    assert.equal(result.metadata.selic.stale, false);
    assert.match(result.metadata.source, /\/acoes\/b3sa3\/$/);
    assert.ok(Date.parse(result.metadata.updatedAt));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(result.methodology.bazin);
  });

  await t.test('FII endpoint reproduces user example and cached data supports profile switching', async () => {
    const response = await post('/api/fiis', { ticker: 'HCTR11', perfil: 'moderado' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.simulation, { cotas: 62, aporte: 805.38, rendaMensal: 13.02 });
    assert.equal(result.ebn.value, '62');
    assert.equal(result.vn.value, 'R$ 805,38');
    assert.equal(result.ultimoRendimento.raw, 0.21);
    assert.equal(result.segmento.value, 'Recebíveis');
    assert.equal(result.dy.class, 'good');
    const conservative = await (await post('/api/fiis', { ticker: 'hctr', perfil: 'conservador' })).json();
    assert.equal(conservative.ticker, 'HCTR11');
    assert.equal(conservative.ultimoRendimento.percentualValue, '1,62%');
    assert.equal(conservative.perfil, 'conservador');
    assert.equal(conservative.dy.class, 'neutral');
    assert.equal(calls.filter(url => url.includes('/fiis/hctr11/')).length, 1);
  });

  await t.test('invalid inputs and malformed JSON do not make upstream requests', async () => {
    const count = calls.length;
    for (const route of ['/api/acoes', '/api/fiis']) {
      for (const body of [{}, { ticker: '../HCTR11' }, { ticker: ['PETR4'] }, { ticker: 'PETR4', perfil: 'invalido' }]) {
        const response = await post(route, body);
        assert.equal(response.status, 400);
        assert.ok((await response.json()).error);
      }
    }
    const malformed = await fetch(`${base}/api/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error, 'JSON inválido.');
    const oversized = await post('/api/auxiliar', { message: 'a'.repeat(40_000) });
    assert.equal(oversized.status, 413);
    assert.equal(calls.length, count);
  });

  await t.test('auxiliary endpoints report missing configuration and do not publish secrets or source files', async () => {
    const status = await (await fetch(`${base}/api/auxiliar/status`)).json();
    assert.equal(status.configured, false);
    const response = await post('/api/auxiliar', { message: 'Explique DY' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'NOT_CONFIGURED');
    for (const path of ['/.env', '/.env.local', '/server.js', '/lib/auxiliar.js', '/package.json', '/.git/config']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
  });
});
