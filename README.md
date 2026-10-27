# Invista+ · análise de ações e FIIs

Scanner de indicadores da B3 com perfis de avaliação, comparativos de valuation, simuladores de dividendos e Auxiliar Gemini contextual.

## Rodar localmente

Requer Node.js 22 ou superior (Vercel usa Node 24).

```sh
npm ci
# Copie .env.example para .env.local e preencha os serviços necessários.
npm start
```

Abra `http://localhost:3000`. A interface e a API são servidas pela mesma aplicação. No GitHub Pages, a interface utiliza `https://invistaai-ochre.vercel.app` como API. Login e cadastro continuam usando o Firebase existente; indicadores e gráficos funcionam mesmo quando o SDK de autenticação não carrega.

## Auxiliar Gemini

Configure `GEMINI_API_KEY` como segredo **no servidor** e `GEMINI_MODEL=gemini-flash-latest`. O modelo é configurável porque disponibilidade e aliases do Google podem mudar. Na Vercel, configure as variáveis nos ambientes necessários e publique novamente. Nunca coloque a chave em HTML, variáveis públicas, commits ou logs. `.env.local` e `.vercel/` são ignorados pelo Git.

O Auxiliar aparece na quarta aba e ao fim de cada relatório. O servidor consulta os indicadores do ticker e do perfil selecionados, reaproveita o cache e envia esse contexto ao Gemini. As perguntas aceitam linguagem livre e histórico; trocar o ativo/perfil separa as conversas. Perguntas que dependem de notícias, relatórios completos ou dados não disponíveis recebem essa limitação. O modelo não tem navegação web nem executa operações financeiras.

As respostas são exibidas como texto, sem executar HTML gerado. O histórico fica na memória da página e é enviado ao Google ao perguntar. O servidor limita corpo, histórico, duração, saída e concorrência. A limitação de 10 perguntas/minuto por cliente e 4 simultâneas é **por instância**; não representa um orçamento global na Vercel. Para escala, configure cotas do provedor e um limitador compartilhado.

`GET /api/auxiliar/status` informa presença da configuração, não testa a validade da chave. `POST /api/auxiliar` recebe `{ticker, tipo, perfil, message, history}`; `tipo` é `acoes` ou `fiis`. Métricas enviadas pelo navegador não substituem o contexto obtido pelo servidor.

## Gráficos e simulações

- **Ações:** barras comparando cotação, Graham clássico, duas adaptações existentes e tetos por dividendos de 6% e 8%.
- **Gordon:** cenário opcional, separado dos cálculos existentes, com dividendo anual base, retorno exigido e crescimento perpétuo editáveis. As taxas iniciais são exemplos.
- **FIIs:** cotas, aporte e meta de renda vinculados, controle deslizante, saldo não investido e gráfico que compara o provento estimado com o preço de uma nova cota.

Com preço de R$ 12,99 e último rendimento de R$ 0,21, 62 cotas custam R$ 805,38 e simulam R$ 13,02 por pagamento. Com 63 cotas: R$ 818,37 e R$ 13,23. Aporte usa arredondamento para baixo em cotas inteiras; meta de renda usa arredondamento para cima. O pagamento do próximo mês e a elegibilidade na data-com não são confirmados pela simulação.

## Revisão das fórmulas

As quatro funções originais de valuation mantêm seus cálculos e comportamento. A apresentação oculta resultados não finitos/não positivos e identifica ausência de entradas necessárias. Não substituímos parâmetros das fórmulas existentes.

