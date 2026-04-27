require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const multer     = require('multer');
const sharp      = require('sharp');
const cloudinary = require('cloudinary').v2;
const { criarCobrancaPix, consultarPagamento } = require('./pagamento');

// ── Cloudinary config ─────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Marca d'água (aplicada em buffer, sem gravar no disco) ────
const TEXTO_MARCA = '© Guilherme Fialho Soares';

async function gerarBufferComMarca(buffer) {
  const meta = await sharp(buffer).metadata();
  const W    = meta.width;
  const H    = meta.height;

  const fontSize   = Math.max(18, Math.round(Math.min(W, H) * 0.035));
  const repeticoes = 6;
  const passo      = Math.round(Math.max(W, H) / repeticoes);
  const svgTextos  = [];

  for (let i = -repeticoes; i <= repeticoes * 2; i++) {
    const x = i * passo;
    svgTextos.push(`
      <text x="${x}" y="0"
        font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold"
        fill="white" fill-opacity="0.45"
        stroke="black" stroke-width="0.5" stroke-opacity="0.2"
        transform="rotate(-30, ${x}, 0)" letter-spacing="2"
      >${TEXTO_MARCA}</text>
    `);
  }

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${svgTextos.join('')}
    </svg>
  `);

  return sharp(buffer)
    .composite([{ input: svg, gravity: 'center' }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

// ── Upload para o Cloudinary ──────────────────────────────────
function uploadParaCloudinary(buffer, publicId, pasta) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: pasta, overwrite: true, resource_type: 'image' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

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

// ── Admin: upload de foto ─────────────────────────────────────
// Multer usa memória (sem gravar no disco) — Cloudinary cuida do armazenamento
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/admin/upload', authMiddleware, upload.single('foto'), async (req, res) => {
  try {
    const { nome, preco, tipo, categoria } = req.body;

    // Gera slug para usar como public_id no Cloudinary
    const slug = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const publicId = `${slug}-${Date.now()}`;
    const bufferOriginal = req.file.buffer;

    // 1. Sobe original (sem marca) para Cloudinary — pasta "originais"
    const resultOriginal = await uploadParaCloudinary(
      bufferOriginal,
      publicId,
      'guilherme-fialho/originais'
    );

    // 2. Gera buffer com marca d'água e sobe — pasta "preview"
    const bufferComMarca = await gerarBufferComMarca(bufferOriginal);
    const resultPreview  = await uploadParaCloudinary(
      bufferComMarca,
      publicId,
      'guilherme-fialho/preview'
    );

    const id = `${tipo === 'artistica' ? 'adm' : 'adme'}-${Date.now()}`;

    const novaFoto = {
      id,
      categoria: tipo,
      nome,
      preco: parseFloat(preco),
      preview: resultPreview.secure_url,   // URL com marca d'água (exibição no site)
      urlOriginal: resultOriginal.secure_url, // URL original (download após pagamento)
      publicId,
      arquivo: publicId,
      ...(tipo === 'artistica' ? { categoriaArtId: categoria } : { eventoId: categoria }),
    };

    const catalogo = carregarCatalogo();
    catalogo.fotos.push(novaFoto);
    salvarCatalogo(catalogo);

    console.log(`✅ Foto enviada ao Cloudinary (com marca d'água): ${nome}`);
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
app.delete('/api/admin/fotos/:id', authMiddleware, async (req, res) => {
  const catalogo = carregarCatalogo();
  const foto = catalogo.fotos.find(f => f.id === req.params.id);
  if (!foto) return res.status(404).json({ erro: 'Foto não encontrada' });

  catalogo.fotos = catalogo.fotos.filter(f => f.id !== req.params.id);
  salvarCatalogo(catalogo);

  // Remove do Cloudinary (preview e original)
  if (foto.publicId) {
    try {
      await cloudinary.uploader.destroy(`guilherme-fialho/preview/${foto.publicId}`);
      await cloudinary.uploader.destroy(`guilherme-fialho/originais/${foto.publicId}`);
    } catch(e) { console.warn('Erro ao remover do Cloudinary:', e.message); }
  }

  res.json({ ok: true });
});

// ── Catálogo público ─────────────────────────────────────────
app.get('/api/catalogo', (req, res) => {
  const catalogo = carregarCatalogo();
  res.json(catalogo.fotos);
});

// ── Persistência de categorias e eventos dinâmicos ────────────
const CATEGORIAS_PATH = path.join(__dirname, 'categorias.json');

function carregarCategorias() {
  try {
    if (fs.existsSync(CATEGORIAS_PATH))
      return JSON.parse(fs.readFileSync(CATEGORIAS_PATH, 'utf8'));
  } catch(e) {}
  return { eventos: [], artisticas: [] };
}

function salvarCategorias(c) {
  try { fs.writeFileSync(CATEGORIAS_PATH, JSON.stringify(c, null, 2)); } catch(e) {}
}

app.get('/api/categorias', (req, res) => {
  res.json(carregarCategorias());
});

app.post('/api/admin/eventos', authMiddleware, (req, res) => {
  const { id, nome, icone } = req.body;
  if (!id || !nome) return res.status(400).json({ erro: 'id e nome são obrigatórios' });
  const cats = carregarCategorias();
  if (cats.eventos.some(e => e.id === id))
    return res.status(409).json({ erro: 'ID de evento já existe' });
  cats.eventos.push({ id, nome, icone: icone || '' });
  salvarCategorias(cats);
  res.json({ ok: true });
});

app.delete('/api/admin/eventos/:id', authMiddleware, (req, res) => {
  const cats = carregarCategorias();
  cats.eventos = cats.eventos.filter(e => e.id !== req.params.id);
  salvarCategorias(cats);
  res.json({ ok: true });
});

app.post('/api/admin/artisticas', authMiddleware, (req, res) => {
  const { id, nome, icone } = req.body;
  if (!id || !nome) return res.status(400).json({ erro: 'id e nome são obrigatórios' });
  const cats = carregarCategorias();
  if (cats.artisticas.some(c => c.id === id))
    return res.status(409).json({ erro: 'ID de categoria já existe' });
  cats.artisticas.push({ id, nome, icone: icone || '' });
  salvarCategorias(cats);
  res.json({ ok: true });
});

app.delete('/api/admin/artisticas/:id', authMiddleware, (req, res) => {
  const cats = carregarCategorias();
  cats.artisticas = cats.artisticas.filter(c => c.id !== req.params.id);
  salvarCategorias(cats);
  res.json({ ok: true });
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
// Para fotos do Cloudinary, redireciona para a URL original
// Para fotos antigas (disco), mantém compatibilidade
app.get('/download/:token', async (req, res) => {
  const pag = Object.values(pagamentos).find(
    p => p.tokenDownload === req.params.token && p.status === 'approved'
  );
  if (!pag) return res.status(403).send('Link inválido ou expirado.');

  // Suporta múltiplas fotos — envia a primeira (ou adapte para zip futuramente)
  const item = pag.itens[0];

  // Se a foto tem URL do Cloudinary, redireciona para o original
  if (item.urlOriginal) {
    return res.redirect(item.urlOriginal);
  }

  // Fallback para fotos antigas no disco
  const caminhos = [
    path.join(__dirname, '../downloads/artisticas', item.arquivo),
    path.join(__dirname, '../downloads', item.arquivo),
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