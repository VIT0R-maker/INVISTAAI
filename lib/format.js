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
