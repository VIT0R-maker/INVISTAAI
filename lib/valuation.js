// lib/valuation.js
// Fórmulas de valor justo. Todas retornam `null` quando não há dado suficiente para calcular
// (LPA negativo, VPA ausente, etc.) — o front-end trata `null` como "-".

const Y1_GRAHAM_HISTORICO = 4.4; // yield médio de títulos AAA nos EUA nos anos 1960 (constante original de Graham)
const BASE_GRAHAM_PADRAO = 8.5;  // P/L "justo" para uma empresa sem nenhum crescimento, segundo Graham
const BASE_GRAHAM_TUPINIQUIM = 5.5; // base mais conservadora usada por analistas BR em cenário de juros altos

// Graham Número: V = √(22,5 × LPA × VPA) — a versão clássica de "O Investidor Inteligente"
export function grahamNumero(lpa, vpa) {
  if (!(lpa > 0) || !(vpa > 0)) return null;
  return Math.sqrt(22.5 * lpa * vpa);
}

// Graham Revisado: V = LPA × (8,5 + 2g) × (Y1 / Y), com Y = Selic atual no lugar do yield AAA
// g entra em pontos percentuais (ex: 7 representa 7% a.a.), igual à convenção original de Graham.
export function grahamRevisado(lpa, cagr5aPercent, selicAtual) {
  if (!(lpa > 0) || !(selicAtual > 0)) return null;
  const g = cagr5aPercent || 0;
  return lpa * (BASE_GRAHAM_PADRAO + 2 * g) * (Y1_GRAHAM_HISTORICO / selicAtual);
}

// Graham "Tupiniquim": mesma estrutura da fórmula revisada, mas com a base trocada de 8,5 para 5,5.
//
// NOTA DE INTERPRETAÇÃO (importante, leia): sua descrição também mencionava "dividir pelo patamar
// da taxa livre de risco atual". Testei essa leitura ao pé da letra (dividir direto por Selic, sem
// a razão Y1/Y) e o resultado explode ou despenca dependendo de usar Selic em % ou decimal — não fica
// estável. Por isso implementei mantendo a mesma razão Y1/Y da fórmula revisada, só trocando a base
// para 5,5 (que já é, sozinha, uma correção conservadora relevante). Se o que você tinha em mente era
// literalmente "sem Y1, só dividir por Selic", é uma troca de uma linha — te mostro onde no README.
export function grahamTupiniquim(lpa, cagr5aPercent, selicAtual) {
  if (!(lpa > 0) || !(selicAtual > 0)) return null;
  const g = cagr5aPercent || 0;
  return lpa * (BASE_GRAHAM_TUPINIQUIM + 2 * g) * (Y1_GRAHAM_HISTORICO / selicAtual);
}

// Preço-Teto de Décio Bazin: dividendo por ação (estimado a partir do DY atual) / yield mínimo exigido
export function precoTetoBazin(dyPercent, cotacao, yieldMinimo) {
  if (!(dyPercent > 0) || !(cotacao > 0)) return null;
  const dividendoPorAcao = (dyPercent / 100) * cotacao;
  return dividendoPorAcao / yieldMinimo;
}
