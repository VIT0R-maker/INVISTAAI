// Parsing do texto pt-BR da fonte e formatação sem depender de ICU.
export function normalizeKey(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

export function parseForMath(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || /\bN\/?A\b/i.test(value)) return null;
  const str = value.replace(/\u2212/g, '-').trim();
  // Consume todos os dígitos: a expressão antiga truncava 1234 para 123.
  const match = str.match(/-?\d+(?:\.\d+)*(?:,\d+)?/);
  if (!match) return null;
  let raw = match[0];
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export function parseValorComSufixo(str) {
  const base = parseForMath(str);
  if (base === null || typeof str !== 'string') return base;
  const s = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let mult = 1;
  if (/\bbilh(?:ao|oes)\b|\bbi\b|\bb\b/.test(s)) mult = 1_000_000_000;
  else if (/\bmilh(?:ao|oes)\b|\bmi\b|\bm\b/.test(s)) mult = 1_000_000;
  else if (/\bmil\b|\bk\b/.test(s)) mult = 1_000;
  const result = base * mult;
  return Number.isFinite(result) ? result : null;
}

export const parseValorGrande = parseValorComSufixo;

function toBRNumber(num, casas = 2) {
  const sign = num < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(num).toFixed(casas).split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== undefined ? `${sign}${withThousands},${decPart}` : `${sign}${withThousands}`;
}

export function formatCurrency(num) {
  return Number.isFinite(num) ? `R$ ${toBRNumber(num, 2)}` : '-';
}

export function formatPercent(num) {
  return Number.isFinite(num) ? `${toBRNumber(num, 2)}%` : '-';
}

export function formNum(num, casas = 2) {
  return Number.isFinite(num) ? toBRNumber(num, casas) : '-';
}

// Distância percentual em relação ao valor estimado; não é o upside sobre a cotação.
export function margemSeguranca(cotacao, valorJusto) {
  if (!Number.isFinite(cotacao) || !Number.isFinite(valorJusto) || cotacao <= 0 || valorJusto <= 0) return null;
  return ((valorJusto - cotacao) / valorJusto) * 100;
}
