import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { getSelicAtual } from './lib/bcb.js';
import { buscarAcao, buscarFii } from './lib/scraper.js';
import { grahamNumero, grahamRevisado, grahamTupiniquim, precoTetoBazin } from './lib/valuation.js';
import { classifyAcao, classifyFii, perfisDisponiveis } from './lib/classify.js';
import { formatCurrency, formatPercent, formNum, margemSeguranca } from './lib/format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Monta o payload padrão de um card de "valor justo": preço formatado, classe good/bad
// (comparando com a cotação) e a margem de segurança em % para mostrar como subtítulo no card.
function cardValorJusto(cotacao, valorJusto) {
  if (valorJusto === null || valorJusto === undefined || isNaN(valorJusto)) {
    return { value: '-', class: 'neutral', margem: null };
  }
  const cls = cotacao && cotacao < valorJusto ? 'good' : 'bad';
  return {
    value: formatCurrency(valorJusto),
    class: cls,
    margem: margemSeguranca(cotacao, valorJusto),
  };
}

function tratarErro(res, error, ticker, tipo) {
  console.error(`Erro ${tipo}:`, error.message);
  const status = error.response?.status === 404 ? 404 : 502;
  const msg =
    status === 404
      ? `${tipo === 'FII' ? 'Fundo' : 'Ticker'} "${ticker.toUpperCase()}" não encontrado.`
      : 'Não foi possível consultar os dados agora (o site de origem pode estar instável). Tente novamente em instantes.';
  res.status(status).json({ error: msg });
}

app.get('/api/perfis', (_req, res) => {
  res.json({ perfis: perfisDisponiveis() });
});

app.post('/api/acoes', async (req, res) => {
  const { ticker, perfil = 'moderado' } = req.body;
  if (!ticker) return res.status(400).json({ error: 'Ticker não informado.' });

  try {
    const [dict, selicAtual] = await Promise.all([buscarAcao(ticker), getSelicAtual()]);

    const cotacao = dict['cotacao'];
    const pl = dict['pl'];
    const pvp = dict['pvp'];
    const dy = dict['dy'];
    const payout = dict['payout'];
    const roe = dict['roe'];
    const roic = dict['roic'];
    const roa = dict['roa'];
    const margemBruta = dict['margembruta'];
    const margemEbitda = dict['margemebtida'] ?? dict['margemebitda'];
    const margemLiquida = dict['margemliquida'];
    const divLiqPatrimonio = dict['dividaliquidapatrimonio'];
    const divLiqEbitda = dict['dividaliquidaebitda'];
    const liquidezCorrente = dict['liquidezcorrente'];
    const lpa = dict['lpa'];
    const vpa = dict['vpa'];
    const cagr5a = dict['cagrlucros5anos'];
    const giroAtivos = dict['giroativos'];

    const valorGrahamPadrao = grahamNumero(lpa, vpa);
    const valorGrahamRev = grahamRevisado(lpa, cagr5a, selicAtual);
    const valorGrahamTupiniquim = grahamTupiniquim(lpa, cagr5a, selicAtual);
    const precoTeto6 = precoTetoBazin(dy, cotacao, 0.06);
    const precoTeto8 = precoTetoBazin(dy, cotacao, 0.08);

    res.json({
      ticker: ticker.toUpperCase(),
      perfil,
      selicUtilizada: selicAtual,

      cotacao: { value: formatCurrency(cotacao), class: 'neutral' },

      valorGrahamPadrao: cardValorJusto(cotacao, valorGrahamPadrao),
      valorGrahamRev: cardValorJusto(cotacao, valorGrahamRev),
      valorGrahamTupiniquim: cardValorJusto(cotacao, valorGrahamTupiniquim),
      precoTeto6: cardValorJusto(cotacao, precoTeto6),
      precoTeto8: cardValorJusto(cotacao, precoTeto8),

      pl: { value: formNum(pl), class: classifyAcao(perfil, 'pl', pl) },
      pvp: { value: formNum(pvp), class: classifyAcao(perfil, 'pvp', pvp) },
      dy: { value: formatPercent(dy), class: classifyAcao(perfil, 'dy', dy) },
      payout: { value: formatPercent(payout), class: 'neutral' },

      roe: { value: formatPercent(roe), class: classifyAcao(perfil, 'roe', roe) },
      roic: { value: formatPercent(roic), class: 'neutral' },
      roa: { value: formatPercent(roa), class: 'neutral' },
      margemBruta: { value: formatPercent(margemBruta), class: 'neutral' },
      margemEbitda: { value: formatPercent(margemEbitda), class: 'neutral' },
      margemLiquida: { value: formatPercent(margemLiquida), class: classifyAcao(perfil, 'margemLiquida', margemLiquida) },

      divLiqPatrimonio: { value: formNum(divLiqPatrimonio), class: classifyAcao(perfil, 'divLiqPatrimonio', divLiqPatrimonio) },
      divLiqEbitda: { value: formNum(divLiqEbitda), class: 'neutral' },
      liquidezCorrente: { value: formNum(liquidezCorrente), class: classifyAcao(perfil, 'liquidezCorrente', liquidezCorrente) },

      lpa: { value: formNum(lpa), class: 'neutral' },
      vpa: { value: formNum(vpa), class: 'neutral' },
      cagr5a: { value: formatPercent(cagr5a), class: 'neutral' },
      giroAtivos: { value: formNum(giroAtivos), class: 'neutral' },
    });
  } catch (error) {
    tratarErro(res, error, ticker, 'Ação');
  }
});

