// ============================================================
// APP.JS — Navegação por seções (Eventos / Artísticas) + Carrinho
// ============================================================

let carrinho = [];
let paymentId = null;
let verificacaoInterval;

// Estado de navegação
let secaoAtiva    = 'eventos';       // 'eventos' | 'artisticas'
let eventoAtivo   = null;            // id do evento selecionado
let categoriaAtivaArt = null;        // id da categoria artística selecionada

// ── Inicialização ─────────────────────────────────────────────
function init() {
  // Define a primeira aba de cada seção como ativa
  if (EVENTOS.length > 0)              eventoAtivo       = EVENTOS[0].id;
  if (CATEGORIAS_ARTISTICAS.length > 0) categoriaAtivaArt = CATEGORIAS_ARTISTICAS[0].id;

  renderizarAbas();
  renderizarGrade();
  carregarFotosDinamicas();
}

// ── Troca a seção principal (Eventos ↔ Artísticas) ───────────
function mudarSecao(secao) {
  secaoAtiva = secao;

  // Atualiza botões de navegação
  document.querySelectorAll('.nav-secao-btn').forEach(b => b.classList.remove('ativo'));
  document.getElementById(`nav-btn-${secao}`).classList.add('ativo');

  // Exibe / oculta seções
  document.getElementById('secao-eventos').classList.toggle('escondido', secao !== 'eventos');
  document.getElementById('secao-artisticas').classList.toggle('escondido', secao !== 'artisticas');
}

// ── Renderiza abas ────────────────────────────────────────────
function renderizarAbas() {
  // Abas de eventos
  const abasEventos = document.getElementById('abas-eventos');
  abasEventos.innerHTML = EVENTOS.map(e => `
    <button
      class="aba-btn ${e.id === eventoAtivo ? 'ativo' : ''}"
      onclick="selecionarEvento('${e.id}')"
      id="aba-evento-${e.id}">
      <span>${e.icone}</span>
      <span>${e.nome}</span>
    </button>
  `).join('');

  // Abas de categorias artísticas
  const abasArt = document.getElementById('abas-artisticas');
  abasArt.innerHTML = CATEGORIAS_ARTISTICAS.map(c => `
    <button
      class="aba-btn ${c.id === categoriaAtivaArt ? 'ativo' : ''}"
      onclick="selecionarCategoriaArt('${c.id}')"
      id="aba-art-${c.id}">
      <span>${c.icone}</span>
      <span>${c.nome}</span>
    </button>
  `).join('');
}

// ── Seleciona evento ──────────────────────────────────────────
function selecionarEvento(id) {
  eventoAtivo = id;
  document.querySelectorAll('#abas-eventos .aba-btn').forEach(b => b.classList.remove('ativo'));
  document.getElementById(`aba-evento-${id}`).classList.add('ativo');
  renderizarGradeEventos();
}

// ── Seleciona categoria artística ─────────────────────────────
function selecionarCategoriaArt(id) {
  categoriaAtivaArt = id;
  document.querySelectorAll('#abas-artisticas .aba-btn').forEach(b => b.classList.remove('ativo'));
  document.getElementById(`aba-art-${id}`).classList.add('ativo');
  renderizarGradeArtisticas();
}

// ── Renderiza grade correta conforme seção ────────────────────
function renderizarGrade() {
  renderizarGradeEventos();
  renderizarGradeArtisticas();
}

// ── Grade de eventos ──────────────────────────────────────────
function renderizarGradeEventos() {
  const evento = EVENTOS.find(e => e.id === eventoAtivo);
  const grade  = document.getElementById('grade-eventos');
  if (!evento) { grade.innerHTML = ''; return; }
  grade.innerHTML = '';
  evento.fotos.forEach(produto => {
    grade.appendChild(criarCard(produto));
  });
}

// ── Grade artísticas ──────────────────────────────────────────
function renderizarGradeArtisticas() {
  const cat   = CATEGORIAS_ARTISTICAS.find(c => c.id === categoriaAtivaArt);
  const grade = document.getElementById('grade-artisticas');
  if (!cat) { grade.innerHTML = ''; return; }
  grade.innerHTML = '';
  cat.fotos.forEach(produto => {
    grade.appendChild(criarCard(produto));
  });
}

