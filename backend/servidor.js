require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const { criarCobrancaPix, consultarPagamento } = require('./pagamento');

// ── Cloudinary config ─────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadParaCloudinary(buffer, publicId, pasta) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: pasta, overwrite: true, resource_type: 'image' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

function urlComMarcaDagua(publicIdCompleto) {
  return cloudinary.url(publicIdCompleto, {
    transformation: [
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 0, y: 0 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 200, y: 0 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 400, y: 0 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 600, y: 0 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 800, y: 0 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 0, y: 160 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 200, y: 160 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 400, y: 160 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 600, y: 160 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 800, y: 160 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 0, y: 320 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 200, y: 320 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 400, y: 320 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 600, y: 320 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 800, y: 320 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 0, y: 480 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 200, y: 480 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 400, y: 480 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 600, y: 480 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 800, y: 480 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 0, y: 640 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 200, y: 640 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 400, y: 640 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 600, y: 640 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 800, y: 640 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 0, y: 800 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 200, y: 800 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 400, y: 800 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 600, y: 800 },
      { overlay: { font_family: 'Arial', font_size: 22, font_weight: 'bold', text: '© Guilherme Fialho Soares' }, color: 'white', opacity: 45, angle: -30, gravity: 'north_west', x: 800, y: 800 },
    ],
    secure: true,
  });
}
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// ── Helpers de persistência ──────────────────────────────────
function lerJSON(arquivo, padrao) {
  try {
    if (fs.existsSync(arquivo)) return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch(e) {}
  return padrao;
}

function salvarJSON(arquivo, dados) {
  try { fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2)); } catch(e) {}
}

const PAGAMENTOS_PATH  = path.join(__dirname, 'pagamentos.json');
const CATALOGO_PATH    = path.join(__dirname, 'catalogo.json');
const ESTRUTURA_PATH   = path.join(__dirname, 'estrutura.json');

const pagamentos = lerJSON(PAGAMENTOS_PATH, {});

// Estrutura padrão (espelho do produto.js)
const estruturaPadrao = {
  eventos: [
  ],
  categorias: [
    { id: 'paisagens',   nome: 'Paisagens'    },
    { id: 'animais',     nome: 'Animais'      },
    { id: 'luar',        nome: 'Luar'         },
    { id: 'natureza',    nome: 'Natureza'     },
    { id: 'serra',       nome: 'Serra Gaúcha' },
    { id: 'arquitetura', nome: 'Arquitetura'  },
  ],
};

// ── Auth ─────────────────────────────────────────────────────
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'guilherme2025';
const tokens = new Set();

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || !tokens.has(token)) return res.status(401).json({ erro: 'Não autorizado' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (req.body.senha === ADMIN_SENHA) {
    const token = crypto.randomBytes(32).toString('hex');
    tokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ erro: 'Senha incorreta' });
});

app.get('/api/admin/verificar', authMiddleware, (req, res) => res.json({ ok: true }));

