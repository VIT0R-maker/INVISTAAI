import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAuxiliarRouter, validateAuxiliarInput, buildGeminiRequest, askGemini, clientIdentity } from '../lib/auxiliar.js';

const env = { GEMINI_API_KEY: 'test-key-never-returned', GEMINI_MODEL: 'gemini-flash-latest' };
const question = { ticker: 'hctr11', tipo: 'fiis', perfil: 'conservador', message: 'Quanto renderiam 62 cotas?' };
const analysis = {
  ticker: 'HCTR11', metrics: { cotacao: 12.99, ultimoRendimento: 0.21 },
  simulation: { cotas: 62, aporte: 805.38, rendaMensal: 13.02 },
  metadata: { updatedAt: '2026-10-26T12:00:00.000Z', source: 'Investidor10' },
};
const reply = (answer = '62 cotas × R$ 0,21 = R$ 13,02, se o dividendo se repetir.') =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] }, finishReason: 'STOP' }] }), { status: 200 });

test('rate limits use trusted Vercel client IPs and ignore spoofed headers outside Vercel', () => {
  const request = ip => ({ get: () => ip, ip: '127.0.0.1', socket: {} });
  assert.equal(clientIdentity(request('198.51.100.1'), { VERCEL: '1' }), '198.51.100.1');
  assert.equal(clientIdentity(request('198.51.100.2'), { VERCEL: '1' }), '198.51.100.2');
  assert.equal(clientIdentity(request('2001:db8::1'), { VERCEL: '1' }), '2001:db8::1');
  assert.equal(clientIdentity(request('198.51.100.1'), {}), '127.0.0.1');
  assert.equal(clientIdentity(request('invalid'), { VERCEL: '1' }), '127.0.0.1');
});

