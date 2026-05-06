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
  // Cloudinary usa sintaxe própria para texto: espaços viram '_', '%' proibido
  // O símbolo © precisa ser omitido ou substituído por texto ASCII puro
  const textoMarca = 'Guilherme Fialho Soares'; // sem © para evitar encoding inválido
  // Substitui espaços por underline conforme sintaxe do Cloudinary
  const textoCloudinary = textoMarca.replace(/ /g, '_');

  return cloudinary.url(publicIdCompleto, {
    secure: true,
    transformation: [
      {
        overlay: {
          font_family: 'Arial',
          font_size: 24,
          font_weight: 'bold',
          text: textoCloudinary,
        },
        color: 'white',
        opacity: 40,
        angle: -30,
        flags: 'tiled',
      },
      { flags: 'layer_apply' },
    ],
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
    const { nome, preco, tipo, categoria } = req.body;

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

  const linksHTML = pag.itens.map((item, i) => {
    let href = '';
    if (item.urlOriginal) {
      href = item.urlOriginal;
    } else {
      const caminhos = [
        path.join(__dirname, '../downloads/artisticas', item.arquivo),
        path.join(__dirname, '../downloads', item.arquivo),
      ];
      const caminho = caminhos.find(c => fs.existsSync(c));
      href = caminho ? `/download-arquivo/${req.params.token}/${i}` : '';
    }
    return `
      <div class="foto-item">
        <div class="foto-num">${String(i + 1).padStart(2, '0')}</div>
        <div class="foto-info">
          <div class="foto-nome">${item.nome}</div>
          <div class="foto-preco">R$ ${item.preco.toFixed(2).replace('.', ',')}</div>
        </div>
        ${href
          ? `<a class="btn-baixar" href="${href}" download target="_blank">Baixar</a>`
          : `<span class="btn-indisponivel">Indisponivel</span>`
        }
      </div>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Suas Fotos - Guilherme Fialho Soares</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#f5f4f1;--surface:#fff;--border:#ddd9d3;--accent:#8c7355;--text:#1a1916;--muted:#8a8680;--success:#3a7a58}
    body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:2rem 1rem}
    .container{max-width:620px;margin:0 auto}
    .header{text-align:center;margin-bottom:2.5rem}
    .icone{font-size:2.5rem;margin-bottom:1rem}
    h1{font-size:1.5rem;font-weight:300;margin-bottom:0.4rem}
    .header p{font-size:0.85rem;color:var(--muted)}
    .badge-pago{display:inline-block;background:rgba(58,122,88,0.1);border:1px solid var(--success);color:var(--success);font-family:'DM Mono',monospace;font-size:0.68rem;letter-spacing:0.1em;padding:0.3rem 0.8rem;text-transform:uppercase;margin-bottom:1.5rem}
    .lista{display:flex;flex-direction:column;gap:0.75rem;margin-bottom:2rem}
    .foto-item{background:var(--surface);border:1px solid var(--border);padding:1rem 1.25rem;display:flex;align-items:center;gap:1rem}
    .foto-num{font-family:'DM Mono',monospace;font-size:0.7rem;color:var(--muted);flex-shrink:0;width:24px}
    .foto-info{flex:1;min-width:0}
    .foto-nome{font-size:0.9rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .foto-preco{font-size:0.75rem;color:var(--muted);font-family:'DM Mono',monospace;margin-top:0.15rem}
    .btn-baixar{flex-shrink:0;background:var(--accent);color:#fff;text-decoration:none;padding:0.5rem 1rem;font-family:'DM Mono',monospace;font-size:0.7rem;letter-spacing:0.06em;text-transform:uppercase;transition:opacity 0.2s;white-space:nowrap}
    .btn-baixar:hover{opacity:0.85}
    .btn-indisponivel{flex-shrink:0;font-size:0.72rem;color:var(--muted);font-family:'DM Mono',monospace}
    .aviso{background:rgba(140,115,85,0.07);border:1px solid var(--border);padding:1rem 1.25rem;font-size:0.8rem;color:var(--muted);line-height:1.6;text-align:center}
    .footer{text-align:center;margin-top:2.5rem;font-size:0.75rem;color:var(--muted)}
    .footer a{color:var(--accent);text-decoration:none}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icone">📷</div>
      <div class="badge-pago">✓ Pagamento confirmado</div>
      <h1>Suas fotos estao prontas!</h1>
      <p>Clique em <strong>Baixar</strong> em cada foto para salvar no seu dispositivo.</p>
    </div>
    <div class="lista">${linksHTML}</div>
    <div class="aviso">
      Guarde este link — ele da acesso permanente as suas fotos.<br/>
      Em caso de duvidas, entre em contato com o fotografo.
    </div>
    <div class="footer">
      <p>2025 Guilherme Fialho Soares &nbsp;·&nbsp;
        <a href="https://guilhermefialhosoaresfotografia.myportfolio.com/" target="_blank">Ver portfolio</a>
      </p>
    </div>
  </div>
</body>
</html>`);
});

app.get('/download-arquivo/:token/:index', (req, res) => {
  const pag = Object.values(pagamentos).find(
    p => p.tokenDownload === req.params.token && p.status === 'approved'
  );
  if (!pag) return res.status(403).send('Link invalido ou expirado.');
  const item = pag.itens[parseInt(req.params.index)];
  if (!item) return res.status(404).send('Foto nao encontrada.');
  const caminhos = [
    path.join(__dirname, '../downloads/artisticas', item.arquivo),
    path.join(__dirname, '../downloads', item.arquivo),
  ];
  const caminho = caminhos.find(c => fs.existsSync(c));
  if (!caminho) return res.status(404).send('Arquivo nao encontrado.');
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