import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPARISON_ROWS, comparisonNumber, compareIndicator, comparisonTableMarkup, renderCompareTab } from '../public/compare.js';
import { classifyFii } from '../lib/classify.js';

const row = key => COMPARISON_ROWS.find(item => item.key === key);
function asset(ticker, values = {}, tipo = 'acoes', perfil = 'moderado') {
    const result = { ticker, tipo, perfil, metrics: {}, metadata: { updatedAt: '2026-10-27T12:00:00Z' } };
    for (const [key, value] of Object.entries({ vpa: 30, ...values })) {
        result.metrics[key] = value;
        result[key] = { raw: value, value: value === null ? '-' : String(value), class: tipo === 'fiis' ? classifyFii(perfil, key, value) : 'neutral' };
    }
    return result;
}
const choice = (key, left, right) => compareIndicator(row(key), left, right).winner;

test('numeric comparison does not interpret missing values or formatted strings as zero', () => {
    assert.equal(comparisonNumber({ pl: { raw: null, value: '0,00' }, metrics: { pl: 2 } }, 'pl'), null);
    assert.equal(comparisonNumber({ pl: { value: '1.200,00' } }, 'pl'), null);
    assert.equal(comparisonNumber({ metrics: { pl: 8.5 } }, 'pl'), 8.5);
    assert.equal(comparisonNumber({ pl: { raw: Infinity } }, 'pl'), null);
    assert.equal(comparisonNumber({ pl: { raw: '8.5' } }, 'pl'), null);
});

test('last distribution percentage uses current quote and retains a genuine zero payout', () => {
    assert.ok(Math.abs(comparisonNumber(asset('HCTR11', { cotacao: 12.89, ultimoRendimento: .21 }, 'fiis'), 'rendimentoPercentual') - 1.629169899) < 1e-8);
    assert.equal(comparisonNumber(asset('MXRF11', { cotacao: 10, ultimoRendimento: 0 }, 'fiis'), 'rendimentoPercentual'), 0);
    assert.equal(comparisonNumber(asset('MXRF11', { cotacao: 0, ultimoRendimento: .1 }, 'fiis'), 'rendimentoPercentual'), null);
    assert.equal(comparisonNumber(asset('MXRF11', { cotacao: 10, ultimoRendimento: null }, 'fiis'), 'rendimentoPercentual'), null);
    assert.equal(comparisonNumber({ ultimoRendimento: { percentual: 1.2 } }, 'rendimentoPercentual'), 1.2);
    assert.equal(comparisonNumber({ metrics: { rendimentoPercentual: 1.3 } }, 'rendimentoPercentual'), 1.3);
});

test('stock P/L only prefers a lower value when both multiples are positive', () => {
    const right = asset('SANB4', { pl: 8 });
    assert.equal(choice('pl', asset('BBAS3', { pl: 5 }), right), 0);
    for (const value of [null, NaN, 0, -2]) assert.equal(choice('pl', asset('BBAS3', { pl: value }), right), null);
    assert.equal(choice('pl', asset('BBAS3', { pl: 8 }), right), null);
    assert.equal(choice('pl', asset('BBAS3', { pl: 8 + 1e-10 }), right), null);
});

test('missing side, identical tickers and different classes never receive a green winner', () => {
    const left = asset('BBAS3', { pvp: 1 });
    assert.equal(choice('pvp', left, null), null);
    assert.equal(choice('pvp', left, asset('BBAS3', { pvp: 2 })), null);
    assert.equal(choice('pvp', left, asset('MXRF11', { pvp: 1.1 }, 'fiis')), null);
});

test('nominal values, payout and stock dividend yield remain descriptive', () => {
    for (const key of ['cotacao', 'lpa', 'vpa', 'payout', 'dy', 'valorGrahamPadrao', 'precoTeto6']) {
        assert.equal(choice(key, asset('BBAS3', { [key]: 5 }), asset('SANB4', { [key]: 10 })), null, key);
    }
});

test('positive returns can be favorable, but negative returns and negative equity are not ranked', () => {
    assert.equal(choice('roe', asset('BBAS3', { roe: 20 }), asset('SANB4', { roe: 10 })), 0);
    assert.equal(choice('roe', asset('BBAS3', { roe: 20, vpa: -5 }), asset('SANB4', { roe: 10 })), null);
    assert.equal(choice('roa', asset('BBAS3', { roa: -5 }), asset('SANB4', { roa: 10 })), null);
    assert.equal(choice('margemLiquida', asset('BBAS3', { margemLiquida: 5 }), asset('SANB4', { margemLiquida: 10 })), 1);
});

