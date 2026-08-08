// lib/bcb.js
// Busca a Meta Selic (definida pelo Copom) na API pública do Banco Central do Brasil (SGS).
// Documentação: https://dadosabertos.bcb.gov.br  |  Série 432 = "Taxa de juros - Meta Selic definida pelo Copom"
// É uma API oficial, gratuita, sem necessidade de token — ideal para substituir o valor fixo
// que existia no código antigo (SELIC_ATUAL = 10.75).

import axios from 'axios';

const BCB_SELIC_URL =
  'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';

// Usado apenas se a API do BCB estiver fora do ar E ainda não tivermos nenhum valor em cache.
// Atualize esse número de tempos em tempos (ou simplesmente ignore-o — ele só é um último recurso).
const SELIC_FALLBACK = 15.0;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas: a Selic não muda todo dia, não faz sentido bater na API a cada busca

let cache = { valor: null, timestamp: 0 };

export async function getSelicAtual() {
  const agora = Date.now();
  if (cache.valor !== null && agora - cache.timestamp < CACHE_TTL_MS) {
    return cache.valor;
  }

  try {
    const { data } = await axios.get(BCB_SELIC_URL, { timeout: 8000 });
    const bruto = data?.[0]?.valor;
    const valor = typeof bruto === 'string' ? parseFloat(bruto.replace(',', '.')) : bruto;

    if (typeof valor === 'number' && !isNaN(valor) && valor > 0) {
      cache = { valor, timestamp: agora };
      return valor;
    }
    throw new Error('Resposta do BCB veio sem um valor numérico válido.');
  } catch (err) {
    console.warn(
      '⚠️  Não foi possível consultar a Selic no Banco Central agora:',
      err.message,
      '— usando',
      cache.valor ?? SELIC_FALLBACK
    );
    return cache.valor ?? SELIC_FALLBACK;
  }
}