// ── Cria elemento card ────────────────────────────────────────
function criarCard(produto) {
  const noCarrinho = carrinho.some(i => i.id === produto.id);
  const card = document.createElement('div');
  card.className = `card ${noCarrinho ? 'no-carrinho' : ''}`;
  card.id = `card-${produto.id}`;

  card.innerHTML = `
    <div class="card-imagem">
      <img src="${produto.preview}" alt="${produto.nome}" loading="lazy"/>
      <div class="card-check">✓</div>
    </div>
    <div class="card-info">
      <h3>${produto.nome}</h3>
      <div class="card-rodape">
        <span class="card-preco">R$ ${produto.preco.toFixed(2).replace('.', ',')}</span>
        <button class="btn-adicionar" onclick="toggleCarrinho('${produto.id}')">
          ${noCarrinho ? '✓ Adicionado' : '+ Carrinho'}
        </button>
      </div>
    </div>
  `;
  return card;
}

// ── Renderiza todos os cards (necessário para compatibilidade com facial.js) ──
function renderizarProdutos() {
  renderizarGrade();
}

// ── Adiciona ou remove do carrinho ───────────────────────────
function toggleCarrinho(id) {
  const produto = PRODUTOS.find(p => p.id === id);
  const index   = carrinho.findIndex(i => i.id === id);

  if (index === -1) {
    carrinho.push(produto);
  } else {
    carrinho.splice(index, 1);
  }

  atualizarContador();
  renderizarGrade();
}

// ── Atualiza contador do carrinho ─────────────────────────────
function atualizarContador() {
  document.getElementById('carrinho-count').textContent = carrinho.length;
}

// ── Calcula totais ────────────────────────────────────────────
function calcularTotais() {
  const subtotal  = carrinho.reduce((s, p) => s + p.preco, 0);
  const desconto  = calcularDesconto(carrinho.length);
  const valorDesc = subtotal * (desconto.percentual / 100);
  const total     = subtotal - valorDesc;
  return { subtotal, desconto, valorDesc, total };
}