test('debt rankings guard against negative or unknown denominators', () => {
    const right = asset('SANB4', { divLiqPatrimonio: .6, divLiqEbitda: 2 });
    assert.equal(choice('divLiqPatrimonio', asset('BBAS3', { divLiqPatrimonio: 0 }), right), 0);
    assert.equal(choice('divLiqPatrimonio', asset('BBAS3', { divLiqPatrimonio: -.2 }), right), null);
    assert.equal(choice('divLiqPatrimonio', asset('BBAS3', { divLiqPatrimonio: .2, vpa: -4 }), right), null);
    assert.equal(choice('divLiqEbitda', asset('BBAS3', { divLiqPatrimonio: .2, divLiqEbitda: 1 }), right), 0);
    assert.equal(choice('divLiqEbitda', asset('BBAS3', { divLiqPatrimonio: -.2, divLiqEbitda: 1 }), right), null);
    assert.equal(choice('divLiqEbitda', asset('BBAS3', { divLiqEbitda: 1 }), right), null);
});

test('FII P/VP uses the existing profile range and never blindly prefers an extreme discount', () => {
    const good = asset('MXRF11', { pvp: .98 }, 'fiis');
    assert.equal(choice('pvp', asset('HCTR11', { pvp: .12 }, 'fiis'), good), 1);
    assert.equal(choice('pvp', asset('HCTR11', { pvp: .12 }, 'fiis'), asset('HGLG11', { pvp: 1.3 }, 'fiis')), null);
    assert.equal(choice('pvp', good, asset('HGLG11', { pvp: 1.02 }, 'fiis')), null);
});

test('FII high historical DY is favorable only within the selected profile range', () => {
    assert.equal(choice('dy', asset('HCTR11', { dy: 25 }, 'fiis'), asset('MXRF11', { dy: 12 }, 'fiis')), 1);
    assert.equal(choice('dy', asset('HCTR11', { dy: 25 }, 'fiis'), asset('MXRF11', { dy: 30 }, 'fiis')), null);
    assert.equal(choice('dy', asset('HCTR11', { dy: 10 }, 'fiis'), asset('MXRF11', { dy: 12 }, 'fiis')), 1);
    assert.equal(choice('dy', asset('HCTR11', { dy: 10 }, 'fiis', 'conservador'), asset('MXRF11', { dy: 12 }, 'fiis', 'conservador')), 0);
});

test('vacancy comparison requires matching segments and a meaningful percentage range', () => {
    const left = asset('HGLG11', { vacancia: 4 }, 'fiis');
    const right = asset('XPLG11', { vacancia: 7 }, 'fiis');
    assert.equal(choice('vacancia', left, right), null);
    left.segmento = { value: 'Logística' };
    right.segmento = { value: 'logística' };
    assert.equal(choice('vacancia', left, right), 0);
    right.segmento.value = 'Shoppings';
    assert.equal(choice('vacancia', left, right), null);
    right.segmento.value = 'Logística';
    right.vacancia.raw = 101;
    assert.equal(choice('vacancia', left, right), null);
});

test('table preserves partial results without winners and escapes external data', () => {
    const selections = [{ tipo: 'acoes', ticker: 'BBAS3' }, { tipo: 'acoes', ticker: 'SANB4' }];
    const first = asset('BBAS3', { pl: 5 });
    first.pl.value = '<img src=x onerror=alert(1)>';
    const html = comparisonTableMarkup([{ data: first }, { error: '<script>bad</script>' }], selections);
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
    assert.ok(!html.includes('class="compare-favorable"'));
    assert.ok(html.includes('BBAS3'));
    assert.ok(html.includes('scope="row"'));
});

test('mixed classes show the union of fields and no green winner', () => {
    const selections = [{ tipo: 'acoes', ticker: 'BBAS3' }, { tipo: 'fiis', ticker: 'MXRF11' }];
    const html = comparisonTableMarkup([{ data: asset('BBAS3', { pl: 5 }) }, { data: asset('MXRF11', { dy: 12 }, 'fiis') }], selections);
    assert.ok(html.includes('data-indicator="pl"'));
    assert.ok(html.includes('data-indicator="ultimoRendimento"'));
    assert.ok(html.includes('compare-mixed-note'));
    assert.ok(!html.includes('class="compare-favorable"'));
});

