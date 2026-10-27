import axios from 'axios';
import * as cheerio from 'cheerio';
import http from 'node:http';
import https from 'node:https';
import { normalizeKey, parseForMath, parseValorComSufixo } from './format.js';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 12 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 12 });
const axiosConfig = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'sec-ch-ua': '"Chromium";v="126", "Not.A/Brand";v="24", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  },
  timeout: 6500,
  maxContentLength: 10 * 1024 * 1024,
  maxRedirects: 3,
  httpAgent,
  httpsAgent,
  decompress: true,
};
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map();
const pending = new Map();

export function normalizarTicker(ticker) {
  if (typeof ticker !== 'string' || !/^[A-Z][A-Z0-9]{3}\d{1,2}$/i.test(ticker.trim())) {
    const error = new Error('Ticker inválido. Use um código como PETR4 ou HCTR11.');
    error.status = 400;
    throw error;
  }
  return ticker.trim().toUpperCase();
}

function cacheKey(tipo, ticker) {
  return `${tipo}:${normalizarTicker(ticker)}`;
}

export function getScraperMetadata(tipo, ticker) {
  const group = tipo === 'acoes' || tipo === 'acao' ? 'acoes' : 'fiis';
  const item = cache.get(cacheKey(group, ticker));
  return {
    source: `https://investidor10.com.br/${group}/${normalizarTicker(ticker).toLowerCase()}/`,
    updatedAt: item ? new Date(item.timestamp).toISOString() : null,
    cacheAgeMs: item ? Math.max(0, Date.now() - item.timestamp) : null,
    cacheTtlMs: CACHE_TTL_MS,
  };
}

async function withCache(tipo, ticker, parse) {
  const code = normalizarTicker(ticker);
  const key = cacheKey(tipo, code);
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL_MS) return item.data;
  if (item) cache.delete(key);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const html = await fetchComRetry(`https://investidor10.com.br/${tipo}/${code.toLowerCase()}/`);
    const data = parse(html);
    // Limita a memória de instâncias quentes e evita guardar respostas inválidas.
    for (const [cachedKey, value] of cache) {
      if (Date.now() - value.timestamp >= CACHE_TTL_MS) cache.delete(cachedKey);
    }
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { data, timestamp: Date.now() });
    return data;
  })();
  pending.set(key, task);
  try { return await task; }
  finally { pending.delete(key); }
}

async function fetchComRetry(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await axios.get(url, axiosConfig);
      if (typeof data !== 'string' || /<title[^>]*>\s*(?:Just a moment|Access denied|Attention Required)/i.test(data)) {
        const error = new Error('A fonte de indicadores não retornou uma página válida.');
        error.possivelBloqueio = true;
        throw error;
      }
      return data;
    } catch (error) {
      const status = error.response?.status;
      if (status === 403 || status === 429) error.possivelBloqueio = true;
      // Bloqueios/404 não se resolvem repetindo a consulta. Retry só em falhas transitórias.
      const transient = !error.possivelBloqueio && (!status || status >= 500);
      if (attempt === 1 || !transient) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}

function invalidPage() {
  const error = new Error('A fonte não retornou cotação e indicadores válidos; a página pode ter mudado ou estar indisponível.');
  error.possivelBloqueio = true;
  return error;
}

export function parseAcaoHtml(html) {
  const $ = cheerio.load(html);
  const dict = { cotacao: parseForMath($('.value').first().text().trim()) };
  $('.indicator-card').each((_, el) => {
    const titulo = $(el).find('.indicator-card-title span').first().text().replace(/\n/g, '').trim();
    if (!titulo) return;
    const key = normalizeKey(titulo);
    const raw = $(el).find('.indicator-history-graph').attr('data-current-value');
    // Atributos de dados do HTML usam decimal com ponto; texto visível usa pt-BR.
    const num = raw !== undefined && raw.trim() !== '' ? Number(raw) : NaN;
    const visible = $(el).find('.indicator-card-value span').first().text().trim();
    dict[key] = Number.isFinite(num) ? num : parseForMath(visible);
  });
  // Também complementa campos ausentes quando a fonte mistura os dois layouts.
  $('._card').each((_, el) => {
    const title = $(el).find('._card-header span').text().trim();
    let value = $(el).find('._card-body > div > span').first().text().trim();
    if (!value) value = $(el).find('._card-body > span').first().text().trim();
    const key = normalizeKey(title);
    if (title && value && dict[key] == null) dict[key] = parseForMath(value);
  });
  $('.cell').each((_, el) => {
    const title = $(el).find('.name, .title').first().text().trim() || $(el).find('span').first().text().trim();
    const value = $(el).find('.value').first().text().trim();
    const key = normalizeKey(title);
    if (title && value && dict[key] == null) dict[key] = parseForMath(value);
  });
  if (!(dict.cotacao > 0) || Object.entries(dict).filter(([, value]) => Number.isFinite(value)).length < 2) throw invalidPage();
  return dict;
}

export function parseFiiHtml(html) {
  const $ = cheerio.load(html);
  const dictNum = {};
  const dictRaw = {};
  function addData(title, value) {
    if (!title || !value) return;
    const key = normalizeKey(title);
    const cleanValue = value.replace(/\s+/g, ' ').trim();
    if (!cleanValue) return;
    dictNum[key] = parseValorComSufixo(cleanValue);
    dictRaw[key] = cleanValue;
  }
  addData('cotacao', $('.value').first().text().trim());
  $('._card').each((_, el) => {
    const spanHeader = $(el).find('._card-header span');
    const title = spanHeader.attr('title') || spanHeader.text().trim();
    let value = $(el).find('._card-body > div > span').first().text().trim();
    if (!value) value = $(el).find('._card-body .value').text().trim();
    if (!value) value = $(el).find('._card-body > span').first().text().trim();
    if (!value) value = $(el).find('._card-body').text().trim();
    addData(title, value);
  });
  $('.cell').each((_, el) => {
    const title = $(el).find('.name').text().trim() || $(el).find('.title').text().trim();
    addData(title, $(el).find('.value').text().trim());
  });
  $('.indicator-card').each((_, el) => {
    const title = $(el).find('.indicator-card-title span').first().text().trim();
    const value = $(el).find('.indicator-card-value span').first().text().trim();
    if (dictNum[normalizeKey(title)] == null) addData(title, value);
  });
  if (!(dictNum.cotacao > 0) || Object.entries(dictNum).filter(([, value]) => Number.isFinite(value)).length < 2) throw invalidPage();
  return { dictNum, dictRaw };
}

export async function buscarAcao(ticker) {
  return withCache('acoes', ticker, parseAcaoHtml);
}

export async function buscarFii(ticker) {
  return withCache('fiis', ticker, parseFiiHtml);
}
