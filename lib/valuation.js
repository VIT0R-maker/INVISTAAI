// Estimativas de valuation, não previsões de cotação ou recomendações de compra.
// As quatro fórmulas existentes preservam o comportamento original do projeto.
// Validação de disponibilidade e apresentação de resultados fica no consumidor.
const Y1_GRAHAM_HISTORICO = 4.4;
const positivo = value => Number.isFinite(value) && value > 0;
const resultadoPositivo = value => positivo(value) ? value : null;

// Número de Graham: √(22,5 × LPA × VPA).
export function grahamNumero(lpa, vpa) {
  if (!(lpa > 0) || !(vpa > 0)) return null;
  return Math.sqrt(22.5 * lpa * vpa);
}

// Adaptação: usa CAGR histórico de 5 anos como proxy de crescimento esperado e a
// Meta Selic no lugar do yield de títulos AAA da fórmula. Não é a fórmula original.
// Crescimento e Selic entram em pontos percentuais: 7 significa 7% a.a.
export function grahamRevisado(lpa, cagr5aPercent, selicAtual) {
  if (!(lpa > 0) || !(selicAtual > 0)) return null;
  const g = cagr5aPercent || 0;
  return lpa * (8.5 + 2 * g) * (Y1_GRAHAM_HISTORICO / selicAtual);
}

// Cenário próprio do sistema: a base 5,5 substitui 8,5. Não existe aqui comprovação
// de que esta variante represente um método padronizado de Graham ou um preço justo.
export function grahamTupiniquim(lpa, cagr5aPercent, selicAtual) {
  if (!(lpa > 0) || !(selicAtual > 0)) return null;
  const g = cagr5aPercent || 0;
  return lpa * (5.5 + 2 * g) * (Y1_GRAHAM_HISTORICO / selicAtual);
}

// Proxy de teto por dividendos: (DY de 12 meses / 100 × cotação) / yield exigido.
// Usa proventos passados implícitos no DY, sem normalizar eventos extraordinários;
// não substitui a análise de consistência dos dividendos do método Bazin.
export function precoTetoBazin(dyPercent, cotacao, yieldMinimo) {
  if (!(dyPercent > 0) || !(cotacao > 0)) return null;
  const dividendoPorAcao = (dyPercent / 100) * cotacao;
  return dividendoPorAcao / yieldMinimo;
}

// Gordon: D0 × (1 + g) / (r − g). O dividendoAnual é D0 (base anual por ação),
// não D1. Taxas são percentuais anuais escolhidos pelo usuário: 12 significa 12%.
// Aplicável apenas sob hipótese explícita de dividendos sustentáveis crescendo a
// uma taxa constante; r deve ser maior que g. Não extrapolar CAGR de lucros.
// Referência: https://pages.stern.nyu.edu/adamodar/New_Home_Page/lectures/ddm.html
export function precoJustoGordon(dividendoAnual, taxaRetornoPercent, crescimentoPercent) {
  if (!positivo(dividendoAnual) || !positivo(taxaRetornoPercent) || !Number.isFinite(crescimentoPercent)) return null;
  if (crescimentoPercent <= -100 || taxaRetornoPercent <= crescimentoPercent) return null;
  const r = taxaRetornoPercent / 100;
  const g = crescimentoPercent / 100;
  return resultadoPositivo(dividendoAnual * (1 + g) / (r - g));
}

// Menor número inteiro de cotas cujo último provento repetido pagaria uma cota.
// Não prevê o próximo pagamento: preço e provento constantes são hipóteses.
export function calcularBolaDeNeve(cotacao, ultimoRendimento) {
  if (!positivo(cotacao) || !positivo(ultimoRendimento)) return null;
  const razao = cotacao / ultimoRendimento;
  // Corrige somente ruído binário perto de um inteiro (ex.: 8,8 / 0,1).
  const cotas = Math.ceil(razao - Number.EPSILON * Math.max(1, razao) * 4);
  if (!Number.isSafeInteger(cotas) || cotas <= 0) return null;
  const valor = cotas * cotacao;
  const renda = cotas * ultimoRendimento;
  if (!Number.isFinite(valor) || !Number.isFinite(renda)) return null;
  return {
    cotas,
    valorNecessario: Math.round((valor + Number.EPSILON) * 100) / 100,
    rendimentoEstimado: Math.round((renda + Number.EPSILON) * 100) / 100,
  };
}
