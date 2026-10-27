// Meta Selic, SGS 432, em pontos percentuais ao ano (fonte: Banco Central).
import axios from 'axios';
import https from 'node:https';

const BCB_SELIC_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 4 });
let cache = null;
let pending = null;
let nextRetryAt = 0;

function snapshot(stale = false) {
  return {
    valor: cache?.valor ?? null,
    dataReferencia: cache?.dataReferencia ?? null,
    updatedAt: cache ? new Date(cache.timestamp).toISOString() : null,
    stale: !!cache && stale,
    unavailable: !cache,
    source: BCB_SELIC_URL,
  };
}

export async function getSelicInfo() {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) return snapshot();
  if (now < nextRetryAt) return snapshot(true);
  if (pending) return pending;
  pending = (async () => {
    try {
      const { data } = await axios.get(BCB_SELIC_URL, { timeout: 4000, httpsAgent });
      const bruto = data?.[0]?.valor;
      const valor = typeof bruto === 'string' ? Number(bruto.replace(',', '.')) : bruto;
      if (!Number.isFinite(valor) || valor <= 0) throw new Error('Selic inválida');
      cache = { valor, dataReferencia: data[0].data ?? null, timestamp: Date.now() };
      nextRetryAt = 0;
      return snapshot();
    } catch {
      nextRetryAt = Date.now() + RETRY_AFTER_MS;
      // Nunca apresentar uma taxa fixa como se tivesse sido consultada no BCB.
      // O último valor válido pode ser usado, mas fica explicitamente marcado como antigo.
      return snapshot(true);
    } finally {
      pending = null;
    }
  })();
  return pending;
}

// Compatibilidade com consumidores que precisam apenas do número.
export async function getSelicAtual() {
  return (await getSelicInfo()).valor;
}
