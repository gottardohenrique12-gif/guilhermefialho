require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const { criarCobrancaPix, consultarPagamento } = require('./pagamento');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Persistência de pagamentos em arquivo ────────────────────
const PAGAMENTOS_PATH = path.join(__dirname, 'pagamentos.json');

function carregarPagamentos() {
  try {
    if (fs.existsSync(PAGAMENTOS_PATH)) {
      return JSON.parse(fs.readFileSync(PAGAMENTOS_PATH, 'utf8'));
    }
  } catch (e) {
    console.warn('Erro ao carregar pagamentos.json:', e.message);
  }
  return {};
}

function salvarPagamentos(pagamentos) {
  try {
    fs.writeFileSync(PAGAMENTOS_PATH, JSON.stringify(pagamentos, null, 2));
  } catch (e) {
    console.warn('Erro ao salvar pagamentos.json:', e.message);
  }
}

const pagamentos = carregarPagamentos();

// ── POST /api/criar-pix ──────────────────────────────────────
app.post('/api/criar-pix', async (req, res) => {
  const { itens, total, emailComprador } = req.body;

  if (!itens || !emailComprador || !total) {
    return res.status(400).json({ erro: 'itens, total e emailComprador são obrigatórios' });
  }

  try {
    const descricao = itens.length === 1
      ? itens[0].nome
      : `${itens.length} fotos - Guilherme Fialho`;

    console.log(`\n🛒 Nova compra: ${descricao} — R$${total} — ${emailComprador}`);

    const cobranca = await criarCobrancaPix({
      valor: total,
      descricao,
      emailComprador,
    });

    pagamentos[cobranca.id] = {
      itens,
      emailComprador,
      status: 'pending',
    };

    salvarPagamentos(pagamentos);
    res.json(cobranca);

  } catch (erro) {
    console.error('Erro:', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

// ── GET /api/status/:id ──────────────────────────────────────
app.get('/api/status/:id', async (req, res) => {
  try {
    const dados = await consultarPagamento(req.params.id);

    if (dados.status === 'approved' && pagamentos[req.params.id]) {
      const pagamento = pagamentos[req.params.id];
      pagamento.status = 'approved';

      if (!pagamento.tokenDownload) {
        pagamento.tokenDownload = crypto.randomBytes(32).toString('hex');
        salvarPagamentos(pagamentos);
        console.log(`✅ Pagamento aprovado! Token: ${pagamento.tokenDownload}`);
      }

      return res.json({
        ...dados,
        linkDownload: `/download/${pagamento.tokenDownload}`,
      });
    }

    res.json(dados);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ── GET /download/:token ─────────────────────────────────────
app.get('/download/:token', (req, res) => {
  const pagamento = Object.values(pagamentos).find(
    p => p.tokenDownload === req.params.token && p.status === 'approved'
  );

  if (!pagamento) return res.status(403).send('Link inválido ou expirado.');

  const arquivo = pagamento.itens[0].arquivo;

  // Tenta na pasta downloads/artisticas primeiro, depois downloads direto
  const caminhos = [
    path.join(__dirname, '../downloads/artisticas', arquivo),
    path.join(__dirname, '../downloads', arquivo),
  ];

  const caminho = caminhos.find(c => fs.existsSync(c));

  if (!caminho) {
    console.error(`Arquivo não encontrado: ${arquivo}`);
    return res.status(404).send('Arquivo não encontrado.');
  }

  return res.download(caminho);
});

// ── POST /api/webhook ────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;
  if (type === 'payment') {
    try {
      const pag = await consultarPagamento(data.id);
      if (pag.status === 'approved' && pagamentos[data.id]) {
        pagamentos[data.id].status = 'approved';
        salvarPagamentos(pagamentos);
        console.log(`Webhook: pagamento ${data.id} aprovado!`);
      }
    } catch (e) {
      console.error('Erro no webhook:', e.message);
    }
  }
  res.sendStatus(200);
});

// ── Rota de reconhecimento facial (desativada) ───────────────
app.post('/api/reconhecimento', (req, res) => {
  res.json({ fotosEncontradas: [] });
});

app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Servidor: http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});