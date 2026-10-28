// Shared by the browser and API so every FII entry point uses the same symbol.
export function normalizeTicker(value, tipo = 'acoes') {
    if (typeof value !== 'string' || !['acoes', 'fiis'].includes(tipo)) return null;
    const ticker = value.trim().toUpperCase();
    if (tipo === 'fiis') {
        if (/^[A-Z][A-Z0-9]{3}$/.test(ticker)) return `${ticker}11`;
        return /^[A-Z][A-Z0-9]{3}11$/.test(ticker) ? ticker : null;
    }
    return /^[A-Z][A-Z0-9]{3}\d{1,2}$/.test(ticker) ? ticker : null;
}
