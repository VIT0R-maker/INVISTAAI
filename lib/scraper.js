// lib/scraper.js
import axios from 'axios';
import * as cheerio from 'cheerio';
import http from 'http';
import https from 'https';
import { normalizeKey, parseForMath, parseValorComSufixo } from './format.js';

// Pool de conexões para acelerar requisições na arquitetura Serverless (Vercel)
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const axiosConfig = {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Cache-Control': 'max-age=0',
  },
  timeout: 15000,
  httpAgent,
  httpsAgent,
  decompress: true,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function getCache(chave) {
  const item = cache.get(chave);
  if (item && Date.now() - item.timestamp < CACHE_TTL_MS) return item.data;
  return null;
}

function setCache(chave, data) {
  cache.set(chave, { data, timestamp: Date.now() });
}

async function fetchComRetry(url, tentativas = 2) {
  let ultimoErro;
  for (let i = 0; i <= tentativas; i++) {
    try {
      const { data } = await axios.get(url, axiosConfig);

      if (typeof data !== 'string' || data.length < 5000) {
        const erro = new Error('Resposta suspeita do investidor10 (página muito curta ou vazia) — possível bloqueio de IP.');
        erro.possivelBloqueio = true;
        throw erro;
      }

      return data;
    } catch (err) {
      ultimoErro = err;
      if (err.response?.status === 404) throw err;
      if (err.response?.status === 429 || err.response?.status === 403) {
        err.possivelBloqueio = true;
      }
      if (i < tentativas) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw ultimoErro;
}

export async function buscarAcao(ticker) {
  const chave = `acao:${ticker.toLowerCase()}`;
  const cacheado = getCache(chave);
  if (cacheado) return cacheado;

  const html = await fetchComRetry(`https://investidor10.com.br/acoes/${ticker.toLowerCase()}/`);
  const $ = cheerio.load(html);
  const dict = {};

  // Cotação principal do ativo
  dict['cotacao'] = parseForMath($('.value').first().text().trim());

  // Extrator Agressivo: Varre todos os cards de indicadores fundamentalistas
  $('.indicator-card').each((_, el) => {
    // Extrai o título, remove quebras de linha (\n) e tags escondidas
    let titulo = $(el).find('.indicator-card-title span').first().text().replace(/\n/g, '').trim();
    if (!titulo) return;

    const key = normalizeKey(titulo);
    
    // Busca prioritária pelo valor exato (data-current-value) do botão de histórico
    const dataValue = $(el).find('.indicator-history-graph').attr('data-current-value');

    if (dataValue !== undefined && dataValue !== '') {
      const num = parseFloat(dataValue);
      dict[key] = isNaN(num) ? null : num;
    } else {
      // Fallback para o texto visível na tela caso o botão não exista
      const textoValor = $(el).find('.indicator-card-value span').first().text().replace(/\n/g, '').trim();
      dict[key] = parseForMath(textoValor);
    }
  });

  // Fallback de Segurança para layouts antigos
  if (Object.keys(dict).length <= 1) {
    $('._card').each((_, el) => {
      const title = $(el).find('._card-header span').text().trim();
      let value = $(el).find('._card-body > div > span').first().text().trim();
      if (!value) value = $(el).find('._card-body > span').first().text().trim();
      if (title && value) dict[normalizeKey(title)] = parseForMath(value);
    });
    $('.cell').each((_, el) => {
      const title = $(el).find('span').first().text().trim();
      const value = $(el).find('.value span').first().text().trim();
      if (title && value) dict[normalizeKey(title)] = parseForMath(value);
    });
  }

  // Trava de sanidade contra falsos-positivos
  if (Object.keys(dict).length <= 1) {
    const erro = new Error('A página recebida do investidor10 não continha os indicadores esperados — possível bloqueio de IP ou mudança no site.');
    erro.possivelBloqueio = true;
    throw erro;
  }

  setCache(chave, dict);
  return dict;
}

export async function buscarFii(ticker) {
  const chave = `fii:${ticker.toLowerCase()}`;
  const cacheado = getCache(chave);
  if (cacheado) return cacheado;

  const html = await fetchComRetry(`https://investidor10.com.br/fiis/${ticker.toLowerCase()}/`);
  const $ = cheerio.load(html);

  const dictNum = {}; 
  const dictRaw = {}; 

  function addData(title, value) {
    if (!title || !value) return;
    const key = normalizeKey(title);
    const cleanValue = value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
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
    const value = $(el).find('.value').text().trim();
    addData(title, value);
  });

  const resultado = { dictNum, dictRaw };
  setCache(chave, resultado);
  return resultado;
}