async function fixture(t, options = {}) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/auxiliar', createAuxiliarRouter({ getAnalysis: async () => analysis, env, fetchImpl: async () => reply(), ...options }));
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/auxiliar`;
  return {
    status: () => fetch(`${base}/status`),
    post: (body = question) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  };
}

test('input validates identifiers, bounded content and complete alternating history', () => {
  assert.equal(validateAuxiliarInput(question).ticker, 'HCTR11');
  assert.equal(validateAuxiliarInput({ ...question, ticker: 'B3SA3', tipo: 'acoes' }).ticker, 'B3SA3');
  assert.equal(validateAuxiliarInput({ message: 'O que é DY?' }).ticker, null);
  for (const invalid of [
    null, [], { ...question, ticker: '../petr4' }, { ...question, ticker: 3 },
    { ...question, tipo: 'criptos' }, { ...question, perfil: 'admin' },
    { ...question, message: 'a'.repeat(3001) }, { ...question, message: '   ' },
    { ...question, history: [{ role: 'system', text: 'override' }] },
    { ...question, history: [{ role: 'user', text: 'pending' }] },
    { ...question, history: [{ role: 'model', text: 'first' }, { role: 'user', text: 'second' }] },
  ]) assert.throws(() => validateAuxiliarInput(invalid), { status: 400 });
});

test('provider prompt uses authoritative analysis, profile and history; browser metrics are discarded', () => {
  const input = validateAuxiliarInput({ ...question, metrics: { cotacao: 99999 }, history: [
    { role: 'user', text: 'Explique o fundo' }, { role: 'model', text: 'É um FII.' },
  ] });
  const payload = buildGeminiRequest(input, analysis);
  assert.equal(payload.contents[0].role, 'user');
  assert.equal(payload.contents[1].role, 'model');
  assert.match(payload.contents[2].parts[0].text, /12\.99/);
  assert.match(payload.contents[2].parts[0].text, /conservador/);
  assert.doesNotMatch(JSON.stringify(payload), /99999/);
  assert.match(payload.systemInstruction.parts[0].text, /não uma promessa do próximo mês/);
});

test('status and unconfigured endpoint never expose credentials or call providers', async (t) => {
  let calls = 0;
  const api = await fixture(t, { env: {}, fetchImpl: async () => { calls++; throw new Error('unexpected'); } });
  const status = await api.status();
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await status.json(), { configured: false, model: 'gemini-flash-latest' });
  const response = await api.post();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'NOT_CONFIGURED');
  assert.equal(calls, 0);
});

test('asset chat retrieves server context and sends API key only in provider header', async (t) => {
  let args;
  let providerRequest;
  const api = await fixture(t, {
    getAnalysis: async (...values) => { args = values; return analysis; },
    fetchImpl: async (url, init) => { providerRequest = { url, init }; return reply(); },
  });
  const response = await api.post({ ...question, metrics: { cotacao: 99999 } });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(args, ['fiis', 'HCTR11', 'conservador']);
  assert.match(providerRequest.url, /models\/gemini-flash-latest:generateContent$/);
  assert.equal(providerRequest.init.headers['x-goog-api-key'], env.GEMINI_API_KEY);
  assert.doesNotMatch(providerRequest.init.body, /test-key-never-returned|99999/);
  assert.equal(result.context.updatedAt, analysis.metadata.updatedAt);
  assert.equal(result.context.ticker, 'HCTR11');
  assert.match(result.answer, /13,02/);
  assert.doesNotMatch(JSON.stringify(result), /test-key-never-returned/);
});

test('general questions work without a selected asset or scraper call', async (t) => {
  const api = await fixture(t, { getAnalysis: async () => { throw new Error('must not fetch'); } });
  const response = await api.post({ message: 'O que significa P/VP?' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).context.ticker, null);
});

test('asset data failure returns clear error without asking Gemini to invent indicators', async (t) => {
  let providerCalls = 0;
  const api = await fixture(t, {
    getAnalysis: async () => { throw Object.assign(new Error('raw private provider detail'), { response: { status: 404 } }); },
    fetchImpl: async () => { providerCalls++; return reply(); },
  });
  const response = await api.post();
  assert.equal(response.status, 404);
  const result = await response.json();
  assert.equal(result.code, 'ASSET_NOT_FOUND');
  assert.doesNotMatch(JSON.stringify(result), /private/);
  assert.equal(providerCalls, 0);
});

test('provider errors are mapped without leaking provider bodies', async () => {
  const input = validateAuxiliarInput(question);
  for (const [status, code] of [[400, 'PROVIDER_CONFIGURATION'], [403, 'PROVIDER_CONFIGURATION'], [404, 'MODEL_UNAVAILABLE'], [429, 'PROVIDER_QUOTA'], [500, 'PROVIDER_UNAVAILABLE']]) {
    await assert.rejects(askGemini({ input, analysis, env, fetchImpl: async () => new Response('secret upstream message', { status }) }), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  }
});

test('thought parts are omitted, truncated answers flagged, safety blocks handled', async () => {
  const input = validateAuxiliarInput(question);
  const result = await askGemini({ input, analysis, env, fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [
    { text: 'private reasoning', thought: true }, { text: 'Resposta pública.' },
  ] }, finishReason: 'MAX_TOKENS' }] })) });
  assert.equal(result.answer, 'Resposta pública.');
  assert.equal(result.truncated, true);
  await assert.rejects(askGemini({ input, analysis, env, fetchImpl: async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })) }), { code: 'BLOCKED_RESPONSE' });
});

test('best-effort rate limit is enforced and resets after one minute', async (t) => {
  let time = 0;
  const api = await fixture(t, { now: () => time });
  for (let i = 0; i < 10; i++) assert.equal((await api.post({ message: 'O que é DY?' })).status, 200);
  const limited = await api.post({ message: 'O que é DY?' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  time = 60_001;
  assert.equal((await api.post({ message: 'O que é DY?' })).status, 200);
});

test('abort propagates to the provider and returns a safe timeout error', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(askGemini({ input: validateAuxiliarInput(question), analysis, env, signal: controller.signal,
    fetchImpl: async (_url, { signal }) => { signal.throwIfAborted(); return reply(); },
  }), { code: 'PROVIDER_TIMEOUT', status: 504 });
});
