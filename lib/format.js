// lib/format.js
// Funções puras de parsing (texto raspado -> número) e formatação (número -> texto pt-BR).
// Não usamos toLocaleString('pt-BR') de propósito: nem todo ambiente Node vem com o pacote
// ICU completo, e um formatador manual garante "1.234,56" em qualquer instalação.

export function normalizeKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '');       // remove espaços/símbolos
}

export function parseForMath(str) {
  if (str === null || str === undefined) return null;
  if (typeof str === 'number') return isNaN(str) ? null : str;
  if (typeof str !== 'string') return null;
  if (str.includes('N/A') || str.trim() === '' || str.trim() === '-') return null;

  const match = str.match(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/);
  if (!match) return null;

  const cleaned = match[0].replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Alguns sites abreviam valores grandes (ex: "R$ 1,2 Bilhão", "R$ 850 mil"). Isso detecta o
// sufixo e aplica o multiplicador certo por cima do número já extraído por parseForMath — usado
// principalmente em Liquidez Diária, Valor Patrimonial e Nº de Cotistas de FIIs, que entram numa
// faixa de comparação (ex: "> R$ 1 Bilhão") e dariam um resultado errado se o sufixo fosse ignorado.
const SUFIXOS_GRANDEZA = [
  { regex: /bilh(ao|ão|oes|ões)|\bbi\b/i, mult: 1_000_000_000 },
  { regex: /milh(ao|ão|oes|ões)|\bmi\b/i, mult: 1_000_000 },
  { regex: /\bmil\b/i, mult: 1_000 },
];

export function parseValorComSufixo(str) {
  const base = parseForMath(str);
  if (base === null || typeof str !== 'string') return base;
  for (const { regex, mult } of SUFIXOS_GRANDEZA) {
    if (regex.test(str)) return base * mult;
  }
  return base;
}

function toBRNumber(num, casas = 2) {
  const sign = num < 0 ? '-' : '';
  const fixed = Math.abs(num).toFixed(casas);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== undefined ? `${sign}${withThousands},${decPart}` : `${sign}${withThousands}`;
}

export function formatCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return `R$ ${toBRNumber(num, 2)}`;
}

export function formatPercent(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return `${toBRNumber(num, 2)}%`;
}

export function formNum(num, casas = 2) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return toBRNumber(num, casas);
}

// % que a cotação está abaixo (positivo = margem de segurança) ou acima (negativo) do valor justo
export function margemSeguranca(cotacao, valorJusto) {
  if (!(cotacao > 0) || !(valorJusto > 0)) return null;
  return ((valorJusto - cotacao) / valorJusto) * 100;
}

// Parser defensivo para campos "grandes" (Liquidez Diária, Valor Patrimonial, Nº de Cotistas).
// Esses campos agora entram em contas de classificação (perfil de FII), então precisam do valor
// numérico REAL, não só do que parseForMath pegaria. O problema: eu não consegui confirmar ao vivo
// se o Investidor10 mostra "R$ 234.567.890" por extenso ou abreviado ("R$ 234,5 mi"/"R$ 1,2 bi").
// Essa função cobre os dois casos: se não achar nenhum sufixo, devolve o número puro (extenso);
// se achar "mil"/"mi"/"milhões"/"bi"/"bilhões", multiplica pela escala certa.
function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function parseValorGrande(str) {
  if (!str || typeof str !== 'string') return null;
  const numeroBase = parseForMath(str);
  if (numeroBase === null) return null;

  const s = stripAccents(str.toLowerCase());
  if (/\bbilh(ao|oes)\b|\bbi\b/.test(s)) return numeroBase * 1_000_000_000;
  if (/\bmilh(ao|oes)\b|\bmi\b/.test(s)) return numeroBase * 1_000_000;
  if (/\bmil\b(?!h)/.test(s)) return numeroBase * 1_000;
  return numeroBase;
}
