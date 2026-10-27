import test from 'node:test';
import assert from 'node:assert/strict';
import { grahamNumero, grahamRevisado, grahamTupiniquim, precoTetoBazin, calcularBolaDeNeve, precoJustoGordon } from '../lib/valuation.js';
import { parseForMath, parseValorComSufixo, formatCurrency, formNum, margemSeguranca } from '../lib/format.js';

test('parser preserves ungrouped digits, decimals, negatives and scaled values', () => {
  for (const [input, expected] of [
    ['1234', 1234], ['1234567,89', 1234567.89], ['R$ 1.234,56', 1234.56],
    ['−12,50%', -12.5], ['0,21', 0.21], ['1.234.567', 1234567], ['12.99', 12.99],
    ['N/A', null], ['-', null], [Infinity, null], [NaN, null], [null, null],
  ]) assert.equal(parseForMath(input), expected, String(input));
  assert.equal(parseValorComSufixo('R$ 1,2 bilhão'), 1_200_000_000);
  assert.equal(parseValorComSufixo('R$ 850 mil'), 850_000);
  assert.equal(parseValorComSufixo('2,5 M'), 2_500_000);
  assert.equal(formatCurrency(1234.56), 'R$ 1.234,56');
  assert.equal(formatCurrency(Infinity), '-');
  assert.equal(formNum(NaN), '-');
});

test('valuation numeric conventions and margin denominator', () => {
  assert.equal(grahamNumero(4, 25), Math.sqrt(2250));
  assert.equal(grahamRevisado(4, 7, 11), 36);
  assert.equal(grahamTupiniquim(4, 7, 11), 31.200000000000003);
  assert.equal(precoTetoBazin(6, 50, 0.06), 50);
  assert.equal(precoTetoBazin(6, 50, 0.08), 37.5);
  assert.equal(margemSeguranca(80, 100), 20);
  assert.equal(margemSeguranca(120, 100), -20);
});

test('existing formula behavior is preserved; presentation validation belongs to the analysis service', () => {
  assert.equal(grahamRevisado(4, null, 11), grahamRevisado(4, 0, 11));
  assert.equal(grahamTupiniquim(4, null, 11), grahamTupiniquim(4, 0, 11));
  assert.equal(grahamRevisado(4, -20, 11), 4 * (8.5 - 40) * (4.4 / 11));
  assert.equal(grahamTupiniquim(4, -20, 11), 4 * (5.5 - 40) * (4.4 / 11));
  assert.equal(grahamNumero(-4, -25), null);
  assert.equal(margemSeguranca(80, Infinity), null);
});

test('Gordon projects D0 to D1 and requires explicit valid annual assumptions', () => {
  assert.ok(Math.abs(precoJustoGordon(3, 12, 4) - 39) < 1e-10);
  assert.equal(precoJustoGordon(3, 12, 0), 25);
  assert.ok(Math.abs(precoJustoGordon(3, 12, -2) - 21) < 1e-10);
  for (const [dividend, rate, growth] of [
    [3, 5, 5], [3, 4, 5], [3, 12, -100], [0, 12, 4], [-3, 12, 4],
    [3, 0, -2], [3, null, 4], [3, 12, undefined], [3, Infinity, 4], [Infinity, 12, 4],
  ]) assert.equal(precoJustoGordon(dividend, rate, growth), null);
});

test('snowball uses whole quotas and reproduces the user example', () => {
  assert.deepEqual(calcularBolaDeNeve(12.99, 0.21), {
    cotas: 62, valorNecessario: 805.38, rendimentoEstimado: 13.02,
  });
  assert.equal(Number((63 * 12.99).toFixed(2)), 818.37);
  assert.equal(Number((63 * 0.21).toFixed(2)), 13.23);
  assert.equal(calcularBolaDeNeve(8.8, 0.1).cotas, 88);
  assert.equal(calcularBolaDeNeve(13, 13).cotas, 1);
  for (const value of [0, -1, null, Infinity, NaN]) assert.equal(calcularBolaDeNeve(12.99, value), null);
  assert.equal(calcularBolaDeNeve(12.99, Number.MIN_VALUE), null);
});
