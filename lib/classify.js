// lib/classify.js
// Motor de Classificação Invista+ (IA Quântica)
// Classifica cada indicador em 'good' | 'neutral' | 'bad', de acordo com um perfil de investidor.

// ---------------------------------------------------------------------------
// AÇÕES — Matriz Ontológica de Avaliação
// ---------------------------------------------------------------------------
export const PERFIS_ACOES = {
  conservador: {
    pl: { bomMin: 0, bomMax: 10, ruimAbaixoDe: 0, ruimAcimaDe: 15 },
    pvp: { bomMin: 0, bomMax: 1.5, ruimAbaixoDe: 0, ruimAcimaDe: 2.0 },
    dy: { bomMin: 6, ruimAbaixoDe: 4 },
    roe: { bomMin: 10, ruimAbaixoDe: 5 },
    roic: { bomMin: 10, ruimAbaixoDe: 5 },
    margemLiquida: { bomMin: 10, ruimAbaixoDe: 5 },
    divLiqPatrimonio: { bomMax: 0.5, ruimAcimaDe: 0.8 },
    divLiqEbitda: { bomMax: 2.0, ruimAcimaDe: 2.5 },
    liquidezCorrente: { bomMin: 1.5, ruimAbaixoDe: 1.0 },
    payout: { bomMin: 60, ruimAbaixoDe: 40 },
    cagr5a: { bomMin: 5, ruimAbaixoDe: 0 }
  },
  moderado: {
    pl: { bomMin: 0, bomMax: 15, ruimAbaixoDe: 0, ruimAcimaDe: 20 },
    pvp: { bomMin: 0, bomMax: 2.0, ruimAbaixoDe: 0, ruimAcimaDe: 3.0 },
    dy: { bomMin: 5, ruimAbaixoDe: 3 },
    roe: { bomMin: 10, ruimAbaixoDe: 5 },
    roic: { bomMin: 10, ruimAbaixoDe: 5 },
    margemLiquida: { bomMin: 10, ruimAbaixoDe: 5 },
    divLiqPatrimonio: { bomMax: 0.8, ruimAcimaDe: 1.2 },
    divLiqEbitda: { bomMax: 2.5, ruimAcimaDe: 3.5 },
    liquidezCorrente: { bomMin: 1.2, ruimAbaixoDe: 0.8 },
    payout: { bomMin: 40, bomMax: 70, ruimAbaixoDe: 20, ruimAcimaDe: 90 },
    cagr5a: { bomMin: 10, ruimAbaixoDe: 5 }
  },
  arrojado: {
    pl: { bomMin: 0, bomMax: 25, ruimAbaixoDe: 0, ruimAcimaDe: 35 },
    pvp: { bomMin: 0, bomMax: 3.0, ruimAbaixoDe: 0, ruimAcimaDe: 5.0 },
    // DY é omitido (sempre neutro, pois o foco é crescimento)
    roe: { bomMin: 15, ruimAbaixoDe: 8 },
    roic: { bomMin: 15, ruimAbaixoDe: 8 },
    margemLiquida: { bomMin: 8, ruimAbaixoDe: 3 },
    divLiqPatrimonio: { bomMax: 1.5, ruimAcimaDe: 2.5 },
    divLiqEbitda: { bomMax: 3.0, ruimAcimaDe: 4.0 },
    liquidezCorrente: { bomMin: 1.0, ruimAbaixoDe: 0.6 },
    payout: { bomMax: 40, ruimAcimaDe: 70 }, // Exige reinvestimento do lucro
    cagr5a: { bomMin: 15, ruimAbaixoDe: 10 }
  }
};

export function perfisAcoesDisponiveis() {
  return Object.keys(PERFIS_ACOES);
}

export function classifyAcao(perfilNome, indicador, value) {
  if (value === null || value === undefined || isNaN(value)) return 'neutral';
  const perfil = PERFIS_ACOES[perfilNome] || PERFIS_ACOES.moderado;
  return classificarFaixa(value, perfil[indicador]);
}

// ---------------------------------------------------------------------------
// FIIs — Matriz Ontológica de Avaliação
// ---------------------------------------------------------------------------
const PERFIS_FII = {
  conservador: {
    pvp: { bomMin: 0.90, bomMax: 1.00, ruimAbaixoDe: 0.80, ruimAcimaDe: 1.05 },
    dy: { bomMin: 8, bomMax: 11, ruimAbaixoDe: 6, ruimAcimaDe: 14.99 },
    liquidezDiaria: { bomMin: 1_000_000, ruimAbaixoDe: 500_000 },
    valorPatrimonial: { bomMin: 1_000_000_000, ruimAbaixoDe: 500_000_000 },
    vacancia: { bomMax: 5, ruimAcimaDe: 10 },
    numeroCotistas: { bomMin: 100_000, ruimAbaixoDe: 50_000 },
  },
  moderado: {
    pvp: { bomMin: 0.90, bomMax: 1.05, ruimAbaixoDe: 0.80, ruimAcimaDe: 1.10 },
    dy: { bomMin: 9, bomMax: 13, ruimAbaixoDe: 7, ruimAcimaDe: 14.99 },
    liquidezDiaria: { bomMin: 500_000, ruimAbaixoDe: 200_000 },
    valorPatrimonial: { bomMin: 500_000_000, ruimAbaixoDe: 200_000_000 },
    vacancia: { bomMax: 10, ruimAcimaDe: 15 },
    numeroCotistas: { bomMin: 50_000, ruimAbaixoDe: 20_000 },
  },
  arrojado: {
    pvp: { bomMin: 0.70, bomMax: 1.05, ruimAbaixoDe: 0.60, ruimAcimaDe: 1.10 },
    dy: { bomMin: 11, bomMax: 14.99, ruimAbaixoDe: 9, ruimAcimaDe: 14.99 },
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

export function classifyFii(perfilNome, indicador, value) {
  const perfil = PERFIS_FII[perfilNome] || PERFIS_FII.moderado;
  return classificarFaixa(value, perfil[indicador]);
}