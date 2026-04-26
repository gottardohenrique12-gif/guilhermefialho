require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const multer   = require('multer');
const { criarCobrancaPix, consultarPagamento } = require('./pagamento');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Servir página admin ──────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// ── Persistência de pagamentos ───────────────────────────────
const PAGAMENTOS_PATH = path.join(__dirname, 'pagamentos.json');

function carregarPagamentos() {
  try {
    if (fs.existsSync(PAGAMENTOS_PATH))
      return JSON.parse(fs.readFileSync(PAGAMENTOS_PATH, 'utf8'));
  } catch (e) {}
  return {};
}

function salvarPagamentos(p) {
  try { fs.writeFileSync(PAGAMENTOS_PATH, JSON.stringify(p, null, 2)); } catch(e) {}
}

const pagamentos = carregarPagamentos();

// ── Persistência do catálogo ─────────────────────────────────
const CATALOGO_PATH = path.join(__dirname, 'catalogo.json');

function carregarCatalogo() {
  try {
    if (fs.existsSync(CATALOGO_PATH))
      return JSON.parse(fs.readFileSync(CATALOGO_PATH, 'utf8'));
  } catch(e) {}
  return { fotos: [] };
}

function salvarCatalogo(c) {
  try { fs.writeFileSync(CATALOGO_PATH, JSON.stringify(c, null, 2)); } catch(e) {}
}

// ── Admin: autenticação ──────────────────────────────────────
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'guilherme2025';
const tokens = new Set();

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || !tokens.has(token)) return res.status(401).json({ erro: 'Não autorizado' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { senha } = req.body;
  if (senha === ADMIN_SENHA) {
    const token = crypto.randomBytes(32).toString('hex');
    tokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ erro: 'Senha incorreta' });
});

app.get('/api/admin/verificar', authMiddleware, (req, res) => {
  res.json({ ok: true });
});

// ── Admin: upload de foto ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const imgDir = path.join(__dirname, '../frontend/img');
    const dlDir  = path.join(__dirname, '../downloads/artisticas');
    fs.mkdirSync(imgDir, { recursive: true });
    fs.mkdirSync(dlDir,  { recursive: true });
    cb(null, imgDir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const nome = req.body.nome || 'foto';
    const slug = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    cb(null, `${slug}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/admin/upload', authMiddleware, upload.single('foto'), (req, res) => {
  try {
    const { nome, preco, tipo, categoria } = req.body;
    const arquivo = req.file.filename;

    // Copia para downloads também
    const src  = path.join(__dirname, '../frontend/img', arquivo);
    const dest = path.join(__dirname, '../downloads/artisticas', arquivo);
    fs.copyFileSync(src, dest);

    const catalogo = carregarCatalogo();
    const id = `${tipo === 'artistica' ? 'adm' : 'adme'}-${Date.now()}`;

    const novaFoto = {
      id,
      categoria: tipo,
      nome,
      preco: parseFloat(preco),
      preview: `img/${arquivo}`,
      arquivo,
      ...(tipo === 'artistica' ? { categoriaArtId: categoria } : { eventoId: categoria }),
    };

    catalogo.fotos.push(novaFoto);
    salvarCatalogo(catalogo);

    console.log(`✅ Foto adicionada via admin: ${nome}`);
    res.json({ ok: true, foto: novaFoto });
  } catch(e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

// ── Admin: listar fotos do catálogo dinâmico ─────────────────
app.get('/api/admin/fotos', authMiddleware, (req, res) => {
  const { categoria } = req.query;
  const catalogo = carregarCatalogo();
  let fotos = catalogo.fotos;
  if (categoria) {
    fotos = fotos.filter(f =>
      f.categoriaArtId === categoria || f.eventoId === categoria || f.categoria === categoria
    );
  }
  res.json(fotos);
});

// ── Admin: remover foto ──────────────────────────────────────
app.delete('/api/admin/fotos/:id', authMiddleware, (req, res) => {
  const catalogo = carregarCatalogo();
  const foto = catalogo.fotos.find(f => f.id === req.params.id);
  if (!foto) return res.status(404).json({ erro: 'Foto não encontrada' });

  catalogo.fotos = catalogo.fotos.filter(f => f.id !== req.params.id);
  salvarCatalogo(catalogo);

  // Remove arquivos do disco
  try { fs.unlinkSync(path.join(__dirname, '../frontend/img', foto.arquivo)); } catch(e) {}
  try { fs.unlinkSync(path.join(__dirname, '../downloads/artisticas', foto.arquivo)); } catch(e) {}

  res.json({ ok: true });
});

// ── Admin: endpoint para o frontend buscar fotos dinâmicas ───
app.get('/api/catalogo', (req, res) => {
  const catalogo = carregarCatalogo();
  res.json(catalogo.fotos);
});

// ── POST /api/criar-pix ──────────────────────────────────────
app.post('/api/criar-pix', async (req, res) => {
  const { itens, total, emailComprador } = req.body;
  if (!itens || !emailComprador || !total)
    return res.status(400).json({ erro: 'itens, total e emailComprador são obrigatórios' });

  try {
    const descricao = itens.length === 1
      ? itens[0].nome
      : `${itens.length} fotos - Guilherme Fialho`;

    const cobranca = await criarCobrancaPix({ valor: total, descricao, emailComprador });

    pagamentos[cobranca.id] = { itens, emailComprador, status: 'pending' };
    salvarPagamentos(pagamentos);
    res.json(cobranca);
  } catch(erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ── GET /api/status/:id ──────────────────────────────────────
app.get('/api/status/:id', async (req, res) => {
  try {
    const dados = await consultarPagamento(req.params.id);
    if (dados.status === 'approved' && pagamentos[req.params.id]) {
      const pag = pagamentos[req.params.id];
      pag.status = 'approved';
      if (!pag.tokenDownload) {
        pag.tokenDownload = crypto.randomBytes(32).toString('hex');
        salvarPagamentos(pagamentos);
      }
      return res.json({ ...dados, linkDownload: `/download/${pag.tokenDownload}` });
    }
    res.json(dados);
  } catch(erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ── GET /download/:token ─────────────────────────────────────
app.get('/download/:token', (req, res) => {
  const pag = Object.values(pagamentos).find(
    p => p.tokenDownload === req.params.token && p.status === 'approved'
  );
  if (!pag) return res.status(403).send('Link inválido ou expirado.');

  const arquivo = pag.itens[0].arquivo;
  const caminhos = [
    path.join(__dirname, '../downloads/artisticas', arquivo),
    path.join(__dirname, '../downloads', arquivo),
  ];
  const caminho = caminhos.find(c => fs.existsSync(c));
  if (!caminho) return res.status(404).send('Arquivo não encontrado.');
  res.download(caminho);
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
      }
    } catch(e) {}
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