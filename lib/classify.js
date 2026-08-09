// lib/classify.js
// Classifica cada indicador em 'good' | 'neutral' | 'bad', de acordo com um perfil de investidor
// (conservador/moderado/arrojado). Ações e FIIs usam duas abordagens diferentes porque a lógica
// que você descreveu para cada um é diferente:
//   - Ações: um único corte "bom até X, ruim a partir de Y" por indicador.
//   - FIIs: uma FAIXA de "bom" (min-max) + limites de "ruim" para fora dela — sua "Matriz
//     Ontológica" tem indicadores com faixa dos dois lados (P/VP, DY) e indicadores de corte
//     único (Liquidez, Valor Patrimonial, Vacância, Nº de Cotistas).

// ---------------------------------------------------------------------------
// AÇÕES
// invertido: false => quanto MENOR o valor, melhor (P/L, P/VP, dívida)
// invertido: true  => quanto MAIOR o valor, melhor (DY, ROE, margens, liquidez)
const PERFIS_ACOES = {
  conservador: {
    pl: { bom: 12, ruim: 18, invertido: false },
    pvp: { bom: 1.2, ruim: 2.5, invertido: false },
    dy: { bom: 8, ruim: 4, invertido: true },
    roe: { bom: 12, ruim: 6, invertido: true },
    margemLiquida: { bom: 12, ruim: 5, invertido: true },
    divLiqPatrimonio: { bom: 0.5, ruim: 1.5, invertido: false },
    liquidezCorrente: { bom: 1.5, ruim: 1, invertido: true },
  },
  moderado: {
    pl: { bom: 15, ruim: 20, invertido: false },
    pvp: { bom: 1.5, ruim: 3, invertido: false },
    dy: { bom: 6, ruim: 2, invertido: true },
    roe: { bom: 10, ruim: 5, invertido: true },
    margemLiquida: { bom: 10, ruim: 5, invertido: true },
    divLiqPatrimonio: { bom: 1, ruim: 2, invertido: false },
    liquidezCorrente: { bom: 1.2, ruim: 0.8, invertido: true },
  },
  arrojado: {
    pl: { bom: 25, ruim: 35, invertido: false },
    pvp: { bom: 3, ruim: 5, invertido: false },
    dy: { bom: 3, ruim: 0, invertido: true },
    roe: { bom: 15, ruim: 8, invertido: true },
    margemLiquida: { bom: 8, ruim: 3, invertido: true },
    divLiqPatrimonio: { bom: 2, ruim: 3.5, invertido: false },
    liquidezCorrente: { bom: 1, ruim: 0.6, invertido: true },
  },
};

export function perfisAcoesDisponiveis() {
  return Object.keys(PERFIS_ACOES);
}

export function classifyAcao(perfilNome, indicador, value) {
  if (value === null || value === undefined || isNaN(value)) return 'neutral';
  const perfil = PERFIS_ACOES[perfilNome] || PERFIS_ACOES.moderado;
  const regra = perfil[indicador];
  if (!regra) return 'neutral';

  if (regra.invertido) {
    if (value >= regra.bom) return 'good';
    if (value < regra.ruim) return 'bad';
    return 'neutral';
  }
  if (value > 0 && value <= regra.bom) return 'good';
  if (value > regra.ruim || value < 0) return 'bad';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// FIIs — Matriz Ontológica de Avaliação
//
// Cada indicador tem uma FAIXA de "bom" (bomMin/bomMax — um dos dois pode faltar quando a regra
// é só "> X" ou só "< X") e limites de "ruim" para fora dela (ruimAbaixoDe/ruimAcimaDe — também
// podem faltar de um lado, ex: P/VP do perfil arrojado só tem "ruim" para cima, não para baixo,
// porque desconto grande é justamente o que esse perfil busca). Tudo que não cai nem no "bom"
// nem no "ruim" é neutro — geralmente a zona de transição entre as duas faixas.

const PERFIS_FII = {
  conservador: {
    pvp: { bomMin: 0.90, bomMax: 1.00, ruimAbaixoDe: 0.85, ruimAcimaDe: 1.02 },
    dy: { bomMin: 8, bomMax: 11, ruimAbaixoDe: 7, ruimAcimaDe: 12 },
    liquidezDiaria: { bomMin: 2_000_000, ruimAbaixoDe: 1_000_000 },
    valorPatrimonial: { bomMin: 1_000_000_000, ruimAbaixoDe: 500_000_000 },
    vacancia: { bomMax: 5, ruimAcimaDe: 10 },
    numeroCotistas: { bomMin: 100_000, ruimAbaixoDe: 50_000 },
  },
  moderado: {
    pvp: { bomMin: 0.90, bomMax: 1.05, ruimAbaixoDe: 0.80, ruimAcimaDe: 1.07 },
    dy: { bomMin: 9, bomMax: 13, ruimAbaixoDe: 8, ruimAcimaDe: 14 },
    liquidezDiaria: { bomMin: 1_000_000, ruimAbaixoDe: 500_000 },
    valorPatrimonial: { bomMin: 500_000_000, ruimAbaixoDe: 200_000_000 },
    vacancia: { bomMax: 10, ruimAcimaDe: 15 },
    numeroCotistas: { bomMin: 50_000, ruimAbaixoDe: 20_000 },
  },
  arrojado: {
    pvp: { bomMin: 0.70, bomMax: 1.05, ruimAcimaDe: 1.10 },
    dy: { bomMin: 11, ruimAbaixoDe: 9 },
    liquidezDiaria: { bomMin: 300_000, ruimAbaixoDe: 100_000 },
    valorPatrimonial: { bomMin: 150_000_000, ruimAbaixoDe: 50_000_000 },
    vacancia: { bomMax: 15, ruimAcimaDe: 25 },
    numeroCotistas: { bomMin: 15_000, ruimAbaixoDe: 5_000 },
  },
};

export function perfisFiiDisponiveis() {
  return Object.keys(PERFIS_FII);
}

function classificarFaixa(value, regra) {
  if (value === null || value === undefined || isNaN(value)) return 'neutral';
  if (!regra) return 'neutral';
  const { bomMin, bomMax, ruimAbaixoDe, ruimAcimaDe } = regra;

  const dentroDoBom =
    (bomMin === undefined || value >= bomMin) &&
    (bomMax === undefined || value <= bomMax);
  if (dentroDoBom) return 'good';

  if (ruimAbaixoDe !== undefined && value < ruimAbaixoDe) return 'bad';
  if (ruimAcimaDe !== undefined && value > ruimAcimaDe) return 'bad';

  return 'neutral';
}

// Indicadores "sempre neutros" (descritivos, não entram na matriz): cotação, último rendimento,
// EBN, val. patr. por cota, segmento, mandato, tipo de fundo, tipo de gestão, taxa de admin.
export function classifyFii(perfilNome, indicador, value) {
  const perfil = PERFIS_FII[perfilNome] || PERFIS_FII.moderado;
  return classificarFaixa(value, perfil[indicador]);
}