// ── Upload ───────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/admin/upload', authMiddleware, upload.single('foto'), async (req, res) => {
  try {
    const { preco, tipo, categoria } = req.body;

    // Limpa nome: remove timestamps WhatsApp, IDs numericos e sujeira
    const nome = (req.body.nome || '')
      .replace(/whatsapp\s*image\s*/gi, '')
      .replace(/\d{4}[\s\-]\d{2}[\s\-]\d{2}.*/i, '')
      .replace(/\bat\s+[\d\.]+/gi, '')
      .replace(/\b\d{7,}\b/g, '')
      .replace(/[-_\s]+/g, ' ').trim()
      || 'Foto sem titulo';

    const slug = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const publicId = `${slug}-${Date.now()}`;

    const resultOriginal = await uploadParaCloudinary(
      req.file.buffer, publicId, 'guilherme-fialho/originais'
    );

    const previewUrl = urlComMarcaDagua(`guilherme-fialho/originais/${publicId}`);

    const novaFoto = {
      id: `adm-${Date.now()}`,
      categoria: tipo, nome,
      preco: parseFloat(preco),
      preview: previewUrl,
      urlOriginal: resultOriginal.secure_url,
      publicId, arquivo: publicId,
      ...(tipo === 'artistica' ? { categoriaArtId: categoria } : { eventoId: categoria }),
    };

    const catalogo = lerJSON(CATALOGO_PATH, { fotos: [] });
    catalogo.fotos.push(novaFoto);
    salvarJSON(CATALOGO_PATH, catalogo);

    console.log(`✅ Foto enviada ao Cloudinary: ${nome}`);
    res.json({ ok: true, foto: novaFoto });
  } catch(e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

// ── Admin: fotos ─────────────────────────────────────────────
app.get('/api/admin/fotos', authMiddleware, (req, res) => {
  const { categoria } = req.query;
  let fotos = lerJSON(CATALOGO_PATH, { fotos: [] }).fotos;
  if (categoria) fotos = fotos.filter(f =>
    f.categoriaArtId === categoria || f.eventoId === categoria || f.categoria === categoria
  );
  res.json(fotos);
});

app.delete('/api/admin/fotos/:id', authMiddleware, async (req, res) => {
  const catalogo = lerJSON(CATALOGO_PATH, { fotos: [] });
  const foto = catalogo.fotos.find(f => f.id === req.params.id);
  if (!foto) return res.status(404).json({ erro: 'Foto não encontrada' });

  catalogo.fotos = catalogo.fotos.filter(f => f.id !== req.params.id);
  salvarJSON(CATALOGO_PATH, catalogo);

  if (foto.publicId) {
    try { await cloudinary.uploader.destroy(`guilherme-fialho/originais/${foto.publicId}`); } catch(e) {}
  }

  res.json({ ok: true });
});

// ── Catálogo público ─────────────────────────────────────────
app.get('/api/catalogo', (req, res) => {
  res.json(lerJSON(CATALOGO_PATH, { fotos: [] }).fotos);
});

// ── Estrutura pública (eventos + categorias) ─────────────────
app.get('/api/estrutura', (req, res) => {
  res.json(lerJSON(ESTRUTURA_PATH, estruturaPadrao));
});

// ── Admin: eventos ───────────────────────────────────────────
app.get('/api/admin/eventos', authMiddleware, (req, res) => {
  res.json(lerJSON(ESTRUTURA_PATH, estruturaPadrao).eventos);
});

app.post('/api/admin/eventos', authMiddleware, (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
  const estrutura = lerJSON(ESTRUTURA_PATH, estruturaPadrao);
  const id = nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (estrutura.eventos.some(e => e.id === id))
    return res.status(400).json({ erro: 'Evento já existe' });
  estrutura.eventos.push({ id, nome });
  salvarJSON(ESTRUTURA_PATH, estrutura);
  res.json({ ok: true, id, nome });
});

app.delete('/api/admin/eventos/:id', authMiddleware, (req, res) => {
  const estrutura = lerJSON(ESTRUTURA_PATH, estruturaPadrao);
  estrutura.eventos = estrutura.eventos.filter(e => e.id !== req.params.id);
  salvarJSON(ESTRUTURA_PATH, estrutura);
  res.json({ ok: true });
});

// ── Admin: categorias ────────────────────────────────────────
app.get('/api/admin/categorias', authMiddleware, (req, res) => {
  res.json(lerJSON(ESTRUTURA_PATH, estruturaPadrao).categorias);
});

app.post('/api/admin/categorias', authMiddleware, (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
  const estrutura = lerJSON(ESTRUTURA_PATH, estruturaPadrao);
  const id = nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (estrutura.categorias.some(c => c.id === id))
    return res.status(400).json({ erro: 'Categoria já existe' });
  estrutura.categorias.push({ id, nome });
  salvarJSON(ESTRUTURA_PATH, estrutura);
  res.json({ ok: true, id, nome });
});

app.delete('/api/admin/categorias/:id', authMiddleware, (req, res) => {
  const estrutura = lerJSON(ESTRUTURA_PATH, estruturaPadrao);
  estrutura.categorias = estrutura.categorias.filter(c => c.id !== req.params.id);
  salvarJSON(ESTRUTURA_PATH, estrutura);
  res.json({ ok: true });
});

// ── Pix ──────────────────────────────────────────────────────
app.post('/api/criar-pix', async (req, res) => {
  const { itens, total, emailComprador } = req.body;
  if (!itens || !emailComprador || !total)
    return res.status(400).json({ erro: 'itens, total e emailComprador são obrigatórios' });
  try {
    const descricao = itens.length === 1 ? itens[0].nome : `${itens.length} fotos - Guilherme Fialho`;
    const cobranca = await criarCobrancaPix({ valor: total, descricao, emailComprador });
    pagamentos[cobranca.id] = { itens, emailComprador, status: 'pending' };
    salvarJSON(PAGAMENTOS_PATH, pagamentos);
    res.json(cobranca);
  } catch(erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/api/status/:id', async (req, res) => {
  try {
    const dados = await consultarPagamento(req.params.id);
    if (dados.status === 'approved' && pagamentos[req.params.id]) {
      const pag = pagamentos[req.params.id];
      pag.status = 'approved';
      if (!pag.tokenDownload) {
        pag.tokenDownload = crypto.randomBytes(32).toString('hex');
        salvarJSON(PAGAMENTOS_PATH, pagamentos);
      }
      return res.json({ ...dados, linkDownload: `/download/${pag.tokenDownload}` });
    }
    res.json(dados);
  } catch(erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/download/:token', async (req, res) => {
  const pag = Object.values(pagamentos).find(
    p => p.tokenDownload === req.params.token && p.status === 'approved'
  );
  if (!pag) return res.status(403).send('Link inválido ou expirado.');

  const item = pag.itens[0];

  if (item.urlOriginal) return res.redirect(item.urlOriginal);

  const caminhos = [
    path.join(__dirname, '../downloads/artisticas', item.arquivo),
    path.join(__dirname, '../downloads', item.arquivo),
  ];
  const caminho = caminhos.find(c => fs.existsSync(c));
  if (!caminho) return res.status(404).send('Arquivo não encontrado.');
  res.download(caminho);
});

app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;
  if (type === 'payment') {
    try {
      const pag = await consultarPagamento(data.id);
      if (pag.status === 'approved' && pagamentos[data.id]) {
        pagamentos[data.id].status = 'approved';
        salvarJSON(PAGAMENTOS_PATH, pagamentos);
      }
    } catch(e) {}
  }
  res.sendStatus(200);
});

app.post('/api/reconhecimento', (req, res) => res.json({ fotosEncontradas: [] }));

app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Servidor: http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});