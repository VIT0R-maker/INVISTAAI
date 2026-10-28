import { buscarAcao, buscarFii, getScraperMetadata } from './scraper.js';
import { getSelicInfo } from './bcb.js';
import { grahamNumero, grahamRevisado, grahamTupiniquim, precoTetoBazin, calcularBolaDeNeve } from './valuation.js';
import { classifyAcao, classifyFii } from './classify.js';
import { formatCurrency, formatPercent, formNum, margemSeguranca } from './format.js';
import { normalizeTicker } from '../public/tickers.js';

const finite = value => Number.isFinite(value) ? value : null;
const card = (value, format = formNum, cls = 'neutral') => ({ raw: finite(value), value: format(finite(value)), class: cls });

export function validateAnalysisInput(tipo, ticker, perfil = 'moderado') {
  const normalized = normalizeTicker(ticker, tipo);
  if (!normalized || !['conservador', 'moderado', 'arrojado'].includes(perfil)) {
    const error = new Error('Informe um ticker válido (ex.: PETR4 ou HCTR11), o tipo de ativo e um perfil válido.');
    error.status = 400;
    throw error;
  }
  return { tipo, ticker: normalized, perfil };
}

export function valuationCard(cotacao, value) {
  const raw = Number.isFinite(value) && value > 0 ? value : null;
  const cls = raw && Number.isFinite(cotacao) && cotacao > 0 ? (cotacao < raw ? 'good' : cotacao > raw ? 'bad' : 'neutral') : 'neutral';
  return { ...card(raw, formatCurrency, cls), margem: margemSeguranca(cotacao, raw) };
}

export function buildStockAnalysis(dict, selic, ticker, perfil, metadata = {}) {
  const fields = {
    cotacao: ['cotacao', formatCurrency], pl: ['pl'], pvp: ['pvp'], dy: ['dividendyield', formatPercent, 'dy'],
    payout: ['payout', formatPercent], roe: ['roe', formatPercent], roic: ['roic', formatPercent], roa: ['roa', formatPercent],
    margemBruta: ['margembruta', formatPercent], margemEbitda: ['margemebitda', formatPercent, 'margemebtida'], margemLiquida: ['margemliquida', formatPercent],
    divLiqPatrimonio: ['dividaliquidapatrimonio'], divLiqEbitda: ['dividaliquidaebitda'], liquidezCorrente: ['liquidezcorrente'],
    lpa: ['lpa'], vpa: ['vpa'], cagr5a: ['cagrlucros5anos', formatPercent], giroAtivos: ['giroativos'],
  };
  const result = { ticker, tipo: 'acoes', perfil, selicUtilizada: selic.valor, metrics: {}, metadata: { ...metadata, selic } };
  const classified = new Set(['pl', 'pvp', 'dy', 'roe', 'margemLiquida', 'divLiqPatrimonio', 'liquidezCorrente']);
  for (const [name, [key, formatter, fallback]] of Object.entries(fields)) {
    const value = finite(dict[key] ?? dict[fallback]);
    result.metrics[name] = value;
    const uninformative = (['pl', 'pvp'].includes(name) && value === 0) || (name === 'divLiqPatrimonio' && !(dict.vpa > 0));
    result[name] = card(value, formatter, classified.has(name) && !uninformative ? classifyAcao(perfil, name, value) : 'neutral');
  }
  const { cotacao, lpa, vpa, cagr5a, dy } = result.metrics;
  const valuations = {
    valorGrahamPadrao: grahamNumero(lpa, vpa),
    valorGrahamRev: Number.isFinite(cagr5a) ? grahamRevisado(lpa, cagr5a, selic.valor) : null,
    valorGrahamTupiniquim: Number.isFinite(cagr5a) ? grahamTupiniquim(lpa, cagr5a, selic.valor) : null,
    precoTeto6: precoTetoBazin(dy, cotacao, 0.06),
    precoTeto8: precoTetoBazin(dy, cotacao, 0.08),
  };
  for (const [key, value] of Object.entries(valuations)) result[key] = valuationCard(cotacao, value);
  result.methodology = {
    grahamNumero: 'Raiz de (22,5 × LPA × VPA); exige lucro e patrimônio positivos.',
    grahamRevisado: 'LPA × (8,5 + 2g) × 4,4 / Selic. Adaptação: Selic substitui o yield AAA; CAGR histórico de lucros em pontos percentuais é um cenário, não previsão.',
    grahamTupiniquim: 'Heurística própria: mesma adaptação, com base 5,5. Não é uma fórmula canônica nem uma recomendação.',
    bazin: 'Proxy de dividendos dos últimos 12 meses = DY / 100 × cotação; teto = dividendos / yield-alvo (6% ou 8%). Não usa média de vários anos nem garante renda futura.',
    margem: '(valor estimado − cotação) / valor estimado × 100; não equivale ao potencial de valorização.',
  };
  return result;
}

