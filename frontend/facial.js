// ============================================================
// FACIAL.JS — Reconhecimento facial ("Encontre suas fotos")
//
// Funciona 100% no navegador do visitante, usando a biblioteca
// face-api.js (carregada sob demanda via CDN). A selfie do
// visitante NUNCA é enviada para o servidor — apenas as fotos
// públicas do site são comparadas localmente, no navegador dele.
// ============================================================

const FACE_API_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const FACE_API_MODELS_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

// ── LIMIARES ────────────────────────────────────────────────
// Limiar principal: distância máxima para considerar "mesma pessoa".
// Valores menores = mais restritivo. 0.6 é bom equilíbrio entre
// precisão e recall; usamos 0.62 para capturar mais fotos sem
// gerar muitos falsos positivos.
const FACIAL_LIMIAR = 0.62;

// Limiar relaxado para uma segunda passagem quando o resultado
// principal retorna 0 fotos — captura casos de ângulo/iluminação
// diferentes.
const FACIAL_LIMIAR_RELAXADO = 0.72;

// Cache com versão — mude aqui se alterar parâmetros de detecção
// para forçar recálculo nos navegadores dos visitantes.
const FACIAL_CACHE_KEY = 'facial_descritores_v3';

let facialModelosPromise = null;
let facialStream          = null;
let facialDescritorSelfie = null;    // Float32Array do rosto da selfie
let facialDescritorExtra  = null;    // segundo descritor (rosto cortado/ampliado)
let facialBuscando        = false;

// ────────────────────────────────────────────────────────────
// Carregamento (lazy) da biblioteca + modelos
// ────────────────────────────────────────────────────────────
function facialCarregarScript() {
  return new Promise((resolve, reject) => {
    if (window.faceapi) return resolve();
    const script = document.createElement('script');
    script.src = FACE_API_SCRIPT_URL;
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de reconhecimento facial.'));
    document.head.appendChild(script);
  });
}

function facialCarregarModelos() {
  if (!facialModelosPromise) {
    facialModelosPromise = (async () => {
      await facialCarregarScript();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODELS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODELS_URL),
      ]);
    })().catch(err => {
      facialModelosPromise = null;
      throw err;
    });
  }
  return facialModelosPromise;
}

// ────────────────────────────────────────────────────────────
// Abrir / fechar / reiniciar o modal
// ────────────────────────────────────────────────────────────
function abrirReconhecimento() {
  facialReiniciar();
  document.getElementById('modal-facial').classList.remove('escondido');
  document.getElementById('overlay').classList.remove('escondido');
  facialCarregarModelos().catch(() => {});
}

function fecharReconhecimento() {
  facialPararCamera();
  const modal = document.getElementById('modal-facial');
  if (modal) modal.classList.add('escondido');
}

function facialReiniciar() {
  facialPararCamera();
  facialDescritorSelfie = null;
  facialDescritorExtra  = null;
  facialBuscando = false;

  mostrarPassoFacial('opcoes');

  const status = document.getElementById('facial-status');
  status.textContent = '';
  status.className = 'facial-status facial-status-aguardando';

  document.getElementById('facial-btn-buscar').disabled = true;
  document.getElementById('facial-face-box').classList.add('escondido');
  document.getElementById('facial-input-arquivo').value = '';
}

function mostrarPassoFacial(passo) {
  ['opcoes', 'camera', 'preview', 'resultados'].forEach(p => {
    document.getElementById(`facial-passo-${p}`).classList.toggle('escondido', p !== passo);
  });
}