| Método | Cálculo existente / adicionado | Interpretação |
| --- | --- | --- |
| Graham clássico | `sqrt(22.5 × LPA × VPA)` | Requer lucro e patrimônio positivos. |
| Graham revisado do aplicativo | `LPA × (8.5 + 2g) × (4.4 / Selic)` | CAGR histórico como cenário; Selic substitui yield AAA. Não é previsão de crescimento nem aplicação original completa. |
| Graham Tupiniquim do aplicativo | `LPA × (5.5 + 2g) × (4.4 / Selic)` | Variante própria já existente, sem definição brasileira universal. |
| Teto por dividendos | `(DY12m / 100 × cotação) / yield-alvo` | Proxy de proventos passados; não ajusta eventos extraordinários nem analisa recorrência de vários anos do método Bazin. |
| Gordon, novo cenário | `D0 × (1 + g) / (r − g)` | Dividendos estáveis crescendo perpetuamente, com `r > g`; D0 anual por ação. |
| Bola de neve | `ceil(cotação / último rendimento)` | Menor quantidade inteira cujo rendimento repetido compraria uma cota ao mesmo preço. |

Graham recebe crescimento/Selic em pontos percentuais. Gordon converte percentuais dos campos para decimais. A margem mostrada é `(estimativa − cotação) / estimativa`, não o retorno potencial sobre o preço pago.

Referências: [CFA Institute — valuation por dividendos](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/discounted-dividend-valuation), [Damodaran — Gordon/DDM](https://pages.stern.nyu.edu/adamodar/New_Home_Page/lectures/ddm.html), [Banco Central — série SGS 432](https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom), [Gemini REST](https://ai.google.dev/api/generate-content).

## Dados e desempenho

Investidor10 é a fonte do scraper. Cache de 5 minutos por tipo/ticker, conexões reaproveitadas e uma única requisição para buscas simultâneas do mesmo ativo. Trocar o perfil recalcula os sinais sobre os mesmos dados. Cache limitado a 200 ativos por instância. No máximo duas tentativas de 6,5 segundos; bloqueios/404 não são repetidos. Páginas sem indicadores válidos não entram no cache.

A Selic tem cache de 6 horas e consultas simultâneas agrupadas. Em falha, o último valor válido fica identificado como antigo; sem valor anterior, cálculos dependentes ficam indisponíveis. Não há taxa fixa fingindo ser atual. A API expõe origem, horário da consulta e data de referência quando fornecida. Horário de coleta não é horário da negociação.

Essas melhorias reduzem trabalho repetido; a primeira consulta depende da fonte, rede e inicialização da função. Cache em memória não é compartilhado entre instâncias. O parser foi corrigido para não truncar `1234` em `123`.

## Verificação

```sh
npm test
```

Testes cobrem parser, fórmulas existentes e Gordon, exemplo de FIIs, cache/concorrência, Selic, validação HTTP, arquivos privados e respostas/erros do Gemini simulado. Para teste visual opcional, instale Playwright no ambiente, inicie o servidor e rode `node test/browser.smoke.mjs`; `BROWSER_CHANNEL`, `BASE_URL` e `PLAYWRIGHT_MODULE` selecionam navegador, aplicação e runtime. Esse teste usa dados controlados, verifica quatro abas, chat contextual, campos vinculados, Gordon e largura móvel, e grava capturas em `artifacts/`.

## Estrutura e limites conhecidos

- `server.js`: páginas públicas, rotas HTTP e integração legada de favoritos/relatório.
- `lib/analysis.js`: dados estruturados, cards e contexto compartilhado com a IA.
- `lib/auxiliar.js`: Gemini, validação, erros e limites de uso.
- `lib/scraper.js`, `bcb.js`, `format.js`, `valuation.js`, `classify.js`: coleta, cálculos e perfis.
- `public/`: gráficos e chat sem bibliotecas adicionais de gráficos.

Os sinais por perfil são heurísticas gerais, não análise setorial nem teste de adequação do investidor. O scraper depende da estrutura e disponibilidade da fonte. Favoritos/relatórios legados inferem tipo pelo final `11` em alguns fluxos; a aba Auxiliar permite escolher explicitamente, pois há ações/units terminadas em `11`. As rotas legadas de IoT recebem `deviceId` sem autenticação do dispositivo e merecem revisão própria antes de ampliar esse serviço. Nenhum e-mail é enviado pelos testes.
