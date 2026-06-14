// ============================================================
// FACIAL.JS — Reconhecimento facial ("Encontre suas fotos")
//
// Funciona 100% no navegador do visitante, usando a biblioteca
// face-api.js (carregada sob demanda via CDN). A selfie do
// visitante NUNCA é enviada para o servidor — apenas as fotos
// públicas do site são comparadas localmente, no navegador dele.
// ============================================================

// CDN da biblioteca e dos modelos pré-treinados (TinyFaceDetector,
// landmarks 68 pontos e reconhecimento facial). Para maior
// confiabilidade em produção, esses arquivos podem ser baixados e
// hospedados em /frontend/models/ — basta trocar FACE_API_MODELS_URL.
const FACE_API_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const FACE_API_MODELS_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

// Distância máxima (euclidiana) entre descritores para considerar
// que é a mesma pessoa. Valores menores = mais exigente.
const FACIAL_LIMIAR = 0.55;

// Chave usada para cachear, no navegador, os descritores faciais já
// calculados de cada foto do catálogo (evita reprocessar tudo a
// cada nova busca).
const FACIAL_CACHE_KEY = 'facial_descritores_v1';

let facialModelosPromise = null;
let facialStream          = null;
let facialDescritorSelfie = null;
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
      facialModelosPromise = null; // permite tentar de novo numa próxima chamada
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
  // Já começa a carregar os modelos em segundo plano
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
    facialStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
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
  // espelha horizontalmente, já que o preview da câmera é espelhado (selfie)
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

  // Limita o tamanho para a análise ficar rápida
  const MAX = 640;
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
// Detecta o rosto na foto/selfie enviada
// ────────────────────────────────────────────────────────────
async function facialAnalisarCanvas() {
  const status    = document.getElementById('facial-status');
  const btnBuscar = document.getElementById('facial-btn-buscar');
  const faceBox   = document.getElementById('facial-face-box');

  btnBuscar.disabled = true;
  faceBox.classList.add('escondido');
  facialDescritorSelfie = null;

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
    deteccao = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
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

  status.className   = 'facial-status facial-status-sucesso';
  status.textContent = '✅ Rosto identificado! Clique em "Buscar minhas fotos".';
  btnBuscar.disabled = false;
}

// ────────────────────────────────────────────────────────────
// Busca nas fotos do catálogo
// ────────────────────────────────────────────────────────────
function facialCarregarCache() {
  try { return JSON.parse(localStorage.getItem(FACIAL_CACHE_KEY)) || {}; }
  catch (e) { return {}; }
}

function facialSalvarCache(cache) {
  try { localStorage.setItem(FACIAL_CACHE_KEY, JSON.stringify(cache)); }
  catch (e) { /* localStorage cheio ou indisponível — ignora cache */ }
}

function facialCarregarImagemUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // necessário para processar a imagem com canvas/WebGL
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function facialBuscar() {
  if (!facialDescritorSelfie || facialBuscando) return;
  facialBuscando = true;

  const status    = document.getElementById('facial-status');
  const btnBuscar = document.getElementById('facial-btn-buscar');
  btnBuscar.disabled = true;

  // Fotos candidatas: prioriza fotos de eventos (onde aparecem pessoas)
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
  const resultados = [];

  for (let i = 0; i < candidatas.length; i++) {
    const produto = candidatas[i];
    status.className   = 'facial-status facial-status-aguardando';
    status.textContent = `🔄 Analisando fotos do site... (${i + 1}/${candidatas.length})`;

    try {
      let descritores = cache[produto.id];

      if (!descritores) {
        const img = await facialCarregarImagemUrl(produto.preview);
        const deteccoes = await faceapi
          .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        descritores = deteccoes.map(d => Array.from(d.descriptor));
        cache[produto.id] = descritores;
        facialSalvarCache(cache);
      }

      if (!descritores.length) continue;

      let menorDistancia = Infinity;
      descritores.forEach(desc => {
        const dist = faceapi.euclideanDistance(facialDescritorSelfie, new Float32Array(desc));
        if (dist < menorDistancia) menorDistancia = dist;
      });

      if (menorDistancia <= FACIAL_LIMIAR) {
        const similaridade = Math.max(0, Math.min(100,
          Math.round((1 - menorDistancia / FACIAL_LIMIAR) * 50 + 50)
        ));
        resultados.push({ produto, similaridade });
      }
    } catch (e) {
      // Imagem com erro de CORS, fora do ar, etc. — pula e segue
      console.warn('Erro ao analisar foto', produto.nome, e);
    }
  }

  resultados.sort((a, b) => b.similaridade - a.similaridade);
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
        Pode ser que suas fotos ainda não tenham sido publicadas, ou tente novamente com outra foto.
      </div>`;
    return;
  }

  achouEl.innerHTML =
    `Encontramos <strong>${resultados.length}</strong> foto${resultados.length > 1 ? 's' : ''} com você! 🎉`;

  grade.innerHTML = resultados.map(({ produto, similaridade }) => {
    const noCarrinho = carrinho.some(i => i.id === produto.id);
    return `
      <div class="facial-card">
        <div class="facial-card-img">
          <img src="${produto.preview}" alt="${produto.nome}" loading="lazy"
               onclick="abrirPreview('${produto.id}')" style="cursor:zoom-in"/>
          <span class="facial-similaridade">${similaridade}% parecido</span>
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

// ────────────────────────────────────────────────────────────
// Integração com fecharTudo() do app.js
// ────────────────────────────────────────────────────────────
const _fecharTudoOriginal = window.fecharTudo;
window.fecharTudo = function() {
  fecharReconhecimento();
  if (_fecharTudoOriginal) _fecharTudoOriginal();
};