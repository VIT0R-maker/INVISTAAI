import { escapeHTML } from './charts.js';
import { normalizeTicker } from './tickers.js';

const profiles = { conservador: 'Conservador', moderado: 'Moderado', arrojado: 'Arrojado' };
const typeNames = { acoes: 'Ação', fiis: 'FII' };
const percentage = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const both = ['acoes', 'fiis'];
const stocks = ['acoes'];
const funds = ['fiis'];

// Criteria are deliberately per indicator. An asset is never an overall winner.
export const COMPARISON_ROWS = [
    { key: 'cotacao', label: 'Cotação atual', types: both, criterion: 'Preço nominal não indica qual ativo está mais barato em termos de valor.' },
    { key: 'pl', label: 'P/L', types: stocks, direction: 'lower', positive: true, criterion: 'Menor múltiplo entre dois valores positivos. Compare empresas do mesmo setor.' },
    { key: 'pvp', label: 'P/VP', types: both, direction: 'lower', positive: true, criterion: 'Ações: menor múltiplo positivo. FIIs: faixa favorável ao perfil; desconto extremo não recebe preferência.' },
    { key: 'dy', label: 'DY (12 meses)', types: both, criterion: 'FIIs: faixa favorável ao perfil; entre dois FIIs nessa faixa, maior DY. Ações: dado descritivo, pois o pagamento pode não se repetir.' },
    { key: 'ultimoRendimento', label: 'Último rendimento', types: funds, criterion: 'Valor por cota. Um valor nominal maior não significa melhor retorno.' },
    { key: 'rendimentoPercentual', label: 'Último rendimento / cotação', types: funds, criterion: 'Último provento dividido pela cotação atual. É um pagamento passado, não uma previsão.' },
    { key: 'payout', label: 'Payout', types: stocks, criterion: 'Parcela do lucro distribuída. A faixa adequada depende do setor e da estratégia; sem preferência automática.' },
    { key: 'roe', label: 'ROE', types: stocks, direction: 'higher', positive: true, criterion: 'Maior retorno positivo, com patrimônio por ação positivo nos dois ativos. Avalie também a alavancagem.' },
    { key: 'roic', label: 'ROIC', types: stocks, direction: 'higher', positive: true, criterion: 'Maior retorno positivo sobre o capital investido. Compare empresas do mesmo setor.' },
    { key: 'roa', label: 'ROA', types: stocks, direction: 'higher', positive: true, criterion: 'Maior retorno positivo sobre os ativos. Compare empresas do mesmo setor.' },
    { key: 'margemBruta', label: 'Margem bruta', types: stocks, direction: 'higher', positive: true, criterion: 'Maior margem positiva; modelos de negócio e setores precisam ser semelhantes.' },
    { key: 'margemEbitda', label: 'Margem EBITDA', types: stocks, direction: 'higher', positive: true, criterion: 'Maior margem positiva; não mede a geração de caixa final.' },
    { key: 'margemLiquida', label: 'Margem líquida', types: stocks, direction: 'higher', positive: true, criterion: 'Maior margem positiva; verifique eventos não recorrentes.' },
    { key: 'divLiqPatrimonio', label: 'Dívida líquida / patrimônio', types: stocks, direction: 'lower', nonnegative: true, criterion: 'Menor dívida relativa, com patrimônio por ação positivo e razões não negativas nos dois ativos.' },
    { key: 'divLiqEbitda', label: 'Dívida líquida / EBITDA', types: stocks, direction: 'lower', positive: true, criterion: 'Menor razão positiva, quando dívida e patrimônio também são positivos. Sem preferência se os sinais forem ambíguos.' },
    { key: 'liquidezCorrente', label: 'Liquidez corrente', types: stocks, direction: 'higher', positive: true, criterion: 'Maior cobertura positiva do passivo circulante. Excesso de liquidez também pode ter custo.' },
    { key: 'cagr5a', label: 'Crescimento dos lucros (5 anos)', types: stocks, direction: 'higher', positive: true, criterion: 'Maior crescimento histórico positivo. Não é uma projeção.' },
    { key: 'giroAtivos', label: 'Giro dos ativos', types: stocks, direction: 'higher', positive: true, criterion: 'Maior giro positivo; compare empresas do mesmo setor.' },
    { key: 'lpa', label: 'Lucro por ação', types: stocks, criterion: 'Valor por ação depende da quantidade de ações. Sem preferência pelo valor nominal.' },
    { key: 'vpa', label: 'Valor patrimonial por ação/cota', types: both, criterion: 'Valor nominal por unidade. Sem preferência automática.' },
    { key: 'liquidezDiaria', label: 'Liquidez diária', types: funds, direction: 'higher', positive: true, criterion: 'Maior volume negociado favorece a negociação. Não mede a qualidade da carteira.' },
    { key: 'vacancia', label: 'Vacância', types: funds, direction: 'lower', nonnegative: true, percent: true, criterion: 'Menor vacância entre fundos do mesmo segmento, usando valores de 0% a 100%.' },
    { key: 'variacao12m', label: 'Variação (12 meses)', types: funds, criterion: 'Desempenho passado; sem preferência automática.' },
    { key: 'valorPatrimonial', label: 'Patrimônio do fundo', types: funds, criterion: 'Tamanho não determina qualidade. Dado descritivo.' },
    { key: 'numeroCotistas', label: 'Número de cotistas', types: funds, criterion: 'Popularidade não determina qualidade. Dado descritivo.' },
    { key: 'ebn', label: 'Cotas para bola de neve', types: funds, criterion: 'Estimativa para recomprar uma cota com o último rendimento. Não garante pagamentos futuros.' },
    { key: 'vn', label: 'Valor para bola de neve', types: funds, criterion: 'Capital estimado para o cenário de reinvestimento. Menor valor não implica menor risco.' },
    { key: 'segmento', label: 'Segmento', types: funds, criterion: 'Compare fundos com carteiras e riscos semelhantes.' },
    { key: 'mandato', label: 'Mandato', types: funds, criterion: 'Objetivo e estratégia do fundo.' },
    { key: 'tipoFundo', label: 'Tipo de fundo', types: funds, criterion: 'Característica da carteira; sem preferência automática.' },
    { key: 'tipoGestao', label: 'Tipo de gestão', types: funds, criterion: 'Estilo de gestão; sem preferência automática.' },
    { key: 'taxaAdministracao', label: 'Taxa de administração', types: funds, criterion: 'Bases de cobrança podem diferir; sem comparação numérica automática.' },
    { key: 'valorGrahamPadrao', label: 'Graham clássico', types: stocks, criterion: 'Estimativa por ação. Compare com a cotação do próprio ativo, não com o valor nominal de outro.' },
    { key: 'valorGrahamRev', label: 'Graham adaptado à Selic', types: stocks, criterion: 'Estimativa com hipóteses de crescimento histórico e Selic; não é uma previsão.' },
    { key: 'valorGrahamTupiniquim', label: 'Graham base 5,5', types: stocks, criterion: 'Modelo experimental. Sem preferência pelo valor nominal.' },
    { key: 'precoTeto6', label: 'Preço teto (6%)', types: stocks, criterion: 'Estimativa por ação baseada nos dividendos passados; sem preferência pelo valor nominal.' },
    { key: 'precoTeto8', label: 'Preço teto (8%)', types: stocks, criterion: 'Estimativa por ação baseada nos dividendos passados; sem preferência pelo valor nominal.' },
];