// ────────────────────────────────────────────────────────────
// Opção: câmera
// ────────────────────────────────────────────────────────────
async function facialEscolherCamera() {
  try {
    // Solicita resolução alta para melhor qualidade do descritor
    facialStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (e) {
    alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    return;
  }
  document.getElementById('facial-video').srcObject = facialStream;
  mostrarPassoFacial('camera');
  facialCarregarModelos().catch(() => {});
}

function facialPararCamera() {
  if (facialStream) {
    facialStream.getTracks().forEach(t => t.stop());
    facialStream = null;
  }
}

function facialCancelarCamera() {
  facialPararCamera();
  mostrarPassoFacial('opcoes');
}

async function facialCapturar() {
  const video  = document.getElementById('facial-video');
  const canvas = document.getElementById('facial-canvas');

  const w = video.videoWidth;
  const h = video.videoHeight;
  canvas.width  = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  // espelha horizontalmente (selfie)
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  facialPararCamera();
  mostrarPassoFacial('preview');
  await facialAnalisarCanvas();
}

// ────────────────────────────────────────────────────────────
// Opção: enviar arquivo
// ────────────────────────────────────────────────────────────
function facialEscolherUpload() {
  document.getElementById('facial-input-arquivo').click();
}

async function facialArquivoSelecionado(event) {
  const file = event.target.files[0];
  if (!file) return;

  let img;
  try {
    img = await facialCarregarImagemDeArquivo(file);
  } catch (e) {
    alert('Não foi possível abrir essa imagem.');
    return;
  }

  const canvas = document.getElementById('facial-canvas');

  // Mantém até 1024px (era 640) para preservar mais detalhe do rosto
  const MAX = 1024;
  let { width, height } = img;
  if (width > MAX || height > MAX) {
    const escala = MAX / Math.max(width, height);
    width  = Math.round(width  * escala);
    height = Math.round(height * escala);
  }
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  mostrarPassoFacial('preview');
  await facialAnalisarCanvas();
}

function facialCarregarImagemDeArquivo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ────────────────────────────────────────────────────────────
// Tenta detectar rosto com múltiplos inputSizes (fallback)
// Retorna a melhor detecção encontrada, ou null.
// ────────────────────────────────────────────────────────────
async function facialDetectarSelfie(canvas) {
  // Tentativas em ordem decrescente de inputSize.
  // inputSize maior = mais preciso mas mais lento; 512 é o máximo permitido.
  const tentativas = [
    { inputSize: 512, scoreThreshold: 0.5 },
    { inputSize: 416, scoreThreshold: 0.4 },
    { inputSize: 320, scoreThreshold: 0.35 },
    { inputSize: 224, scoreThreshold: 0.3  },
  ];

  for (const opts of tentativas) {
    const det = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions(opts))
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (det) return det;
  }
  return null;
}