function harness() {
    const nodes = new Map();
    const node = (selector, value = '') => {
        const valueNode = { value, innerHTML: '', textContent: '', disabled: false, attributes: {}, events: {}, addEventListener(type, fn) { this.events[type] = fn; }, setAttribute(name, value) { this.attributes[name] = value; } };
        nodes.set(selector, valueNode);
        return valueNode;
    };
    const form = node('.compare-form');
    node('.compare-form-error');
    const output = node('.compare-results');
    node('.compare-submit');
    node('#compare-profile', 'moderado');
    node('#compare-ticker-0', 'BBAS3');
    node('#compare-ticker-1', 'SANB4');
    node('#compare-type-0', 'acoes');
    node('#compare-type-1', 'acoes');
    const cleanup = renderCompareTab({ innerHTML: '', querySelector: selector => nodes.get(selector) }, 'https://example.test/');
    return { nodes, output, cleanup, submit: () => form.events.submit({ preventDefault() {} }) };
}
const response = data => ({ ok: true, json: async () => data });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('both API requests start together, normalize FII suffixes and preserve a successful side on error', async t => {
    const requests = [];
    t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })));
    const ui = harness();
    ui.nodes.get('#compare-type-0').value = 'fiis';
    ui.nodes.get('#compare-ticker-0').value = ' mxrf ';
    const done = ui.submit();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, 'https://example.test/api/fiis');
    assert.deepEqual(JSON.parse(requests[0].options.body), { ticker: 'MXRF11', perfil: 'moderado' });
    requests[1].resolve(response(asset('SANB4', { pl: 8 })));
    await flush();
    assert.ok(ui.output.innerHTML.includes('>8</span>'));
    requests[0].reject(new Error('Fonte indisponível'));
    await done;
    assert.ok(ui.output.innerHTML.includes('Fonte indisponível'));
    assert.ok(ui.output.innerHTML.includes('>8</span>'));
    assert.ok(!ui.output.innerHTML.includes('class="compare-favorable"'));
    assert.equal(ui.output.attributes['aria-busy'], 'false');
    ui.cleanup();
});

test('an older response cannot overwrite a newer comparison', async t => {
    const requests = [];
    t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => requests.push({ options, resolve })));
    const ui = harness();
    const oldDone = ui.submit();
    ui.nodes.get('#compare-ticker-0').value = 'PETR4';
    ui.nodes.get('#compare-ticker-1').value = 'VALE3';
    const newDone = ui.submit();
    assert.ok(requests[0].options.signal.aborted);
    requests[2].resolve(response(asset('PETR4', { pl: 4 })));
    requests[3].resolve(response(asset('VALE3', { pl: 6 })));
    await newDone;
    const newestMarkup = ui.output.innerHTML;
    requests[0].resolve(response(asset('BBAS3', { pl: 1 })));
    requests[1].resolve(response(asset('SANB4', { pl: 3 })));
    await oldDone;
    assert.equal(ui.output.innerHTML, newestMarkup);
    assert.ok(newestMarkup.includes('PETR4'));
    assert.ok(!newestMarkup.includes('BBAS3'));
    ui.cleanup();
});

test('leaving the tab aborts both requests and prevents later DOM writes', async t => {
    const requests = [];
    t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => requests.push({ options, resolve })));
    const ui = harness();
    const done = ui.submit();
    const beforeCleanup = ui.output.innerHTML;
    ui.cleanup();
    assert.ok(requests.every(request => request.options.signal.aborted));
    requests[0].resolve(response(asset('BBAS3', { pl: 1 })));
    requests[1].resolve(response(asset('SANB4', { pl: 2 })));
    await done;
    assert.equal(ui.output.innerHTML, beforeCleanup);
});

test('duplicate and malformed tickers do not make API calls', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not fetch'); });
    const ui = harness();
    ui.nodes.get('#compare-ticker-1').value = 'bbas3';
    await ui.submit();
    assert.match(ui.nodes.get('.compare-form-error').textContent, /diferentes/);
    ui.nodes.get('#compare-ticker-1').value = '<script>';
    await ui.submit();
    assert.match(ui.nodes.get('.compare-form-error').textContent, /válidos/);
    assert.equal(fetch.mock.callCount(), 0);
    ui.cleanup();
});