const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function comparisonNumber(asset, key) {
    if (!asset) return null;
    if (key === 'rendimentoPercentual') {
        const supplied = finite(asset.ultimoRendimento?.percentual) ?? finite(asset.metrics?.rendimentoPercentual);
        if (supplied !== null) return supplied;
        const price = comparisonNumber(asset, 'cotacao');
        const dividend = comparisonNumber(asset, 'ultimoRendimento');
        return price > 0 && dividend !== null && dividend >= 0 ? dividend / price * 100 : null;
    }
    if (Object.hasOwn(asset[key] ?? {}, 'raw')) return finite(asset[key].raw);
    return finite(asset.metrics?.[key]);
}

function sameSegment(left, right) {
    const a = String(left.segmento?.value ?? '').trim().toLocaleLowerCase('pt-BR');
    const b = String(right.segmento?.value ?? '').trim().toLocaleLowerCase('pt-BR');
    return a !== '' && a !== '-' && a === b;
}

export function compareIndicator(row, left, right) {
    const neutral = reason => ({ winner: null, reason });
    if (!left || !right) return neutral('A comparação depende dos dados dos dois ativos.');
    if (left.tipo !== right.tipo) return neutral('Classes diferentes: sem preferência automática.');
    if (left.ticker === right.ticker) return neutral('Mesmo ativo: sem preferência.');
    const fundProfileCriterion = left.tipo === 'fiis' && ['pvp', 'dy'].includes(row.key);
    if (!row.direction && !fundProfileCriterion) return neutral('Indicador descritivo.');
    const a = comparisonNumber(left, row.key);
    const b = comparisonNumber(right, row.key);
    if (a === null || b === null) return neutral('Sem dois valores numéricos válidos.');
    if (Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b))) return neutral('Valores iguais: sem preferência.');
    if (fundProfileCriterion) {
        if (a <= 0 || b <= 0) return neutral('É necessário que os dois valores sejam positivos.');
        const goodA = left[row.key]?.class === 'good';
        const goodB = right[row.key]?.class === 'good';
        if (goodA !== goodB) return { winner: goodA ? 0 : 1, reason: 'Somente este FII está na faixa favorável do perfil selecionado.' };
        if (row.key === 'dy' && goodA && goodB) return { winner: a > b ? 0 : 1, reason: 'Maior DY entre dois FIIs na faixa favorável do perfil.' };
        return neutral(goodA ? 'Os dois estão na faixa favorável do perfil.' : 'Nenhum está na faixa favorável do perfil.');
    }
    if ((row.positive && (a <= 0 || b <= 0)) || (row.nonnegative && (a < 0 || b < 0)) || (row.percent && (a > 100 || b > 100))) {
        return neutral('Valores fora do domínio do critério: sem preferência automática.');
    }
    if (['roe', 'divLiqPatrimonio', 'divLiqEbitda'].includes(row.key) && !(comparisonNumber(left, 'vpa') > 0 && comparisonNumber(right, 'vpa') > 0)) {
        return neutral('É necessário patrimônio por ação positivo nos dois ativos.');
    }
    if (row.key === 'divLiqEbitda' && !(comparisonNumber(left, 'divLiqPatrimonio') > 0 && comparisonNumber(right, 'divLiqPatrimonio') > 0)) {
        return neutral('Não foi possível confirmar dívida líquida e EBITDA positivos nos dois ativos.');
    }
    if (row.key === 'vacancia' && !sameSegment(left, right)) return neutral('Vacância só é comparada automaticamente dentro do mesmo segmento.');
    return { winner: row.direction === 'higher' ? (a > b ? 0 : 1) : (a < b ? 0 : 1), reason: row.criterion };
}

