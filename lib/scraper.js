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

  // DIAGNÓSTICO TEMPORÁRIO — remova depois de descobrir o problema.
  // Isso aparece nos Logs do Vercel (dashboard do projeto > aba "Logs", ou `vercel logs`).
  console.log('--- DIAGNÓSTICO buscarAcao ---');
  console.log('Tamanho do HTML recebido:', html.length, 'caracteres');
  console.log('Contém "table-indicators"?', html.includes('table-indicators'));
  console.log('Contém "indicator-card"?', html.includes('indicator-card'));
  console.log('Contém "Margem Bruta"?', html.includes('Margem Bruta'));
  console.log('Contém "Dividend Yield"?', html.includes('Dividend Yield'));
  console.log('Primeiros 300 caracteres:', html.slice(0, 300));
  const $ = cheerio.load(html);
  const dict = {};

  // DIAGNÓSTICO TEMPORÁRIO — remova depois de descobrir o problema.
  // Isso aparece nos Logs do Vercel (dashboard do projeto > aba "Logs", ou `vercel logs`).
  console.log('--- DIAGNÓSTICO buscarAcao ---');
  console.log('Tamanho do HTML recebido:', html.length, 'caracteres');
  console.log('Contém "table-indicators"?', html.includes('table-indicators'));
  console.log('Contém "indicator-card"?', html.includes('indicator-card'));
  console.log('Contém "Margem Bruta"?', html.includes('Margem Bruta'));
  console.log('Contém "Dividend Yield"?', html.includes('Dividend Yield'));
  console.log('Primeiros 300 caracteres:', html.slice(0, 300));
  console.log('Cards com escopo #table-indicators:', $('#table-indicators .indicator-card').length);
  console.log('Cards sem escopo (.indicator-card solto):', $('.indicator-card').length);
  console.log('--- FIM DIAGNÓSTICO ---');

  // Cotação não vive dentro da caixa de indicadores — continua vindo do primeiro ".value" da
  // página, igual antes (essa parte não mudou no HTML que você mandou).
  dict['cotacao'] = parseForMath($('.value').first().text().trim());

  // Caixa real de indicadores fundamentalistas: cada indicador é um <article class="indicator-card">.
  // Ampliei o escopo pra pegar QUALQUER .indicator-card na página (não só dentro de
  // #table-indicators) — igual você já tinha feito, é uma rede mais larga e não tem desvantagem.
  // Quando existe o botão de histórico (.indicator-history-graph), o atributo data-current-value já
  // vem como número limpo (ponto decimal, sem % e sem separador de milhar, às vezes com mais casas
  // que o texto exibido). Usamos isso como fonte primária; caímos para o texto visível
  // (.indicator-card-value span) só quando o botão não existe (ex: Dív. Líq./Patrimônio).
  $('.indicator-card').each((_, el) => {
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

  // Se mesmo depois do fallback continuarmos só com a cotação (ou nada), a página recebida
  // provavelmente não é a página real do ativo — mais provável bloqueio/CAPTCHA do que ticker
  // errado (isso já foi tratado antes, via 404). Erra alto e claro em vez de devolver "-" em tudo.
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
