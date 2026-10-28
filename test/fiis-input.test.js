import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTicker } from '../public/tickers.js';
import { buildFiiAnalysis, validateAnalysisInput } from '../lib/analysis.js';
import { validateAuxiliarInput } from '../lib/auxiliar.js';

test('FII shorthand is canonical across UI, API and Gemini context; stock symbols are unchanged', () => {
  for (const input of ['mxrf', ' MXRF ', 'mxrf11']) {
    assert.equal(normalizeTicker(input, 'fiis'), 'MXRF11');
    assert.equal(validateAnalysisInput('fiis', input).ticker, 'MXRF11');
    assert.equal(validateAuxiliarInput({ ticker: input, tipo: 'fiis', message: 'Explique o rendimento' }).ticker, 'MXRF11');
  }
  assert.equal(normalizeTicker('b3sa3', 'acoes'), 'B3SA3');
  assert.equal(normalizeTicker('SANB11', 'acoes'), 'SANB11');
  for (const value of ['MXRF1', 'MXRF12', '../MXRF', 'M XRF', ['MXRF'], null]) {
    assert.equal(normalizeTicker(value, 'fiis'), null);
    assert.throws(() => validateAnalysisInput('fiis', value));
  }
  assert.equal(normalizeTicker('BBAS', 'acoes'), null);
  assert.equal(normalizeTicker('MXRF', 'unknown'), null);
});

test('last distribution percentage uses the current quote, without changing nominal dividend or snowball formulas', () => {
  const build = (quote, dividend) => buildFiiAnalysis({ dictNum: { cotacao: quote, ultimorendimento: dividend }, dictRaw: {} }, 'HCTR11', 'moderado');
  const result = build(12.89, 0.21);
  assert.equal(result.ultimoRendimento.value, 'R$ 0,21');
  assert.equal(result.ultimoRendimento.percentualValue, '1,63%');
  assert.equal(result.ultimoRendimento.percentual, 0.21 / 12.89 * 100);
  assert.equal(result.metrics.rendimentoPercentual, result.ultimoRendimento.percentual);
  assert.deepEqual(result.simulation, { cotas: 62, aporte: 799.18, rendaMensal: 13.02 });
  assert.equal(build(12.89, 0).ultimoRendimento.percentual, 0);
  for (const [quote, dividend] of [[0, .21], [null, .21], [12.89, null], [12.89, -1], [Infinity, .21]]) {
    assert.equal(build(quote, dividend).ultimoRendimento.percentual, null);
  }
});
