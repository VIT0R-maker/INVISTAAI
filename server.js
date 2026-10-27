import express from 'express';
import cors from 'cors';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAnalysis } from './lib/analysis.js';
import { createAuxiliarRouter } from './lib/auxiliar.js';
import { perfisAcoesDisponiveis, perfisFiiDisponiveis } from './lib/classify.js';

const rootDir = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
// Allows the bounded scrape and Gemini request to complete on Vercel.
export const config = { maxDuration: 60 };

app.use(cors());
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
// Serve only public assets, never the project directory or environment files.
app.use('/public', express.static(join(rootDir, 'public'), { maxAge: '1h' }));
for (const file of ['index.html', 'login.html', 'cadastro.html']) {
  app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (_req, res) => res.sendFile(join(rootDir, file)));
}

// 1. Inicialização segura do Firestore com os módulos modernos
let db;
try {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      })
    });
  }
  db = getFirestore();
  console.log("🔥 Firestore conectado com sucesso!");
} catch (error) {
  console.error("❌ Falha crítica ao conectar no Firebase:", error.message);
}

// 2. Configura o "carteiro" (Nodemailer) com a sua Senha de App
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.get('/api/health', (_req, res) => res.json({ status: 'online', sistema: 'Invista+' }));
app.get('/api/perfis', (_req, res) => res.json({ acoes: perfisAcoesDisponiveis(), fiis: perfisFiiDisponiveis() }));
app.use('/api/auxiliar', createAuxiliarRouter({ getAnalysis }));

for (const tipo of ['acoes', 'fiis']) {
  app.post(`/api/${tipo}`, async (req, res) => {
    try {
      const data = await getAnalysis(tipo, req.body?.ticker, req.body?.perfil ?? 'moderado');
      res.setHeader('Cache-Control', 'no-store');
      res.json(data);
    } catch (error) {
      const status = error.status === 400 ? 400 : error.response?.status === 404 ? 404 : 502;
      const message = status === 400 ? error.message : status === 404 ? 'Ativo não encontrado para o tipo selecionado.'
        : error.possivelBloqueio ? 'A fonte de indicadores está temporariamente indisponível. Tente novamente em alguns minutos.'
        : 'Não foi possível consultar os indicadores agora. Tente novamente em instantes.';
      res.status(status).json({ error: message });
    }
  });
}

// =================================================================
// ROTA DE SINCRONIZAÇÃO: FRONTEND -> FIREBASE
// =================================================================
app.post('/api/favoritos/sync', async (req, res) => {
  const { deviceId, favoritos } = req.body;
  
  if (!deviceId || !Array.isArray(favoritos)) {
    return res.status(400).json({ error: 'Dados inválidos.' });
  }

  try {
    if (!db) throw new Error("Banco de dados não está conectado.");
    
    // Atualiza apenas a matriz 'ativosFavoritos' no documento do usuário
    const docRef = db.collection('devices').doc(deviceId);
    await docRef.set({ ativosFavoritos: favoritos }, { merge: true });
    
    console.log(`[Sync] Nuvem atualizada para o aparelho ${deviceId}:`, favoritos);
    res.json({ success: true, message: 'Sincronizado com sucesso!' });

  } catch (error) {
    console.error("Erro ao sincronizar favoritos na nuvem:", error);
    res.status(500).json({ error: 'Falha ao salvar na nuvem.' });
  }
});

// =================================================================
// ROTA DO IOT: FIREBASE REAL + GMAIL + VALUATION
// =================================================================
app.post('/api/relatorio', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Device ID não informado.' });

  try {
    if (!db) throw new Error("Banco de dados não está conectado.");

    const docRef = db.collection('devices').doc(deviceId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Aparelho não cadastrado no Firebase.' });
    }

    const usuario = doc.data();
    console.log(`[IoT] Analisando ativos de ${usuario.nome}: ${usuario.ativosFavoritos.join(', ')}`);

    let relatorioHTML = `
      <div style="font-family: Arial; color: #333;">
        <h2 style="color: #0056b3;">Relatório Invista+</h2>
        <p>Olá, <b>${usuario.nome}</b>! Aqui está a análise atualizada da sua carteira disparada pelo seu dispositivo físico:</p>
        <hr>
    `;
    
    for (const ticker of usuario.ativosFavoritos) {
      try {
        // Verifica se o ticker é um Fundo Imobiliário (termina com 11) ou Ação
        const isFii = ticker.endsWith('11');
        const dados = await getAnalysis(isFii ? 'fiis' : 'acoes', ticker, 'moderado');
        
        if (isFii) {
          // Layout específico para FIIs
          relatorioHTML += `
            <div style="margin-bottom: 15px; padding: 10px; border-left: 4px solid #28a745; background: #f9f9f9;">
              <h3 style="margin: 0 0 5px 0;">${ticker} <span style="font-size: 0.8em; color: #666;">(FII)</span></h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li><b>Cotação:</b> ${dados.cotacao?.value || '-'}</li>
                <li><b>P/VP:</b> ${dados.pvp?.value || '-'}</li>
                <li><b>DY:</b> ${dados.dy?.value || '-'}</li>
                <li><b>Último Rendimento:</b> ${dados.ultimoRendimento?.value || '-'}</li>
              </ul>
            </div>
          `;
        } else {
          // Layout original para Ações
          relatorioHTML += `
            <div style="margin-bottom: 15px; padding: 10px; border-left: 4px solid #0056b3; background: #f9f9f9;">
              <h3 style="margin: 0 0 5px 0;">${ticker} <span style="font-size: 0.8em; color: #666;">(Ação)</span></h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li><b>Cotação:</b> ${dados.cotacao?.value || '-'}</li>
                <li><b>P/L:</b> ${dados.pl?.value || '-'}</li>
                <li><b>DY:</b> ${dados.dy?.value || '-'}</li>
                <li><b>Valor de Graham:</b> ${dados.valorGrahamTupiniquim?.value || '-'}</li>
              </ul>
            </div>
          `;
        }
      } catch (e) {
        relatorioHTML += `<p><b>${ticker}:</b> Falha ao analisar este ativo no momento.</p>`;
      }
    }
    
    relatorioHTML += `<br><p><i>Análise gerada automaticamente pelo sistema Invista+ IoT.</i></p></div>`;

    await transporter.sendMail({
      from: `"Motor Invista+" <${process.env.EMAIL_USER}>`,
      to: usuario.email,
      subject: `📈 Relatório de Ativos Invista+ (${usuario.nome})`,
      html: relatorioHTML
    });

    console.log(`[IoT] E-mail enviado com sucesso para ${usuario.email}!`);
    res.json({ success: true, message: "Relatorio enviado no e-mail!" });

  } catch (error) {
    console.error("Erro geral no IoT:", error);
    res.status(500).json({ error: 'Falha ao processar relatório.' });
  }
});

app.use((error, _req, res, _next) => {
  const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: status === 413 ? 'Mensagem muito grande.' : status === 400 ? 'JSON inválido.' : 'Erro interno. Tente novamente.' });
});

if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`🚀 Motor Quântico operando em http://localhost:${port}`);
  });
}

export default app;
