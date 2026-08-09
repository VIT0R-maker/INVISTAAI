// lib/scraper.js
// Toda a lógica de raspagem fica isolada aqui. Se um dia você quiser trocar a fonte de dados
// (ou adicionar uma segunda como fallback), é só criar outra função com a mesma assinatura
// (retorna { dictNum, dictRaw } ou similar) e trocar a chamada no server.js — o resto do app
// não precisa saber de onde os dados vieram.
//
// IMPORTANTE: os seletores da rota de FIIs são os MESMOS do seu código original, porque você
// confirmou que já estão calibrados e funcionando. Não toquei na extração em si, só na robustez
// em volta dela (retry, cache, tratamento de erro).

import axios from 'axios';
import * as cheerio from 'cheerio';
import { normalizeKey, parseForMath, parseValorComSufixo } from './format.js';

const axiosConfig = {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    Connection: 'keep-alive',
    'Cache-Control': 'max-age=0',
  },
  timeout: 15000,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min: evita bater no site de novo se o usuário pesquisar o mesmo ticker em seguida
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
      return data;
    } catch (err) {
      ultimoErro = err;
      if (err.response?.status === 404) throw err; // ativo não existe, tentar de novo não ajuda
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

  dict['cotacao'] = parseForMath($('.value').first().text().trim());

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

  setCache(chave, dict);
  return dict;
}

export async function buscarFii(ticker) {
  const chave = `fii:${ticker.toLowerCase()}`;
  const cacheado = getCache(chave);
  if (cacheado) return cacheado;

  const html = await fetchComRetry(`https://investidor10.com.br/fiis/${ticker.toLowerCase()}/`);
  const $ = cheerio.load(html);

  const dictNum = {}; // valores numéricos, prontos para contas (EBN, VN, classificação)
  const dictRaw = {}; // texto original, para exibir na tela exatamente como o site mostra

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
