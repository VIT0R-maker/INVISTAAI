import { escapeHTML } from './charts.js';
import { normalizeTicker } from './tickers.js';

const conversations = new Map();
const profileNames = { conservador: 'Conservador', moderado: 'Moderado', arrojado: 'Arrojado' };
let lastContext = null;
let serviceState = null;
let serviceCheckedAt = 0;

export function boundedHistory(messages) {
    const history = [];
    let length = 0;
    for (let i = messages.length - 2; i >= 0 && history.length < 10; i -= 2) {
        if (messages[i]?.role !== 'user' || messages[i + 1]?.role !== 'model') continue;
        const pair = [
            { role: 'user', text: messages[i].text.slice(0, 3000) },
            { role: 'model', text: messages[i + 1].text.slice(0, 6000) },
        ];
        const pairLength = pair[0].text.length + pair[1].text.length;
        if (length + pairLength > 16000) break;
        history.unshift(...pair);
        length += pairLength;
    }
    return history;
}

export function rememberAsset(data, tipo) {
    lastContext = { ticker: data.ticker, tipo, perfil: data.perfil, metadata: data.metadata };
}

function getConversation(context) {
    const key = `${context.tipo}:${context.ticker}:${context.perfil}`;
    if (!conversations.has(key)) conversations.set(key, { messages: [], draft: '', pending: false, error: '', controller: null });
    return conversations.get(key);
}

async function checkService(baseUrl) {
    if (serviceState && Date.now() - serviceCheckedAt < 60000) return serviceState;
    try {
        const response = await fetch(`${baseUrl}/api/auxiliar/status`, { signal: AbortSignal.timeout(7000) });
        if (!response.ok) return null;
        serviceState = await response.json();
        serviceCheckedAt = Date.now();
        return serviceState;
    } catch { return null; }
}

function renderMessage(message) {
    const item = document.createElement('div');
    item.className = `chat-message ${message.role === 'user' ? 'from-user' : 'from-assistant'}`;
    const label = document.createElement('span');
    label.className = 'chat-message-author';
    label.textContent = message.role === 'user' ? 'Você' : 'Auxiliar · Gemini';
    const text = document.createElement('div');
    text.className = 'chat-message-text';
    // Model output is always plain text, never executable HTML or arbitrary links.
    text.textContent = message.text;
    item.append(label, text);
    if (message.truncated) {
        const note = document.createElement('p');
        note.className = 'field-hint';
        note.textContent = 'A resposta atingiu o limite de tamanho. Peça para aprofundar um ponto específico.';
        item.append(note);
    }
    return item;
}

