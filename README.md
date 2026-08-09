# Scanner de Ativos Fundamentalista — v2

## Como rodar

```bash
npm install
npm start
```

Abra `http://localhost:3000`. A aba **FIIs** é a que você pediu para testar primeiro — os
seletores de raspagem dela são exatamente os que você já validou no código antigo, só que
agora com retry automático, cache de 5 minutos por ticker e mensagens de erro mais claras.

## O que mudou desde a v1

- **Selic dinâmica**: em vez do `SELIC_ATUAL = 10.75` fixo, o servidor consulta a API do
  Banco Central (SGS, série 432 — Meta Selic) a cada 6 horas e usa isso nas fórmulas de
  Graham Revisado e Tupiniquim. É gratuita, oficial, sem chave. Ver `lib/bcb.js`.
- **Graham Tupiniquim** implementado (`lib/valuation.js`) — ver nota de interpretação abaixo.
- **Perfil de avaliação** (Conservador / Moderado / Arrojado) para Ações — muda os limiares
  de "bom/neutro/ruim" de P/L, P/VP, DY, ROE, margem líquida, dívida e liquidez. Ver
  `lib/classify.js`. O front manda o perfil escolhido no corpo do POST `/api/acoes`.
- **Margem de segurança** exibida como legenda em cada card de valor justo (ex: "12,4% abaixo
  do valor justo"), calculada a partir da própria cotação e do valor justo já retornados.
- **Robustez do scraper**: retry com backoff (2 tentativas), cache em memória de 5 min por
  ticker, erros 404 tratados separado de erros de rede/timeout.
- **Código modularizado** em `lib/` (bcb, scraper, valuation, classify, format) — trocar ou
  adicionar uma fonte de dados no futuro não deve exigir mexer nas rotas.
- Formatação numérica pt-BR (separador de milhar) sem depender de ICU do Node.

## Nota de interpretação: fórmula "Tupiniquim"

Sua descrição tinha duas partes: (1) trocar o 8,5 por 5,5, e (2) "dividir pelo patamar da
taxa livre de risco atual". Testei a leitura mais literal da parte 2 (dividir direto por
Selic, sem a razão Y1/Y) e o resultado fica instável — dependendo de usar Selic em % ou em
decimal, o valor justo ou explode (P/L de 200x) ou fica bem baixo demais (P/L de 2x). Por
isso implementei mantendo a mesma estrutura da fórmula revisada (`Y1/Y`, com Y1=4,4), só
trocando a base para 5,5:

```
V = LPA × (5,5 + 2g) × (4,4 / Selic)
```

Se o que você tinha em mente era literalmente remover a razão Y1/Y e dividir puro por Selic,
é uma mudança pequena em `grahamTupiniquim()` — troque a última parte por `/ selicAtual`
(Selic em decimal, ex: `10.75/100`) e ajuste a constante para calibrar a escala. Me manda um
exemplo numérico de referência (LPA, g, Selic e o valor justo que você esperava) que eu ajusto
certinho.

## Sobre usar uma API em vez do scraper

Pesquisei as opções gratuitas brasileiras antes de mexer no código:

- **brapi.dev**: é a API financeira BR mais completa hoje, mas o plano gratuito (15 mil
  requisições/mês) só dá cotação básica. Indicadores detalhados de FIIs — vacância,
  relatórios CVM, carteira, segmento — ficam no plano **Pro (R$ 139,99/mês)**. Não dá pra
  cobrir os campos que você pediu de graça.
- **BCB (Banco Central) SGS**: 100% gratuita, oficial, sem chave — mas só tem dados
  macroeconômicos (Selic, câmbio, IPCA etc.), não tem indicadores de ações/FIIs. Por isso ela
  entra só para a Selic, complementando o scraper.
- **Conclusão**: não existe fonte 100% gratuita com todos os campos que você listou (LPA,
  VPA, ROIC, margens, vacância, cotistas, taxa de administração...). O scraper continua sendo
  a única forma de ter tudo isso sem pagar. Se no futuro quiser eliminar o risco de o site
  mudar o HTML, o brapi.dev Pro é a opção mais direta — e como o scraper já está isolado em
  `lib/scraper.js`, trocar por uma chamada de API ali dentro é uma mudança localizada, não
  precisa tocar nas rotas nem no front.

## Estrutura

```
scanner-ativos/
├── package.json
├── server.js           # rotas /api/acoes e /api/fiis
├── lib/
│   ├── bcb.js           # Selic via Banco Central (com cache de 6h)
│   ├── scraper.js       # raspagem do Investidor10 (com retry + cache de 5min)
│   ├── valuation.js      # Graham Número, Revisado, Tupiniquim, Bazin
│   ├── classify.js       # bom/neutro/ruim, com 3 perfis para ações
│   └── format.js         # parsing de texto raspado -> número, formatação pt-BR
    └── index.html         # front-end (tabs Ações/FIIs + seletor de perfil)
```

## Próximos passos sugeridos

1. Teste a aba FIIs com alguns tickers (MXRF11, HGLG11, KNCR11...) e me avisa se algum campo
   vier vazio — o `dictRaw`/`dictNum` do `scraper.js` loga a chave normalizada, então é rápido
   de ajustar o mapeamento se o Investidor10 tiver mudado alguma classe HTML.
2. Depois de validar FIIs, testamos Ações do mesmo jeito — os seletores são os mesmos padrões
   (`._card`, `.cell`), então devem funcionar, mas não testei ao vivo.
3. Se quiser, dá pra levar o seletor de perfil (Conservador/Moderado/Arrojado) para a aba de
   FIIs também — hoje ele só existe para Ações porque foi assim que você descreveu o pedido.
