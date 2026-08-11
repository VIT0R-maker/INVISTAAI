// lib/scraper.js
// Toda a lógica de raspagem fica isolada aqui. Se um dia você quiser trocar a fonte de dados
// (ou adicionar uma segunda como fallback), é só criar outra função com a mesma assinatura
// (retorna { dictNum, dictRaw } ou similar) e trocar a chamada no server.js — o resto do app
// não precisa saber de onde os dados vieram.
//
// IMPORTANTE: os seletores da rota de FIIs são os MESMOS do seu código original, porque você
// confirmou que já estão calibrados e funcionando. A rota de Ações foi reescrita em cima do
// HTML real que você mandou (#table-indicators .indicator-card), que é uma estrutura diferente
// da usada antes (._card/.cell) — a antiga não batia mais com o site.

import axios from 'axios';
import * as cheerio from 'cheerio';
import http from 'http';
import https from 'https';
import { normalizeKey, parseForMath, parseValorComSufixo } from './format.js';

// keepAlive reaproveita a conexão TCP/TLS entre requisições ao mesmo host (investidor10.com.br)
// dentro da mesma instância "quente" da função serverless — evita repetir o handshake toda vez.
// Não é mágica (não ajuda numa instância fria), mas em requisições subsequentes na mesma warm
// instance economiza uns 100-300ms de handshake.
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
  decompress: true, // garante que a resposta comprimida (gzip/br) seja descomprimida automaticamente
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
      if (err.response?.status === 404) throw err; // não adianta tentar de novo
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

  // Cotação não vive dentro da caixa de indicadores — continua vindo do primeiro ".value" da
  // página, igual antes (essa parte não mudou no HTML que você mandou).
  dict['cotacao'] = parseForMath($('.value').first().text().trim());

  // Caixa real de indicadores fundamentalistas: cada indicador é um <article class="indicator-card">
  // dentro de #table-indicators, com o nome em .indicator-card-title span. Quando existe o botão
  // de histórico (.indicator-history-graph), o atributo data-current-value já vem como número limpo
  // (ponto decimal, sem % e sem separador de milhar, às vezes com mais casas que o texto exibido —
  // ex: Payout mostra "31,03%" na tela mas data-current-value="31.02520398039"). Usamos isso como
  // fonte primária por ser mais preciso e mais robusto a mudanças de formatação; caímos para o
  // texto visível (.indicator-card-value span) só quando o botão não existe (ex: Dív. Líq./Patrimônio).
  $('#table-indicators .indicator-card').each((_, el) => {
    const titulo = $(el).find('.indicator-card-title span').first().text().trim();
    if (!titulo) return;

    const key = normalizeKey(titulo);
    const dataValue = $(el).find('.indicator-history-graph').attr('data-current-value');

    if (dataValue !== undefined && dataValue !== '') {
      const num = parseFloat(dataValue);
      dict[key] = isNaN(num) ? null : num;
    } else {
      const textoValor = $(el).find('.indicator-card-value span').first().text().trim();
      dict[key] = parseForMath(textoValor);
    }
  });

  // Rede de segurança: se por algum motivo #table-indicators não existir na resposta (layout
  // antigo, página parcialmente carregada etc.), tenta os seletores genéricos como antes.
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