export function mountAssistant(container, context, baseUrl) {
    const previous = container.querySelector('.assistant-panel');
    if (previous) previous.remove();
    const conversation = getConversation(context);
    const section = document.createElement('section');
    section.className = 'insight-panel assistant-panel';
    section.setAttribute('aria-label', `Auxiliar Gemini para ${context.ticker}`);
    const suggestions = context.tipo === 'fiis' ? ['Quais riscos merecem atenção neste FII?', 'Explique o efeito bola de neve deste fundo.', 'O dividend yield pode ser sustentável?'] : ['Como interpretar os preços justos deste ativo?', 'Quais indicadores merecem atenção?', 'O que muda para o meu perfil?'];
    section.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">AUXILIAR · GEMINI</span><h2>Transforme indicadores em entendimento.</h2></div><button type="button" class="text-button clear-chat">Limpar conversa</button></div><p class="panel-description">Pergunte sobre riscos, indicadores, dividendos ou as hipóteses dos cálculos.</p><div class="context-pills"><span>${escapeHTML(context.ticker)}</span><span>${context.tipo === 'fiis' ? 'Fundo imobiliário' : 'Ação'}</span><span>Perfil ${escapeHTML(profileNames[context.perfil] || context.perfil)}</span></div><p class="assistant-status field-hint" role="status">O Auxiliar usa os dados consultados do ativo para responder.</p><div class="chat-log" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Conversa com o Auxiliar"></div><div class="chat-suggestions">${suggestions.map(text => `<button type="button">${escapeHTML(text)}</button>`).join('')}</div><form class="chat-form"><label class="sr-only" for="assistant-message">Sua pergunta sobre ${escapeHTML(context.ticker)}</label><textarea id="assistant-message" rows="3" maxlength="2000" placeholder="Ex.: o preço baixo deste ativo significa uma oportunidade?" required></textarea><div class="chat-form-bottom"><span class="field-hint">Enter envia · Shift + Enter quebra linha</span><button class="primary-button chat-send" type="submit">Perguntar <span aria-hidden="true">↗</span></button></div></form><p class="chat-error" role="alert"></p><p class="assistant-disclaimer">Respostas geradas por IA podem conter erros. Confira as fontes e as premissas. Conteúdo educacional, sem recomendação individual de compra ou venda.</p>`;
    container.append(section);
    const log = section.querySelector('.chat-log');
    const textarea = section.querySelector('textarea');
    const send = section.querySelector('.chat-send');
    const error = section.querySelector('.chat-error');
    const status = section.querySelector('.assistant-status');
    let configured = true;

    function redraw() {
        if (!section.isConnected) return;
        log.replaceChildren(...conversation.messages.map(renderMessage));
        if (conversation.pending) {
            const pending = document.createElement('p');
            pending.className = 'chat-thinking';
            pending.textContent = 'Consultando o contexto e preparando a resposta…';
            log.append(pending);
        }
        log.hidden = conversation.messages.length === 0 && !conversation.pending;
        send.disabled = conversation.pending || !configured;
        send.textContent = conversation.pending ? 'Analisando…' : 'Perguntar ↗';
        textarea.disabled = conversation.pending || !configured;
        if (!conversation.pending) textarea.value = conversation.draft;
        section.querySelectorAll('.chat-suggestions button').forEach(button => { button.disabled = conversation.pending || !configured; });
        error.textContent = conversation.error;
        if (conversation.messages.length) log.scrollTop = log.scrollHeight;
    }
    conversation.render = redraw;
    textarea.value = conversation.draft;
    textarea.addEventListener('input', () => { conversation.draft = textarea.value; });
    textarea.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); section.querySelector('form').requestSubmit(); }
    });
    section.querySelectorAll('.chat-suggestions button').forEach(button => button.addEventListener('click', () => {
        textarea.value = button.textContent;
        conversation.draft = textarea.value;
        textarea.focus();
    }));
    section.querySelector('.clear-chat').addEventListener('click', () => {
        conversation.controller?.abort();
        conversation.controller = null;
        conversation.messages = [];
        conversation.draft = '';
        conversation.pending = false;
        conversation.error = '';
        textarea.value = '';
        redraw();
    });
    section.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const message = textarea.value.trim();
        if (!message || conversation.pending || !configured) return;
        const history = boundedHistory(conversation.messages);
        const userMessage = { role: 'user', text: message };
        conversation.messages.push(userMessage);
        conversation.pending = true;
        conversation.error = '';
        conversation.draft = '';
        textarea.value = '';
        const controller = new AbortController();
        conversation.controller = controller;
        const timer = setTimeout(() => controller.abort(), 65000);
        redraw();
        try {
            const response = await fetch(`${baseUrl}/api/auxiliar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker: context.ticker, tipo: context.tipo, perfil: context.perfil, message, history }),
                signal: controller.signal,
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Não foi possível obter uma resposta. Tente novamente.');
            if (typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('A resposta veio vazia. Tente reformular sua pergunta.');
            if (conversation.controller !== controller) return;
            conversation.messages.push({ role: 'model', text: data.answer, truncated: data.truncated === true });
            // Keep browser memory bounded without persisting financial questions to storage.
            if (conversation.messages.length > 40) conversation.messages.splice(0, conversation.messages.length - 40);
            if (data.context?.updatedAt) {
                const updated = new Date(data.context.updatedAt);
                if (Number.isFinite(updated.getTime())) status.textContent = `Contexto de ${context.ticker} consultado em ${updated.toLocaleString('pt-BR')}. Fonte: Investidor10.`;
            }
        } catch (cause) {
            if (conversation.controller !== controller) return;
            conversation.messages = conversation.messages.filter(item => item !== userMessage);
            conversation.draft = message;
            textarea.value = message;
            conversation.error = cause.name === 'AbortError' ? 'A resposta demorou mais que o esperado. Sua pergunta foi preservada; tente novamente.' : cause.message;
        } finally {
            clearTimeout(timer);
            if (conversation.controller === controller) {
                conversation.pending = false;
                conversation.controller = null;
                conversation.render?.();
            }
        }
    });
    redraw();
    checkService(baseUrl).then(state => {
        if (!section.isConnected) return;
        if (state?.configured === false) {
            configured = false;
            status.textContent = 'O Auxiliar ainda está sendo configurado. A consulta de indicadores e os simuladores continuam disponíveis.';
            redraw();
        }
    });
    return section;
}

export function renderAssistantTab(container, baseUrl, profile = 'moderado') {
    const context = lastContext ? { ...lastContext } : null;
    profile = context?.perfil || profile;
    container.innerHTML = `<section class="assistant-intro"><span class="eyebrow">SEU ESPAÇO DE ANÁLISE</span><h1>Converse sobre o seu próximo aporte.</h1><p>Selecione um ativo para dar contexto à conversa. O Auxiliar explica os indicadores de acordo com seu perfil.</p></section><form class="assistant-context-form insight-panel"><div class="context-fields"><label>Ativo<input name="ticker" type="text" maxlength="6" placeholder="Ex.: PETR4 ou HCTR11" autocomplete="off" autocapitalize="characters" value="${escapeHTML(context?.ticker || '')}" required></label><label>Tipo<select name="tipo"><option value="acoes" ${context?.tipo !== 'fiis' ? 'selected' : ''}>Ações</option><option value="fiis" ${context?.tipo === 'fiis' ? 'selected' : ''}>FIIs</option></select></label><label>Perfil<select name="perfil">${Object.entries(profileNames).map(([key, label]) => `<option value="${key}" ${profile === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="submit" class="primary-button">Usar este contexto</button></div><p class="context-error" role="alert"></p><p class="field-hint">Confirme o tipo do ativo. Nem todo ticker terminado em 11 é um FII.</p></form><div class="assistant-tab-chat"></div>`;
    const form = container.querySelector('.assistant-context-form');
    const target = container.querySelector('.assistant-tab-chat');
    if (context) mountAssistant(target, context, baseUrl);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const values = new FormData(form);
        const ticker = normalizeTicker(values.get('ticker'), values.get('tipo'));
        if (!ticker) {
            form.querySelector('.context-error').textContent = 'Use um ticker da B3, como PETR4 ou HCTR11.';
            return;
        }
        form.querySelector('.context-error').textContent = '';
        form.elements.ticker.value = ticker;
        const nextContext = { ticker, tipo: values.get('tipo'), perfil: values.get('perfil') };
        lastContext = nextContext;
        mountAssistant(target, nextContext, baseUrl);
        target.querySelector('textarea').focus();
    });
}