function displayValue(asset, row) {
    if (!asset || !row.types.includes(asset.tipo)) return '—';
    if (row.key === 'rendimentoPercentual') {
        const value = comparisonNumber(asset, row.key);
        return value === null ? '—' : `${percentage.format(value)}%`;
    }
    const value = asset[row.key]?.value;
    return value === null || value === undefined || value === '' || value === '-' ? '—' : String(value);
}

function sourceLabel(asset) {
    if (!asset.metadata?.updatedAt) return 'Data da consulta indisponível';
    const date = new Date(asset.metadata?.updatedAt);
    return Number.isNaN(date.getTime()) ? 'Dados consultados' : `Consulta: ${date.toLocaleString('pt-BR')}`;
}

export function comparisonTableMarkup(results, selections, profile = 'moderado') {
    const assets = results.map(result => result?.data ?? null);
    const rows = COMPARISON_ROWS.filter(row => selections.some(selection => row.types.includes(selection.tipo)));
    const headers = selections.map((selection, index) => `<th scope="col"><span class="compare-ticker">${escapeHTML(selection.ticker)}</span><span class="compare-type">${typeNames[selection.tipo]}</span><small class="compare-source ${results[index]?.error ? 'compare-error' : ''}">${escapeHTML(results[index]?.error || (assets[index] ? sourceLabel(assets[index]) : 'Buscando indicadores…'))}</small></th>`).join('');
    const body = rows.map(row => {
        const decision = compareIndicator(row, ...assets);
        const reason = decision.winner === null && decision.reason !== 'Indicador descritivo.' ? `<small class="compare-row-status">${escapeHTML(decision.reason)}</small>` : '';
        const cells = assets.map((asset, index) => `<td${decision.winner === index ? ' class="compare-favorable"' : ''}><span class="compare-value">${escapeHTML(displayValue(asset, row))}</span>${decision.winner === index ? '<span class="compare-good-badge">✓ Favorável</span>' : ''}</td>`).join('');
        return `<tr data-indicator="${row.key}"><th scope="row"><span>${escapeHTML(row.label)}</span><small class="compare-criterion">${escapeHTML(row.criterion)}</small>${reason}</th>${cells}</tr>`;
    }).join('');
    return `<div class="compare-legend"><span class="compare-legend-dot" aria-hidden="true"></span><p>Verde: valor mais favorável <strong>pelo critério da linha</strong>. Perfil ${escapeHTML(profiles[profile] || profiles.moderado)} nas faixas de P/VP e DY dos FIIs.</p></div>${selections[0].tipo !== selections[1].tipo ? '<p class="compare-mixed-note">Você está comparando uma ação e um FII. Os dados aparecem lado a lado, sem preferência automática entre classes diferentes.</p>' : ''}<div class="compare-table-wrap"><table class="asset-compare-table"><caption class="sr-only">Comparação de indicadores de ${escapeHTML(selections[0].ticker)} e ${escapeHTML(selections[1].ticker)}. Verde identifica o valor favorável pelo critério descrito em cada linha.</caption><colgroup><col class="compare-name-col"><col><col></colgroup><thead><tr><th scope="col">Indicador<span class="compare-type">Como comparar</span></th>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderCompareTab(container, baseUrl, profile = 'moderado') {
    let controller;
    let generation = 0;
    let disposed = false;
    let selectedProfile = Object.hasOwn(profiles, profile) ? profile : 'moderado';
    container.innerHTML = `<section class="compare-intro"><span class="eyebrow">ATIVOS LADO A LADO</span><h2>Compare antes de decidir.</h2><p>Escolha dois ativos e entenda as diferenças indicador por indicador.</p></section><form class="compare-form insight-panel">${[0, 1].map(index => `<fieldset class="compare-asset-fields"><legend>Ativo ${index + 1}</legend><label for="compare-type-${index}">Tipo<select id="compare-type-${index}"><option value="acoes">Ação</option><option value="fiis">FII</option></select></label><label for="compare-ticker-${index}">Ticker<input id="compare-ticker-${index}" name="ticker${index}" required maxlength="6" placeholder="${index ? 'SANB4' : 'BBAS3'}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="compare-input-hint"></label></fieldset>`).join('')}<div class="compare-form-footer"><label for="compare-profile">Perfil para as faixas dos FIIs<select id="compare-profile">${Object.entries(profiles).map(([key, label]) => `<option value="${key}"${key === selectedProfile ? ' selected' : ''}>${label}</option>`).join('')}</select></label><button class="compare-submit" type="submit">Comparar ativos</button></div><p class="field-hint" id="compare-input-hint">Nos FIIs, você pode digitar MXRF: completamos para MXRF11.</p><p class="compare-form-error" role="alert"></p></form><p class="compare-disclaimer">Prefira ativos do mesmo setor ou segmento. O destaque verde compara apenas o critério informado; não existe um vencedor geral nem uma recomendação de compra.</p><div class="compare-results" aria-live="polite" aria-busy="false"><div class="message"><h3>Dois ativos, uma visão conjunta</h3><p>Preencha os tickers para ver os indicadores lado a lado.</p></div></div>`;
    const form = container.querySelector('.compare-form');
    const error = container.querySelector('.compare-form-error');
    const output = container.querySelector('.compare-results');
    const button = container.querySelector('.compare-submit');
    const inputs = [0, 1].map(index => container.querySelector(`#compare-ticker-${index}`));
    const types = [0, 1].map(index => container.querySelector(`#compare-type-${index}`));
    types.forEach((select, index) => select.addEventListener('change', () => { inputs[index].placeholder = select.value === 'fiis' ? (index ? 'HGLG11' : 'MXRF11') : (index ? 'SANB4' : 'BBAS3'); }));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const selections = types.map((type, index) => ({ tipo: type.value, ticker: normalizeTicker(inputs[index].value, type.value) }));
        error.textContent = '';
        if (selections.some(selection => !selection.ticker)) {
            error.textContent = 'Informe dois tickers válidos: por exemplo, BBAS3 para ação ou MXRF11 para FII.';
            return;
        }
        if (selections[0].ticker === selections[1].ticker && selections[0].tipo === selections[1].tipo) {
            error.textContent = 'Escolha dois ativos diferentes para comparar.';
            return;
        }
        controller?.abort();
        const currentGeneration = ++generation;
        inputs.forEach((input, index) => { input.value = selections[index].ticker; });
        selectedProfile = container.querySelector('#compare-profile').value;
        const requestProfile = selectedProfile;
        const requestController = new AbortController();
        controller = requestController;
        const timeout = setTimeout(() => requestController.abort(), 40_000);
        const results = [null, null];
        const active = () => !disposed && generation === currentGeneration;
        const redraw = () => { if (active()) output.innerHTML = comparisonTableMarkup(results, selections, requestProfile); };
        button.disabled = true;
        button.textContent = 'Comparando…';
        output.setAttribute('aria-busy', 'true');
        redraw();
        try {
            await Promise.all(selections.map(async (selection, index) => {
                try {
                    const response = await fetch(`${String(baseUrl).replace(/\/$/, '')}/api/${selection.tipo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: selection.ticker, perfil: requestProfile }), signal: requestController.signal });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar este ativo.');
                    if (data.ticker !== selection.ticker) throw new Error('A fonte retornou um ativo diferente do solicitado.');
                    results[index] = { data: { ...data, tipo: selection.tipo, perfil: requestProfile } };
                } catch (failure) {
                    results[index] = { error: requestController.signal.aborted ? 'Consulta demorou demais. Tente novamente.' : String(failure.message || 'Falha ao consultar este ativo.').slice(0, 240) };
                }
                redraw();
            }));
        } finally {
            clearTimeout(timeout);
            if (active()) {
                button.disabled = false;
                button.textContent = 'Comparar ativos';
                output.setAttribute('aria-busy', 'false');
            }
        }
    });
    return () => { disposed = true; generation += 1; controller?.abort(); };
}
