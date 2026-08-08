// lib/classify.js
// Classifica cada indicador em 'good' | 'neutral' | 'bad'.
// Para ações, os limiares mudam de acordo com o PERFIL escolhido (conservador/moderado/arrojado) —
// essa é a "métrica de visão" que você pediu para poder alternar, igual à ideia da página antiga.

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

export function perfisDisponiveis() {
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

export function classifyFii(indicador, value) {
  if (value === null || value === undefined || isNaN(value)) return 'neutral';
  switch (indicador) {
    case 'pvp':
      return value > 0 && value <= 1.05 ? 'good' : 'bad';
    case 'dy':
      return value >= 8 ? 'good' : value < 6 ? 'bad' : 'neutral';
    case 'vacancia':
      return value <= 5 ? 'good' : value >= 15 ? 'bad' : 'neutral';
    default:
      return 'neutral';
  }
}