export function buildFiiAnalysis({ dictNum, dictRaw }, ticker, perfil, metadata = {}) {
  const numericFields = {
    cotacao: ['cotacao', formatCurrency], ultimoRendimento: ['ultimorendimento', formatCurrency],
    variacao12m: ['variacao12m', formatPercent], vpa: ['valpatrimonialpcota', formatCurrency, 'valorpatrimonialpcota'],
    pvp: ['pvp'], dy: ['dividendyield', formatPercent, 'dy12m', 'dy'], liquidezDiaria: ['liquidezdiaria', formatCurrency],
    valorPatrimonial: ['valorpatrimonial', formatCurrency], vacancia: ['vacancia', formatPercent], numeroCotistas: ['numerodecotistas'],
  };
  const result = { ticker, tipo: 'fiis', perfil, metrics: {}, metadata };
  for (const [name, [key, formatter, ...fallbacks]] of Object.entries(numericFields)) {
    const keys = [key, ...fallbacks];
    const value = finite(keys.map(k => dictNum[k]).find(Number.isFinite));
    result.metrics[name] = value;
    result[name] = card(value, formatter, classifyFii(perfil, name, value));
  }
  for (const [name, key] of Object.entries({ segmento: 'segmento', mandato: 'mandato', tipoFundo: 'tipodefundo', tipoGestao: 'tipodegestao', taxaAdministracao: 'taxadeadministracao' })) {
    result[name] = { value: String(dictRaw[key] || '-').slice(0, 500), class: 'neutral' };
  }
  const snowball = calcularBolaDeNeve(result.metrics.cotacao, result.metrics.ultimoRendimento);
  const { cotacao, ultimoRendimento } = result.metrics;
  const rendimentoPercentual = cotacao > 0 && ultimoRendimento !== null && ultimoRendimento >= 0
    ? finite(ultimoRendimento / cotacao * 100) : null;
  result.metrics.rendimentoPercentual = rendimentoPercentual;
  result.ultimoRendimento.percentual = rendimentoPercentual;
  result.ultimoRendimento.percentualValue = formatPercent(rendimentoPercentual);
  result.ebn = card(snowball?.cotas, n => n === null ? '-' : String(n));
  result.vn = card(snowball?.valorNecessario, formatCurrency);
  result.simulation = snowball ? { cotas: snowball.cotas, aporte: snowball.valorNecessario, rendaMensal: snowball.rendimentoEstimado } : null;
  result.methodology = {
    rendimentoPercentual: 'Último rendimento por cota / cotação consultada × 100. Refere-se a um pagamento; não é o DY de 12 meses nem uma previsão.',
    bolaDeNeve: 'Cotas = arredondar para cima (cotação / último rendimento). Aporte = cotas × cotação. Renda estimada por pagamento = cotas × último rendimento.',
    limitacoes: 'Simulação com cotas inteiras, preço e rendimento constantes, sem custos. Não confirma o pagamento do próximo mês nem elegibilidade: depende da data-com e de anúncio do fundo. VPA não é preço justo garantido.',
  };
  return result;
}

export async function getAnalysis(tipo, ticker, perfil = 'moderado') {
  ({ tipo, ticker, perfil } = validateAnalysisInput(tipo, ticker, perfil));
  if (tipo === 'acoes') {
    const [dict, selic] = await Promise.all([buscarAcao(ticker), getSelicInfo()]);
    return buildStockAnalysis(dict, selic, ticker, perfil, getScraperMetadata(tipo, ticker));
  }
  const data = await buscarFii(ticker);
  return buildFiiAnalysis(data, ticker, perfil, getScraperMetadata(tipo, ticker));
}