app.post('/api/fiis', async (req, res) => {
  const { ticker } = req.body;
  if (!ticker) return res.status(400).json({ error: 'Ticker não informado.' });

  try {
    const { dictNum, dictRaw } = await buscarFii(ticker);

    const cotacao = dictNum['cotacao'];
    const ultimoRendimento = dictNum['ultimorendimento'];
    const dyMath = dictNum['dividendyield'] ?? dictNum['dy12m'] ?? dictNum['dy'];
    const pvpMath = dictNum['pvp'];
    const vacanciaMath = dictNum['vacancia'];

    let ebn = '-';
    let ebnNum = null;
    let vn = '-';
    if (cotacao > 0 && ultimoRendimento > 0) {
      ebnNum = Math.ceil(cotacao / ultimoRendimento);
      ebn = String(ebnNum);
      vn = formatCurrency(ebnNum * cotacao);
    }

    res.json({
      ticker: ticker.toUpperCase(),

      cotacao: { value: dictRaw['cotacao'] || formatCurrency(cotacao), class: 'neutral' },
      pvp: { value: dictRaw['pvp'] || formNum(pvpMath), class: classifyFii('pvp', pvpMath) },
      dy: {
        value: dictRaw['dividendyield'] || dictRaw['dy12m'] || formatPercent(dyMath),
        class: classifyFii('dy', dyMath),
      },

      ebn: { value: ebn, class: ebnNum ? 'good' : 'neutral' },
      vn: { value: vn, class: 'neutral' },
      ultimoRendimento: { value: dictRaw['ultimorendimento'] || '-', class: 'neutral' },

      liquidezDiaria: { value: dictRaw['liquidezdiaria'] || '-', class: 'neutral' },
      variacao12m: { value: dictRaw['variacao12m'] || '-', class: 'neutral' },
      vpa: { value: dictRaw['valpatrimonialpcota'] || dictRaw['valorpatrimonialpcota'] || '-', class: 'neutral' },
      valorPatrimonial: { value: dictRaw['valorpatrimonial'] || '-', class: 'neutral' },
      vacancia: { value: dictRaw['vacancia'] || '-', class: classifyFii('vacancia', vacanciaMath) },
      numeroCotistas: { value: dictRaw['numerodecotistas'] || '-', class: 'neutral' },

      segmento: { value: dictRaw['segmento'] || '-', class: 'neutral' },
      mandato: { value: dictRaw['mandato'] || '-', class: 'neutral' },
      tipoFundo: { value: dictRaw['tipodefundo'] || '-', class: 'neutral' },
      tipoGestao: { value: dictRaw['tipodegestao'] || '-', class: 'neutral' },
      taxaAdministracao: { value: dictRaw['taxadeadministracao'] || '-', class: 'neutral' },
    });
  } catch (error) {
    tratarErro(res, error, ticker, 'FII');
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});