// Recorta a região do rosto detectado e gera um segundo descritor
// a partir da imagem ampliada — melhora a qualidade do embedding.
async function facialDescritorDoCrop(canvas, box) {
  try {
    const margin = 0.25; // 25% de margem ao redor do rosto
    const x = Math.max(0, Math.round(box.x - box.width  * margin));
    const y = Math.max(0, Math.round(box.y - box.height * margin));
    const w = Math.min(canvas.width  - x, Math.round(box.width  * (1 + 2 * margin)));
    const h = Math.min(canvas.height - y, Math.round(box.height * (1 + 2 * margin)));

    // Cria canvas temporário com apenas o rosto
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width  = 224;
    cropCanvas.height = 224;
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(canvas, x, y, w, h, 0, 0, 224, 224);

    const det = await faceapi
      .detectSingleFace(cropCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.2 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    return det ? det.descriptor : null;
  } catch (e) {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Detecta o rosto na foto/selfie enviada
// ────────────────────────────────────────────────────────────
async function facialAnalisarCanvas() {
  const status    = document.getElementById('facial-status');
  const btnBuscar = document.getElementById('facial-btn-buscar');
  const faceBox   = document.getElementById('facial-face-box');

  btnBuscar.disabled = true;
  faceBox.classList.add('escondido');
  facialDescritorSelfie = null;
  facialDescritorExtra  = null;

  status.className   = 'facial-status facial-status-aguardando';
  status.textContent = '🔄 Carregando reconhecimento facial...';

  try {
    await facialCarregarModelos();
  } catch (e) {
    status.className   = 'facial-status facial-status-erro';
    status.textContent = '❌ ' + e.message;
    return;
  }

  status.textContent = '🔎 Procurando rosto na imagem...';

  const canvas = document.getElementById('facial-canvas');
  let deteccao;
  try {
    deteccao = await facialDetectarSelfie(canvas);
  } catch (e) {
    console.error(e);
    status.className   = 'facial-status facial-status-erro';
    status.textContent = '❌ Erro ao analisar a imagem.';
    return;
  }

  if (!deteccao) {
    status.className   = 'facial-status facial-status-erro';
    status.textContent = '😕 Não encontramos um rosto na imagem. Tente novamente com boa iluminação e o rosto centralizado.';
    return;
  }

  // Posiciona a caixa de destaque sobre o rosto detectado
  const box = deteccao.detection.box;
  const escalaX = canvas.clientWidth  / canvas.width;
  const escalaY = canvas.clientHeight / canvas.height;
  faceBox.style.left   = `${box.x * escalaX}px`;
  faceBox.style.top    = `${box.y * escalaY}px`;
  faceBox.style.width  = `${box.width  * escalaX}px`;
  faceBox.style.height = `${box.height * escalaY}px`;
  faceBox.classList.remove('escondido');

  facialDescritorSelfie = deteccao.descriptor;

  // Gera segundo descritor a partir do crop do rosto (mais preciso)
  facialDescritorExtra = await facialDescritorDoCrop(canvas, box);

  status.className   = 'facial-status facial-status-sucesso';
  status.textContent = '✅ Rosto identificado! Clique em "Buscar minhas fotos".';
  btnBuscar.disabled = false;
}

// ────────────────────────────────────────────────────────────
// Cache de descritores
// ────────────────────────────────────────────────────────────
function facialCarregarCache() {
  try { return JSON.parse(localStorage.getItem(FACIAL_CACHE_KEY)) || {}; }
  catch (e) { return {}; }
}

function facialSalvarCache(cache) {
  try { localStorage.setItem(FACIAL_CACHE_KEY, JSON.stringify(cache)); }
  catch (e) { /* localStorage cheio — ignora */ }
}

function facialCarregarImagemUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ────────────────────────────────────────────────────────────
// Calcula a menor distância entre o descritor da selfie
// (principal + extra) e todos os descritores de uma foto.
// ────────────────────────────────────────────────────────────
function facialMenorDistancia(descritoresFoto) {
  let menorDist = Infinity;

  for (const desc of descritoresFoto) {
    const fa = new Float32Array(desc);

    const d1 = faceapi.euclideanDistance(facialDescritorSelfie, fa);
    if (d1 < menorDist) menorDist = d1;

    // Se temos o descritor do crop, usamos também (média ponderada)
    if (facialDescritorExtra) {
      const d2 = faceapi.euclideanDistance(facialDescritorExtra, fa);
      // Combinação: pega a média dos dois descritores — atenua variações
      const dCombinado = (d1 + d2) / 2;
      if (dCombinado < menorDist) menorDist = dCombinado;
    }
  }

  return menorDist;
}

// ────────────────────────────────────────────────────────────
// Busca nas fotos do catálogo (com segunda passagem relaxada)
// ────────────────────────────────────────────────────────────
async function facialBuscar() {
  if (!facialDescritorSelfie || facialBuscando) return;
  facialBuscando = true;

  const status    = document.getElementById('facial-status');
  const btnBuscar = document.getElementById('facial-btn-buscar');
  btnBuscar.disabled = true;

  const todasFotos = (typeof PRODUTOS !== 'undefined') ? PRODUTOS : [];
  let candidatas = todasFotos.filter(p => p.eventoId);
  if (candidatas.length === 0) candidatas = todasFotos;

  if (candidatas.length === 0) {
    status.className   = 'facial-status facial-status-erro';
    status.textContent = 'Ainda não há fotos publicadas para buscar.';
    facialBuscando = false;
    btnBuscar.disabled = false;
    return;
  }

  const cache = facialCarregarCache();

  // ── Passo 1: detectar todos os rostos das fotos do catálogo ──
  const descritoresPorFoto = {};

  for (let i = 0; i < candidatas.length; i++) {
    const produto = candidatas[i];
    status.className   = 'facial-status facial-status-aguardando';
    status.textContent = `🔄 Analisando fotos do site... (${i + 1}/${candidatas.length})`;

    try {
      let descritores = cache[produto.id];

      if (!descritores) {
        const img = await facialCarregarImagemUrl(produto.preview);

        // Tenta com inputSize alto primeiro para pegar rostos pequenos no fundo
        let deteccoes = await faceapi
          .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.4 }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        // Se não achou nada, tenta com scoreThreshold mais baixo
        if (!deteccoes.length) {
          deteccoes = await faceapi
            .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
            .withFaceLandmarks()
            .withFaceDescriptors();
        }

        descritores = deteccoes.map(d => Array.from(d.descriptor));
        cache[produto.id] = descritores;
        facialSalvarCache(cache);
      }

      descritoresPorFoto[produto.id] = descritores;
    } catch (e) {
      console.warn('Erro ao analisar foto', produto.nome, e);
      descritoresPorFoto[produto.id] = [];
    }
  }

  // ── Passo 2: comparar com limiar principal ──
  let resultados = [];
  for (const produto of candidatas) {
    const descritores = descritoresPorFoto[produto.id];
    if (!descritores || !descritores.length) continue;

    const dist = facialMenorDistancia(descritores);
    if (dist <= FACIAL_LIMIAR) {
      resultados.push({ produto, distancia: dist });
    }
  }

  // ── Passo 3: se não achou nada, segunda passagem com limiar relaxado ──
  if (resultados.length === 0) {
    status.textContent = '🔄 Ampliando a busca...';
    for (const produto of candidatas) {
      const descritores = descritoresPorFoto[produto.id];
      if (!descritores || !descritores.length) continue;

      const dist = facialMenorDistancia(descritores);
      if (dist <= FACIAL_LIMIAR_RELAXADO) {
        resultados.push({ produto, distancia: dist, relaxado: true });
      }
    }
  }

  // Ordena do mais parecido para o menos
  resultados.sort((a, b) => a.distancia - b.distancia);

  facialMostrarResultados(resultados);
  facialBuscando = false;
}

// ────────────────────────────────────────────────────────────
// Exibição dos resultados
// ────────────────────────────────────────────────────────────
function facialMostrarResultados(resultados) {
  mostrarPassoFacial('resultados');

  const achouEl = document.getElementById('facial-achou');
  const grade   = document.getElementById('facial-grade');

  if (resultados.length === 0) {
    achouEl.innerHTML = '';
    grade.innerHTML = `
      <div class="facial-sem-resultado">
        😕 Não encontramos fotos com esse rosto.<br/>
        Pode ser que suas fotos ainda não tenham sido publicadas, ou tente novamente com outra foto com boa iluminação e rosto visível.
      </div>`;
    return;
  }

  const temRelaxado = resultados.some(r => r.relaxado);
  const aviso = temRelaxado
    ? '<p style="font-size:0.85rem;color:#888;margin-bottom:0.5rem;">⚠️ Busca ampliada — pode incluir fotos de outras pessoas parecidas.</p>'
    : '';

  achouEl.innerHTML =
    `${aviso}Encontramos <strong>${resultados.length}</strong> foto${resultados.length > 1 ? 's' : ''} com você! 🎉`;

  // Converte distância em % de similaridade de forma mais natural:
  // dist=0 → 100%, dist=limiar → ~50%, dist=limiarRelaxado → ~30%
  function distParaSimilaridade(dist, relaxado) {
    const limiar = relaxado ? FACIAL_LIMIAR_RELAXADO : FACIAL_LIMIAR;
    return Math.max(30, Math.min(100, Math.round(100 - (dist / limiar) * 50)));
  }

  grade.innerHTML = resultados.map(({ produto, distancia, relaxado }) => {
    const noCarrinho = carrinho.some(i => i.id === produto.id);
    const sim = distParaSimilaridade(distancia, relaxado);
    return `
      <div class="facial-card">
        <div class="facial-card-img">
          <img src="${produto.preview}" alt="${produto.nome}" loading="lazy"
               onclick="abrirPreview('${produto.id}', event)" style="cursor:zoom-in"/>
          <span class="facial-similaridade">${sim}% parecido</span>
        </div>
        <div class="facial-card-info">
          <span>${produto.nome}</span>
          <div class="facial-card-rodape">
            <strong>R$ ${produto.preco.toFixed(2).replace('.', ',')}</strong>
            <button class="btn-adicionar" id="facial-btn-cart-${produto.id}" onclick="facialToggleCarrinho('${produto.id}')">
              ${noCarrinho ? '✓ Adicionado' : '+ Carrinho'}
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function facialToggleCarrinho(id) {
  toggleCarrinho(id);
  const btn = document.getElementById(`facial-btn-cart-${id}`);
  if (!btn) return;
  const noCarrinho = carrinho.some(i => i.id === id);
  btn.textContent = noCarrinho ? '✓ Adicionado' : '+ Carrinho';
}

// fecharTudo() está em app.js e já fecha o modal facial nativamente.