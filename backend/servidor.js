require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const { criarCobrancaPix, consultarPagamento } = require('./pagamento');

// ── Reconhecimento facial ─────────────────────────────────────
// Importações opcionais — só ativas se o pacote estiver instalado
let faceapi, canvas;
let modelosCarregados = false;
let descritoresFotos  = null; // cache dos descritores já computados

try {
  faceapi = require('@vladmandic/face-api');
  canvas  = require('canvas');
  const { Canvas, Image, ImageData } = canvas;
  faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
} catch (e) {
  console.warn('⚠️  face-api não instalado. Rota /api/reconhecimento usará fallback por nome.');
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

const pagamentos = {};

// ── Carrega modelos face-api (uma vez) ───────────────────────
async function garantirModelos() {
  if (!faceapi || modelosCarregados) return;
  const MODELS = path.join(__dirname, 'modelos');
  await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
  modelosCarregados = true;
  console.log('✅ Modelos face-api carregados');
}

// ── Computa descritores de todas as fotos do catálogo ────────
async function computarDescritoresFotos() {
  if (descritoresFotos) return descritoresFotos;

  // Importa PRODUTOS dinamicamente do arquivo produto.js do frontend
  // Ajuste o caminho conforme sua estrutura
  const produtoPath = path.join(__dirname, '../frontend/produto.js');
  let produtos = [];

  if (fs.existsSync(produtoPath)) {
    // Lê o arquivo e extrai o array PRODUTOS via eval seguro
    const conteudo = fs.readFileSync(produtoPath, 'utf8');
    const match = conteudo.match(/const PRODUTOS\s*=\s*(\[[\s\S]*?\]);/);
    if (match) {
      try { produtos = eval(match[1]); } catch(e) { produtos = []; }
    }
  }

  const resultados = [];

  for (const produto of produtos) {
    const caminhoImg = path.join(__dirname, '../downloads', produto.arquivo);
    if (!fs.existsSync(caminhoImg)) continue;

    try {
      const img = await canvas.loadImage(caminhoImg);
      const deteccao = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (deteccao) {
        resultados.push({
          id:       produto.id,
          nome:     produto.nome,
          arquivo:  produto.arquivo,
          descritor: Array.from(deteccao.descriptor),
        });
        console.log(`  ✓ Rosto indexado: ${produto.nome}`);
      }
    } catch (e) {
      console.warn(`  ⚠ Não foi possível processar ${produto.arquivo}:`, e.message);
    }
  }

  descritoresFotos = resultados;
  console.log(`📸 ${resultados.length} fotos com rostos indexadas`);
  return resultados;
}

// ── Distância euclidiana entre dois descritores ───────────────
function distanciaEuclidiana(a, b) {
  return Math.sqrt(a.reduce((soma, val, i) => soma + Math.pow(val - b[i], 2), 0));
}

// ── POST /api/reconhecimento ─────────────────────────────────
app.post('/api/reconhecimento', async (req, res) => {
  const { descritor } = req.body;

  if (!descritor || !Array.isArray(descritor)) {
    return res.status(400).json({ erro: 'Descritor facial inválido' });
  }

  // Fallback: face-api não instalado no servidor
  // Retorna array vazio (a detecção facial aconteceu no browser)
  if (!faceapi) {
    console.warn('face-api não disponível no servidor. Usando fallback básico.');
    return res.json({ fotosEncontradas: [] });
  }

  try {
    await garantirModelos();
    const fotos = await computarDescritoresFotos();

    const LIMIAR = 0.55; // menor = mais restritivo (0.4–0.6 é um bom intervalo)

    const resultados = fotos
      .map(foto => ({
        id:          foto.id,
        nome:        foto.nome,
        distancia:   distanciaEuclidiana(descritor, foto.descritor),
        similaridade: 0,
      }))
      .filter(f => f.distancia < LIMIAR)
      .map(f => ({
        ...f,
        similaridade: Math.max(0, 1 - f.distancia / LIMIAR),
      }))
      .sort((a, b) => a.distancia - b.distancia);

    console.log(`🔍 Reconhecimento: ${resultados.length} fotos encontradas`);
    res.json({ fotosEncontradas: resultados });

  } catch (erro) {
    console.error('Erro no reconhecimento:', erro.message);
    res.status(500).json({ erro: 'Erro interno no reconhecimento facial' });
  }
});

// ── POST /api/reconhecimento/reindexar ───────────────────────
// Chame este endpoint sempre que adicionar novas fotos ao catálogo
app.post('/api/reconhecimento/reindexar', async (req, res) => {
  descritoresFotos = null; // força recomputação
  try {
    await garantirModelos();
    const fotos = await computarDescritoresFotos();
    res.json({ indexadas: fotos.length });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── POST /api/criar-pix ──────────────────────────────────────
app.post('/api/criar-pix', async (req, res) => {
  const { itens, total, emailComprador } = req.body;

  if (!itens || !emailComprador || !total) {
    return res.status(400).json({ erro: 'itens, total e emailComprador são obrigatórios' });
  }

  try {
    const descricao = itens.length === 1
      ? itens[0].nome
      : `${itens.length} fotos - Minha Loja`;

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

  if (pagamento.itens.length === 1) {
    const arquivo = pagamento.itens[0].arquivo;
    const caminho = path.join(__dirname, '../downloads', arquivo);
    if (!fs.existsSync(caminho)) return res.status(404).send('Arquivo não encontrado.');
    return res.download(caminho);
  }

  const arquivo = pagamento.itens[0].arquivo;
  const caminho = path.join(__dirname, '../downloads', arquivo);
  if (!fs.existsSync(caminho)) return res.status(404).send('Arquivo não encontrado.');
  res.download(caminho);
});

// ── POST /api/webhook ────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;
  if (type === 'payment') {
    const pag = await consultarPagamento(data.id);
    if (pag.status === 'approved' && pagamentos[data.id]) {
      pagamentos[data.id].status = 'approved';
      console.log(`Webhook: pagamento ${data.id} aprovado!`);
    }
  }
  res.sendStatus(200);
});

// Inicia indexação de rostos em background ao subir o servidor
if (faceapi) {
  garantirModelos()
    .then(() => computarDescritoresFotos())
    .catch(e => console.warn('Indexação inicial falhou:', e.message));
}

app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Servidor: http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
