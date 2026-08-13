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
    // Headers extras que um Chrome de verdade sempre manda — sem eles, alguns sites de
    // proteção anti-bot identificam a requisição como automatizada e servem uma versão
    // reduzida da página (só o essencial) em vez do conteúdo completo.
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'sec-ch-ua': '"Chromium";v="126", "Not.A/Brand";v="24", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
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

      // Se o investidor10 bloquear/limitar a requisição, muitas vezes ele ainda responde 200 OK,
      // só que com uma página de desafio/erro em vez do conteúdo real (isso é comum em faixas de
      // IP compartilhadas de provedores como Vercel/AWS). Sem essa checagem, o scraper não jogava
      // erro nenhum — só devolvia um objeto vazio, e todo indicador virava "-" silenciosamente,
      // parecendo um bug de seletor quando na verdade a página recebida nem era a de verdade.
      if (typeof data !== 'string' || data.length < 5000) {
        const erro = new Error('Resposta suspeita do investidor10 (página muito curta ou vazia) — possível bloqueio de IP.');
        erro.possivelBloqueio = true;
        throw erro;
      }

      return data;
    } catch (err) {
      ultimoErro = err;
      if (err.response?.status === 404) throw err; // não adianta tentar de novo
      if (err.response?.status === 429 || err.response?.status === 403) {
        err.possivelBloqueio = true; // sinaliza bloqueio explícito pra rota tratar diferente
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

  // Cotação principal
  dict['cotacao'] = parseForMath($('.value').first().text().trim());

  // Extrator Agressivo: Varre QUALQUER card de indicador na página e limpa quebras de linha
  $('.indicator-card').each((_, el) => {
    // Aqui está a mágica: o replace(/\n/g, '') limpa sujeiras invisíveis do HTML
    let titulo = $(el).find('.indicator-card-title span').first().text().replace(/\n/g, '').trim();
    if (!titulo) return;

    const key = normalizeKey(titulo);
    const dataValue = $(el).find('.indicator-history-graph').attr('data-current-value');

    if (dataValue !== undefined && dataValue !== '') {
      const num = parseFloat(dataValue);
      dict[key] = isNaN(num) ? null : num;
    } else {
      const textoValor = $(el).find('.indicator-card-value span').first().text().replace(/\n/g, '').trim();
      dict[key] = parseForMath(textoValor);
    }
  });

  // Fallback para layouts antigos
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

  // Se tudo falhar, alerta de bloqueio
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
