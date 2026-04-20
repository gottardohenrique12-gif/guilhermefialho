// ============================================================
// FACIAL.JS — Reconhecimento facial com face-api.js
// ============================================================
// Fluxo:
//  1. Usuário abre o modal e escolhe câmera ou upload
//  2. face-api.js detecta o rosto na selfie (no navegador)
//  3. O descritor facial é enviado ao servidor via /api/reconhecimento
//  4. O servidor compara com os descritores pré-computados das fotos
//  5. Os resultados (fotos onde a pessoa aparece) são exibidos
// ============================================================

const MODELOS_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

let streamCamera = null;
let modelosCarregados = false;
let descritorselfie = null;

// ── Carrega os modelos da face-api.js ────────────────────────
async function carregarModelos() {
  if (modelosCarregados) return;
  atualizarStatus('⏳ Carregando modelos de reconhecimento...', 'aguardando');
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELOS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELOS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELOS_URL),
    ]);
    modelosCarregados = true;
  } catch (e) {
    atualizarStatus('❌ Erro ao carregar modelos. Verifique sua conexão.', 'erro');
    throw e;
  }
}

// ── Abre o modal de reconhecimento ──────────────────────────
function abrirReconhecimento() {
  voltarEtapa1();
  document.getElementById('modal-facial').classList.remove('escondido');
  document.getElementById('overlay').classList.remove('escondido');
}

function fecharReconhecimento() {
  pararCamera();
  document.getElementById('modal-facial').classList.add('escondido');
  document.getElementById('overlay').classList.add('escondido');
}

// ── Navegação entre etapas ───────────────────────────────────
function mostrarEtapa(etapa) {
  ['facial-etapa-1', 'facial-etapa-camera', 'facial-etapa-preview', 'facial-etapa-resultados']
    .forEach(id => document.getElementById(id).classList.add('escondido'));
  document.getElementById(etapa).classList.remove('escondido');
}