// ── Abre o carrinho ───────────────────────────────────────────
function abrirCarrinho() {
  const { subtotal, desconto, valorDesc, total } = calcularTotais();

  const vazio  = document.getElementById('carrinho-vazio');
  const itens  = document.getElementById('carrinho-itens');
  const resumo = document.getElementById('carrinho-resumo');

  if (carrinho.length === 0) {
    vazio.style.display  = 'flex';
    itens.style.display  = 'none';
    resumo.classList.add('escondido');
  } else {
    vazio.style.display  = 'none';
    itens.style.display  = 'flex';
    resumo.classList.remove('escondido');

    itens.innerHTML = carrinho.map(p => `
      <div class="carrinho-item">
        <img src="${p.preview}" alt="${p.nome}"/>
        <div class="item-info">
          <span>${p.nome}</span>
          <small>R$ ${p.preco.toFixed(2).replace('.', ',')}</small>
        </div>
        <button class="btn-remover" onclick="removerItem('${p.id}')">🗑</button>
      </div>
    `).join('');

    document.getElementById('resumo-subtotal').textContent =
      `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

    const linhaDesc = document.getElementById('resumo-desconto-linha');
    if (desconto.percentual > 0) {
      linhaDesc.classList.remove('escondido');
      document.getElementById('resumo-desconto-label').textContent =
        `Desconto (${desconto.percentual}%):`;
      document.getElementById('resumo-desconto-valor').textContent =
        `- R$ ${valorDesc.toFixed(2).replace('.', ',')}`;
    } else {
      linhaDesc.classList.add('escondido');
    }

    document.getElementById('resumo-total').textContent =
      `R$ ${total.toFixed(2).replace('.', ',')}`;
  }

  document.getElementById('modal-carrinho').classList.remove('escondido');
  document.getElementById('overlay').classList.remove('escondido');
}

// ── Remove item ───────────────────────────────────────────────
function removerItem(id) {
  carrinho = carrinho.filter(p => p.id !== id);
  atualizarContador();
  renderizarGrade();
  abrirCarrinho();
}

// ── Pagamento ─────────────────────────────────────────────────
async function iniciarPagamento() {
  const email = document.getElementById('email-comprador').value.trim();

  if (!email || !email.includes('@')) {
    alert('Por favor, informe um e-mail válido.');
    return;
  }

  const { total } = calcularTotais();
  const btn = document.getElementById('btn-pagar');
  btn.textContent = '⏳ Gerando Pix...';
  btn.disabled = true;

  try {
    const resposta = await fetch('/api/criar-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itens: carrinho.map(p => ({ id: p.id, nome: p.nome, preco: p.preco, arquivo: p.arquivo })),
        total,
        emailComprador: email,
      }),
    });

    if (!resposta.ok) throw new Error('Erro ao criar cobrança');
    const cobranca = await resposta.json();
    paymentId = cobranca.id;

    document.getElementById('qrcode').innerHTML =
      `<img src="data:image/png;base64,${cobranca.qrCodeBase64}"
            style="width:200px;height:200px;" alt="QR Code"/>`;
    document.getElementById('codigo-pix-texto').textContent = cobranca.qrCode;
    document.getElementById('valor-pix-texto').textContent =
      `R$ ${total.toFixed(2).replace('.', ',')}`;

    document.getElementById('modal-carrinho').classList.add('escondido');
    document.getElementById('modal-pix').classList.remove('escondido');
    document.getElementById('status-pagamento').className = 'status-aguardando';
    document.getElementById('status-pagamento').textContent = '⏳ Aguardando pagamento...';

    iniciarVerificacao(email);

  } catch (erro) {
    alert('Erro ao gerar o Pix. Verifique o servidor e tente novamente.');
    console.error(erro);
  } finally {
    btn.textContent = 'Pagar com Pix';
    btn.disabled = false;
  }
}

function iniciarVerificacao(email) {
  verificacaoInterval = setInterval(async () => {
    if (!paymentId) return;
    try {
      const r = await fetch(`/api/status/${paymentId}`);
      const d = await r.json();
      if (d.status === 'approved') {
        clearInterval(verificacaoInterval);
        pagamentoAprovado(email, d.linkDownload);
      }
    } catch(e) { console.error(e); }
  }, 5000);
}

function pagamentoAprovado(email, linkDownload) {
  carrinho = [];
  atualizarContador();
  renderizarGrade();

  document.getElementById('status-pagamento').className = 'status-aprovado';
  document.getElementById('status-pagamento').innerHTML = `
    Pagamento confirmado!<br/>
    <a href="${linkDownload}" download
       style="color:#00d4aa;font-weight:bold;display:inline-block;margin-top:0.5rem">
      Clique aqui para baixar suas fotos
    </a><br/>
    <small style="color:#888;font-size:0.8rem">Link enviado para ${email}</small>
  `;
}

function copiarPix() {
  navigator.clipboard.writeText(
    document.getElementById('codigo-pix-texto').textContent
  ).then(() => {
    document.getElementById('mensagem-copiado').classList.remove('escondido');
    setTimeout(() =>
      document.getElementById('mensagem-copiado').classList.add('escondido'), 3000);
  });
}

function fecharCarrinho() {
  document.getElementById('modal-carrinho').classList.add('escondido');
  document.getElementById('overlay').classList.add('escondido');
}
function fecharPix() {
  clearInterval(verificacaoInterval);
  document.getElementById('modal-pix').classList.add('escondido');
  document.getElementById('overlay').classList.add('escondido');
}
function fecharTudo() { fecharCarrinho(); fecharPix(); }

// ── Inicia ────────────────────────────────────────────────────
init();

// ── Carrega categorias/eventos dinâmicos + fotos do admin ─────
async function carregarFotosDinamicas() {
  try {
    // 1. Carrega categorias e eventos criados no painel admin
    const rCats = await fetch('/api/categorias');
    if (rCats.ok) {
      const { eventos: evsDin, artisticas: artsDin } = await rCats.json();

      evsDin.forEach(ev => {
        if (!EVENTOS.some(e => e.id === ev.id)) {
          EVENTOS.push({ ...ev, fotos: [] });
        }
      });

      artsDin.forEach(cat => {
        if (!CATEGORIAS_ARTISTICAS.some(c => c.id === cat.id)) {
          CATEGORIAS_ARTISTICAS.push({ ...cat, fotos: [] });
        }
      });
    }

    // 2. Carrega fotos adicionadas via painel admin
    const r = await fetch('/api/catalogo');
    const fotos = await r.json();

    fotos.forEach(foto => {
      if (foto.categoria === 'artistica') {
        const cat = CATEGORIAS_ARTISTICAS.find(c => c.id === foto.categoriaArtId);
        if (cat && !cat.fotos.some(f => f.id === foto.id)) {
          cat.fotos.push(foto);
          PRODUTOS.push(foto);
        }
      } else if (foto.categoria === 'evento') {
        const ev = EVENTOS.find(e => e.id === foto.eventoId);
        if (ev && !ev.fotos.some(f => f.id === foto.id)) {
          ev.fotos.push(foto);
          PRODUTOS.push(foto);
        }
      }
    });

    renderizarAbas();
    renderizarGrade();
  } catch(e) {
    console.warn('Dados dinâmicos não carregados:', e.message);
  }
}