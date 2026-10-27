const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
export const money = value => brl.format(value);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function cardNumber(card) {
    if (typeof card === 'number') return Number.isFinite(card) ? card : null;
    for (const key of ['numeric', 'raw', 'number']) {
        if (typeof card?.[key] === 'number' && Number.isFinite(card[key])) return card[key];
    }
    // Compatibility with older API deployments; new responses carry numeric values.
    const text = String(card?.value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    return text && Number.isFinite(Number(text)) ? Number(text) : null;
}

function chartRow(label, value, max, cls = '', suffix = '') {
    return `<div class="comparison-row ${cls}"><div class="comparison-label"><span>${escapeHTML(label)}</span><strong>${value === null ? 'Indisponível' : money(value)}</strong></div><div class="bar-track"><span class="bar-fill" style="width:${value === null ? 0 : Math.max(0, Math.min(100, value / max * 100))}%"></span></div>${suffix ? `<small>${escapeHTML(suffix)}</small>` : ''}</div>`;
}

export function priceComparison(data) {
    const current = cardNumber(data.cotacao);
    const rows = [
        ['Cotação atual', current, 'current'],
        ['Graham clássico', cardNumber(data.valorGrahamPadrao), ''],
        ['Graham adaptado à Selic', cardNumber(data.valorGrahamRev), ''],
        ['Graham base 5,5 (experimental)', cardNumber(data.valorGrahamTupiniquim), ''],
        ['Preço teto · yield de 6%', cardNumber(data.precoTeto6), 'ceiling'],
        ['Preço teto · yield de 8%', cardNumber(data.precoTeto8), 'ceiling'],
    ];
    const max = Math.max(1, ...rows.map(([, value]) => value ?? 0));
    return `<section class="insight-panel" aria-labelledby="price-chart-title"><div class="panel-heading"><div><span class="eyebrow">PREÇO E VALOR</span><h2 id="price-chart-title">A cotação em perspectiva</h2></div><span class="quiet-badge">Valores por ação</span></div><p class="panel-description">Compare o preço de mercado com as estimativas de cada método.</p><div class="comparison-chart">${rows.map(([label, value, cls]) => chartRow(label, value, max, cls, value > 0 && current > 0 && !cls.includes('current') ? `${Math.abs((value - current) / value * 100).toFixed(1).replace('.', ',')}% ${current <= value ? 'abaixo' : 'acima'} da estimativa` : '')).join('')}</div><details class="method-note"><summary>Como interpretar estes valores</summary><p>Graham clássico: √(22,5 × LPA × VPA). As versões com crescimento usam o CAGR histórico de 5 anos como hipótese e a Selic como adaptação; não são previsões. A versão com base 5,5 é experimental.</p><p>Bazin: dividendos estimados dos últimos 12 meses ÷ retorno exigido (6% ou 8%). Dividendos futuros podem mudar. Valores ausentes ou não aplicáveis não recebem uma barra.</p></details></section>`;
}

// Cotas são inteiras. As razões usam escala decimal para evitar ceil(62.00000000001).
export function simulateIncome(price, dividend, value, mode = 'quotas') {
    if (![price, dividend, value].every(Number.isFinite) || price <= 0 || dividend <= 0 || value < 0) return null;
    const scale = 1e8;
    const priceUnits = Math.round(price * scale);
    const dividendUnits = Math.round(dividend * scale);
    if (!priceUnits || !dividendUnits) return null;
    const quotas = mode === 'budget' ? Math.floor(Math.round(value * scale) / priceUnits)
        : mode === 'income' ? Math.ceil(Math.round(value * scale) / dividendUnits) : Math.floor(value);
    if (!Number.isSafeInteger(quotas) || quotas > 10000000) return null;
    const invested = Math.round(quotas * price * 100) / 100;
    const income = Math.round(quotas * dividend * 100) / 100;
    return { quotas, invested, income, remaining: mode === 'budget' ? Math.max(0, Math.round((value - invested) * 100) / 100) : 0, target: Math.ceil(priceUnits / dividendUnits) };
}

export function snowballMarkup(data) {
    const price = data.metrics?.cotacao ?? data.numeros?.cotacao ?? cardNumber(data.cotacao);
    const dividend = data.metrics?.ultimoRendimento ?? data.numeros?.ultimoRendimento ?? cardNumber(data.ultimoRendimento);
    if (!(price > 0) || !(dividend > 0)) {
        return '<section class="insight-panel"><span class="eyebrow">SIMULADOR DE RENDA</span><h2>Efeito bola de neve</h2><p class="panel-description">Precisamos de uma cotação e de um último rendimento positivos para simular este fundo. A fonte não forneceu esses dados nesta consulta.</p></section>';
    }
    return `<section class="insight-panel snowball" aria-labelledby="snowball-title" data-price="${price}" data-dividend="${dividend}"><div class="panel-heading"><div><span class="eyebrow">SIMULADOR DE RENDA</span><h2 id="snowball-title">Seu próximo passo na bola de neve</h2></div><button class="text-button reset-snowball" type="button">Voltar à meta</button></div><p class="panel-description">Ajuste qualquer campo. As cotas, o aporte e a renda estimada se atualizam juntos.</p><div class="simulation-inputs"><label>Cotas<input id="sim-quotas" type="number" inputmode="numeric" min="0" max="10000000" step="1" aria-describedby="sim-input-hint"></label><label>Aporte disponível (R$)<input id="sim-budget" type="number" inputmode="decimal" min="0" step="0.01" aria-describedby="sim-input-hint"></label><label>Renda mensal desejada (R$)<input id="sim-income" type="number" inputmode="decimal" min="0" step="0.01" aria-describedby="sim-input-hint"></label></div><p id="sim-input-hint" class="field-hint">O aporte compra cotas inteiras; a meta de renda arredonda as cotas para cima.</p><p class="simulation-error" role="status"></p><label class="range-label" for="sim-range">Explorar quantidade de cotas <span class="range-value"></span></label><input id="sim-range" type="range" min="0" step="1" aria-label="Quantidade de cotas no simulador"><div class="simulation-summary" aria-live="polite" aria-atomic="true"><div><span>Investimento em cotas</span><strong class="sim-invested"></strong></div><div class="income-highlight"><span>Provento mensal estimado</span><strong class="sim-earned"></strong></div><div><span>Cotas compradas</span><strong class="sim-count"></strong></div></div><div class="snowball-chart" role="img"></div><p class="simulation-conclusion"></p><p class="simulation-leftover"></p><div class="estimate-note"><strong>Uma simulação, não um pagamento confirmado.</strong> Usa a cotação de ${money(price)} e repete o último rendimento de ${money(dividend)} por cota. Para o próximo mês, preço, provento e data de direito ao rendimento podem mudar. Não inclui taxas ou impostos.</div></section>`;
}

export function mountSnowball(container) {
    const section = container.querySelector('.snowball');
    if (!section) return;
    const price = Number(section.dataset.price), dividend = Number(section.dataset.dividend);
    const initial = simulateIncome(price, dividend, 0);
    const inputs = { quotas: section.querySelector('#sim-quotas'), budget: section.querySelector('#sim-budget'), income: section.querySelector('#sim-income') };
    const slider = section.querySelector('#sim-range');
    const error = section.querySelector('.simulation-error');
    function update(value, mode = 'quotas', editing = null) {
        const result = simulateIncome(price, dividend, value, mode);
        if (!result) {
            error.textContent = 'Digite um valor válido, equivalente a até 10 milhões de cotas.';
            return;
        }
        error.textContent = '';
        const { quotas, invested, income, remaining, target } = result;
        if (editing !== 'quotas') inputs.quotas.value = quotas;
        if (editing !== 'budget') inputs.budget.value = invested.toFixed(2);
        if (editing !== 'income') inputs.income.value = income.toFixed(2);
        slider.max = Math.min(10000000, Math.max(target * 3, quotas * 2, 100));
        slider.value = quotas;
        section.querySelector('.range-value').textContent = `${integer.format(quotas)} cotas`;
        section.querySelector('.sim-invested').textContent = money(invested);
        section.querySelector('.sim-earned').textContent = money(income);
        section.querySelector('.sim-count').textContent = integer.format(quotas);
        const chart = section.querySelector('.snowball-chart');
        const max = Math.max(price, income, 1);
        chart.innerHTML = chartRow('Provento estimado para o próximo mês', income, max, 'income') + chartRow('Valor de 1 nova cota, ao preço consultado', price, max, 'current');
        chart.setAttribute('aria-label', `${quotas} cotas custam ${money(invested)} e geram ${money(income)} estimados por mês; uma nova cota custa ${money(price)}.`);
        section.querySelector('.simulation-conclusion').textContent = quotas >= target ? `Meta alcançada neste cenário: ${integer.format(quotas)} cotas gerariam renda suficiente para comprar ${integer.format(Math.floor(Math.round(quotas * dividend * 1e8) / Math.round(price * 1e8)))} nova(s) cota(s).` : `Faltam ${integer.format(target - quotas)} cotas para a renda estimada comprar 1 nova cota. Meta: ${integer.format(target)} cotas (${money(target * price)}).`;
        section.querySelector('.simulation-leftover').textContent = mode === 'budget' ? `Saldo do aporte após comprar cotas inteiras: ${money(remaining)}.` : mode === 'income' ? `Meta de ${money(value)}: necessárias ${integer.format(quotas)} cotas para atingir pelo menos esse valor, antes do arredondamento monetário.` : '';
    }
    for (const [mode, input] of Object.entries(inputs)) {
        input.addEventListener('input', () => {
            if (input.value === '' || !input.validity.valid) { error.textContent = 'Preencha um valor não negativo. A quantidade de cotas deve ser inteira.'; return; }
            update(input.valueAsNumber, mode, mode);
        });
    }
    slider.addEventListener('input', () => update(slider.valueAsNumber));
    section.querySelector('.reset-snowball').addEventListener('click', () => update(initial.target));
    update(initial.target);
}

export function calculateGordon(dividend, returnRate, growthRate) {
    if (![dividend, returnRate, growthRate].every(Number.isFinite) || dividend <= 0 || returnRate <= 0 || growthRate <= -100 || returnRate <= growthRate) return null;
    const value = dividend * (1 + growthRate / 100) / (returnRate / 100 - growthRate / 100);
    return Number.isFinite(value) && value > 0 ? value : null;
}

export function gordonMarkup(data) {
    const price = cardNumber(data.cotacao), dy = cardNumber(data.dy);
    if (!(price > 0) || !(dy > 0)) return '';
    const dividend = price * dy / 100;
    return `<details class="insight-panel gordon-panel" data-price="${price}" data-dividend="${dividend}"><summary><span class="eyebrow">CENÁRIO OPCIONAL</span><strong>Explore dividendos com o modelo de Gordon</strong></summary><p class="panel-description">Modelo para dividendos sustentáveis com crescimento constante. As taxas iniciais de 12% e 3% são apenas exemplos; escolha suas próprias hipóteses.</p><div class="simulation-inputs"><label>Dividendo anual base (R$)<input id="gordon-dividend" type="number" min="0.0001" step="any" value="${dividend.toFixed(4)}"></label><label>Retorno exigido (% a.a.)<input id="gordon-return" type="number" min="0.01" step="any" value="12"></label><label>Crescimento perpétuo (% a.a.)<input id="gordon-growth" type="number" min="-99.99" step="any" value="3"></label></div><p class="field-hint">Dividendo inicial estimado: DY dos últimos 12 meses × cotação. Não inclui ajustes por pagamentos extraordinários.</p><p class="gordon-error" role="status"></p><div class="gordon-chart" aria-live="polite"></div><p class="estimate-note">Fórmula: D₀ × (1 + g) ÷ (r − g). O retorno exigido deve superar o crescimento perpétuo. Pequenas diferenças entre as taxas podem produzir valores muito altos. Não se aplica a todo ativo e não altera os outros métodos do relatório. <a href="https://pages.stern.nyu.edu/adamodar/New_Home_Page/lectures/ddm.html" target="_blank" rel="noopener noreferrer">Entenda o modelo</a>.</p></details>`;
}

export function mountGordon(container) {
    const section = container.querySelector('.gordon-panel');
    if (!section) return;
    const inputs = ['dividend', 'return', 'growth'].map(key => section.querySelector(`#gordon-${key}`));
    const price = Number(section.dataset.price);
    const chart = section.querySelector('.gordon-chart');
    const error = section.querySelector('.gordon-error');
    function update() {
        const value = calculateGordon(...inputs.map(input => input.value === '' ? NaN : input.valueAsNumber));
        if (value === null) {
            error.textContent = 'Use dividendo positivo e retorno exigido maior que o crescimento; o crescimento deve superar −100%.';
            chart.replaceChildren();
            return;
        }
        error.textContent = '';
        const max = Math.max(price, value);
        chart.innerHTML = chartRow('Cotação consultada', price, max, 'current') + chartRow('Valor no cenário de Gordon', value, max);
    }
    inputs.forEach(input => input.addEventListener('input', update));
    update();
}