function voltarEtapa1() {
  pararCamera();
  descritorselfie = null;
  mostrarEtapa('facial-etapa-1');
  document.getElementById('facial-status').textContent = '';
  document.getElementById('facial-face-box').classList.add('escondido');
  // Limpa canvas
  const canvas = document.getElementById('facial-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ── Câmera ───────────────────────────────────────────────────
async function usarCamera() {
  mostrarEtapa('facial-etapa-camera');
  try {
    streamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    document.getElementById('facial-video').srcObject = streamCamera;
  } catch (e) {
    alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    mostrarEtapa('facial-etapa-1');
  }
}

function pararCamera() {
  if (streamCamera) {
    streamCamera.getTracks().forEach(t => t.stop());
    streamCamera = null;
  }
}

function cancelarCamera() {
  pararCamera();
  mostrarEtapa('facial-etapa-1');
}

async function capturarFoto() {
  const video = document.getElementById('facial-video');
  const canvas = document.getElementById('facial-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  pararCamera();
  mostrarEtapa('facial-etapa-preview');
  await detectarRosto();
}

// ── Upload de arquivo ────────────────────────────────────────
async function processarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const img = await carregarImagem(file);
  const canvas = document.getElementById('facial-canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);

  mostrarEtapa('facial-etapa-preview');
  await detectarRosto();

  // Limpa o input para permitir re-upload do mesmo arquivo
  event.target.value = '';
}

function carregarImagem(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Detecta o rosto na selfie ────────────────────────────────
async function detectarRosto() {
  atualizarStatus('⏳ Carregando modelos...', 'aguardando');
  document.getElementById('btn-buscar').disabled = true;

  try {
    await carregarModelos();
    atualizarStatus('🔍 Detectando rosto...', 'aguardando');

    const canvas = document.getElementById('facial-canvas');
    const deteccao = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!deteccao) {
      atualizarStatus('❌ Nenhum rosto detectado. Tente com uma foto mais clara e centralizada.', 'erro');
      return;
    }

    descritorselfie = Array.from(deteccao.descriptor);
    desenharCaixaRosto(deteccao.detection.box, canvas);
    atualizarStatus('✅ Rosto detectado! Clique em "Buscar minhas fotos".', 'sucesso');
    document.getElementById('btn-buscar').disabled = false;

  } catch (e) {
    console.error(e);
    atualizarStatus('❌ Erro ao processar a imagem. Tente novamente.', 'erro');
  }
}

// ── Desenha caixa ao redor do rosto ─────────────────────────
function desenharCaixaRosto(box, canvas) {
  const faceBox = document.getElementById('facial-face-box');
  const containerRect = canvas.getBoundingClientRect();
  const scaleX = canvas.offsetWidth / canvas.width;
  const scaleY = canvas.offsetHeight / canvas.height;

  faceBox.style.left   = (box.x * scaleX) + 'px';
  faceBox.style.top    = (box.y * scaleY) + 'px';
  faceBox.style.width  = (box.width * scaleX) + 'px';
  faceBox.style.height = (box.height * scaleY) + 'px';
  faceBox.classList.remove('escondido');
}

// ── Envia ao servidor e exibe resultados ─────────────────────
async function buscarFotos() {
  if (!descritorselfie) return;

  atualizarStatus('🔍 Buscando suas fotos...', 'aguardando');
  document.getElementById('btn-buscar').disabled = true;

  try {
    const resposta = await fetch('/api/reconhecimento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descritor: descritorselfie }),
    });

    if (!resposta.ok) throw new Error('Erro no servidor');
    const dados = await resposta.json();

    exibirResultados(dados.fotosEncontradas);

  } catch (e) {
    console.error(e);
    atualizarStatus('❌ Erro ao buscar fotos. Tente novamente.', 'erro');
    document.getElementById('btn-buscar').disabled = false;
  }
}

// ── Exibe os resultados ──────────────────────────────────────
function exibirResultados(fotosEncontradas) {
  mostrarEtapa('facial-etapa-resultados');

  const header = document.getElementById('facial-resultados-header');
  const grade  = document.getElementById('facial-resultados-grade');

  if (!fotosEncontradas || fotosEncontradas.length === 0) {
    header.innerHTML = '<p class="facial-sem-resultado">😔 Não encontramos fotos suas no catálogo.</p>';
    grade.innerHTML = '';
    return;
  }

  header.innerHTML = `<p class="facial-achou">🎉 Encontramos <strong>${fotosEncontradas.length}</strong> foto${fotosEncontradas.length > 1 ? 's' : ''} sua${fotosEncontradas.length > 1 ? 's' : ''}!</p>`;

  grade.innerHTML = fotosEncontradas.map(foto => {
    const produto = PRODUTOS.find(p => p.id === foto.id);
    if (!produto) return '';
    const noCarrinho = carrinho.some(i => i.id === produto.id);
    return `
      <div class="facial-card">
        <div class="facial-card-img">
          <img src="${produto.preview}" alt="${produto.nome}" loading="lazy"/>
          <div class="facial-similaridade">${Math.round(foto.similaridade * 100)}% similar</div>
        </div>
        <div class="facial-card-info">
          <span>${produto.nome}</span>
          <div class="facial-card-rodape">
            <strong>R$ ${produto.preco.toFixed(2).replace('.', ',')}</strong>
            <button
              class="btn-adicionar ${noCarrinho ? 'no-carrinho' : ''}"
              onclick="toggleCarrinho('${produto.id}'); atualizarBotaoFacial('${produto.id}')"
              id="facial-btn-${produto.id}">
              ${noCarrinho ? '✓ Adicionado' : '+ Carrinho'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function atualizarBotaoFacial(id) {
  const noCarrinho = carrinho.some(i => i.id === id);
  const btn = document.getElementById(`facial-btn-${id}`);
  if (btn) {
    btn.textContent = noCarrinho ? '✓ Adicionado' : '+ Carrinho';
    btn.className = `btn-adicionar ${noCarrinho ? 'no-carrinho' : ''}`;
  }
}

// ── Helpers ──────────────────────────────────────────────────
function atualizarStatus(msg, tipo) {
  const el = document.getElementById('facial-status');
  el.textContent = msg;
  el.className = `facial-status facial-status-${tipo}`;
}

// Sobreescreve fecharTudo para incluir o modal facial
const _fecharTudoOriginal = window.fecharTudo;
window.fecharTudo = function() {
  fecharReconhecimento();
  if (_fecharTudoOriginal) _fecharTudoOriginal();
};
