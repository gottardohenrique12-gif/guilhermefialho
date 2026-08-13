// ── Preview da foto ───────────────────────────────────────────
let produtoPreviewAtual = null;

function abrirPreview(id, evento) {
  // Evita que o clique na foto vaze para o overlay (que fecharia tudo)
  if (evento && evento.stopPropagation) evento.stopPropagation();

  const produto = PRODUTOS.find(p => p.id === id);
  if (!produto) return;
  produtoPreviewAtual = produto;

  document.getElementById('preview-img').src = produto.preview;
  document.getElementById('preview-nome').textContent = produto.nome;
  document.getElementById('preview-preco').textContent =
    'R$ ' + produto.preco.toFixed(2).replace('.', ',');

  atualizarBtnPreview();

  // Esconde modal facial se estiver aberto (mas mantém o overlay)
  const modalFacial = document.getElementById('modal-facial');
  if (modalFacial) modalFacial.classList.add('escondido');

  document.getElementById('modal-preview').classList.remove('escondido');
  document.getElementById('overlay').classList.remove('escondido');
}

function atualizarBtnPreview() {
  if (!produtoPreviewAtual) return;
  const noCarrinho = carrinho.some(i => i.id === produtoPreviewAtual.id);
  const btn = document.getElementById('preview-btn-carrinho');
  btn.textContent = noCarrinho ? '✓ Adicionado' : '+ Carrinho';
  btn.className = noCarrinho ? 'btn-adicionar no-carrinho' : 'btn-adicionar';
}

function toggleCarrinhoPreview() {
  if (!produtoPreviewAtual) return;
  toggleCarrinho(produtoPreviewAtual.id);
  atualizarBtnPreview();
}

function fecharPreview() {
  document.getElementById('modal-preview').classList.add('escondido');
  document.getElementById('overlay').classList.add('escondido');
  produtoPreviewAtual = null;
}

// ============================================================
// APP.JS — Eventos + Carrinho
// ============================================================

let carrinho = [];
let paymentId = null;
let verificacaoInterval;
let eventoAtivo = null;

function init() {
  renderizarEventos();
  carregarFotosDinamicas();
}

function renderizarEventos() {
  const lista = document.getElementById('lista-eventos');
  if (!lista) return;
  if (!EVENTOS.length) {
    lista.innerHTML = '<p class="eventos-vazio">Nenhum evento disponível no momento.</p>';
    return;
  }
  lista.innerHTML = EVENTOS.map(e => {
    const capa = e.capa || (e.fotos && e.fotos[0] ? e.fotos[0].preview : '');
    return `
      <article class="evento-card" onclick="abrirEvento('${e.id}')">
        <div class="evento-imagem">
          ${capa ? `<img src="${capa}" alt="${e.nome}" loading="lazy">` : '<div class="evento-sem-capa">Sem foto de capa</div>'}
        </div>
        <div class="evento-info"><h3>${e.nome}</h3></div>
      </article>`;
  }).join('');
}

function abrirEvento(id) {
  eventoAtivo = id;
  const evento = EVENTOS.find(e => e.id === id);
  if (!evento) return;
  document.getElementById('lista-eventos').classList.add('escondido');
  document.getElementById('titulo-eventos').classList.add('escondido');
  document.getElementById('galeria-evento').classList.remove('escondido');
  document.getElementById('galeria-evento-nome').textContent = evento.nome;
  atualizarBannerOfertas(evento);
  renderizarGradeEventos();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function voltarParaEventos() {
  eventoAtivo = null;
  document.getElementById('galeria-evento').classList.add('escondido');
  document.getElementById('lista-eventos').classList.remove('escondido');
  document.getElementById('titulo-eventos').classList.remove('escondido');
  const banner = document.getElementById('banner-desconto');
  if (banner) banner.classList.add('escondido');
  renderizarEventos();
}


function ofertasValidas(evento) {
  return (evento?.ofertas || [])
    .map(o => ({ minFotos: Number(o.minFotos), percentual: Number(o.percentual) }))
    .filter(o => Number.isFinite(o.minFotos) && o.minFotos >= 1 && Number.isFinite(o.percentual) && o.percentual > 0)
    .sort((a, b) => b.minFotos - a.minFotos);
}

function atualizarBannerOfertas(evento) {
  const banner = document.getElementById('banner-desconto');
  if (!banner) return;
  const ofertas = ofertasValidas(evento).sort((a, b) => a.minFotos - b.minFotos);
  if (!ofertas.length) {
    banner.textContent = '';
    banner.classList.add('escondido');
    return;
  }
  banner.innerHTML = ofertas
    .map(o => `Compre ${o.minFotos}+ fotos e ganhe <strong>${o.percentual}% off</strong>`)
    .join(' • ');
  banner.classList.remove('escondido');
}

function calcularDescontoDoEvento(eventoId, qtdFotos) {
  const evento = EVENTOS.find(e => e.id === eventoId);
  const ofertas = ofertasValidas(evento);
  return ofertas.find(o => qtdFotos >= o.minFotos) || { minFotos: 0, percentual: 0 };
}

function renderizarGrade() {
  if (eventoAtivo) renderizarGradeEventos();
  else renderizarEventos();
}

function renderizarGradeEventos() {
  const evento = EVENTOS.find(e => e.id === eventoAtivo);
  const grade = document.getElementById('grade-eventos');
  if (!evento || !grade) return;
  grade.innerHTML = '';
  evento.fotos.forEach(produto => grade.appendChild(criarCard(produto)));
}

// ── Cria card ─────────────────────────────────────────────────
function criarCard(produto) {
  const noCarrinho = carrinho.some(i => i.id === produto.id);
  const card = document.createElement('div');
  card.className = `card ${noCarrinho ? 'no-carrinho' : ''}`;
  card.id = `card-${produto.id}`;
  card.innerHTML = `
    <div class="card-imagem">
      <img src="${produto.preview}" alt="${produto.nome}" loading="lazy" onclick="abrirPreview('${produto.id}')" style="cursor:zoom-in"/>
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

function renderizarProdutos() { renderizarGrade(); }

// ── Carrinho ──────────────────────────────────────────────────
function toggleCarrinho(id) {
  const produto = PRODUTOS.find(p => p.id === id);
  const index   = carrinho.findIndex(i => i.id === id);
  if (index === -1) carrinho.push(produto);
  else carrinho.splice(index, 1);
  atualizarContador();
  renderizarGrade();
}

function atualizarContador() {
  document.getElementById('carrinho-count').textContent = carrinho.length;
}

function calcularTotais() {
  const subtotal = carrinho.reduce((s, p) => s + p.preco, 0);
  const grupos = new Map();

  carrinho.forEach(produto => {
    const eventoId = produto.eventoId || '__sem_evento__';
    if (!grupos.has(eventoId)) grupos.set(eventoId, []);
    grupos.get(eventoId).push(produto);
  });

  let valorDesc = 0;
  const descontosAplicados = [];

  grupos.forEach((itens, eventoId) => {
    if (eventoId === '__sem_evento__') return;
    const oferta = calcularDescontoDoEvento(eventoId, itens.length);
    if (oferta.percentual <= 0) return;

    const subtotalEvento = itens.reduce((s, p) => s + p.preco, 0);
    valorDesc += subtotalEvento * (oferta.percentual / 100);
    const evento = EVENTOS.find(e => e.id === eventoId);
    descontosAplicados.push({
      eventoId,
      nome: evento?.nome || 'Evento',
      percentual: oferta.percentual
    });
  });

  const total = Math.max(0, subtotal - valorDesc);
  return { subtotal, valorDesc, total, descontosAplicados };
}

function abrirCarrinho() {
  const { subtotal, valorDesc, total, descontosAplicados } = calcularTotais();
  const vazio  = document.getElementById('carrinho-vazio');
  const itens  = document.getElementById('carrinho-itens');
  const resumo = document.getElementById('carrinho-resumo');

  if (carrinho.length === 0) {
    vazio.style.display = 'flex';
    itens.style.display = 'none';
    resumo.classList.add('escondido');
  } else {
    vazio.style.display = 'none';
    itens.style.display = 'flex';
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
    if (valorDesc > 0) {
      linhaDesc.classList.remove('escondido');
      const detalhe = descontosAplicados.map(d => `${d.nome}: ${d.percentual}%`).join(' • ');
      document.getElementById('resumo-desconto-label').textContent = detalhe ? `Desconto (${detalhe}):` : 'Desconto:';
      document.getElementById('resumo-desconto-valor').textContent = `- R$ ${valorDesc.toFixed(2).replace('.', ',')}`;
    } else {
      linhaDesc.classList.add('escondido');
    }

    document.getElementById('resumo-total').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  }

  document.getElementById('modal-carrinho').classList.remove('escondido');
  document.getElementById('overlay').classList.remove('escondido');
}

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
        itens: carrinho.map(p => ({ id: p.id, nome: p.nome, preco: p.preco, arquivo: p.arquivo, urlOriginal: p.urlOriginal })),
        total,
        emailComprador: email,
      }),
    });

    if (!resposta.ok) throw new Error('Erro ao criar cobrança');
    const cobranca = await resposta.json();
    paymentId = cobranca.id;

    document.getElementById('qrcode').innerHTML =
      `<img src="data:image/png;base64,${cobranca.qrCodeBase64}" style="width:200px;height:200px;" alt="QR Code"/>`;
    document.getElementById('codigo-pix-texto').textContent = cobranca.qrCode;
    document.getElementById('valor-pix-texto').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

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
    <a href="${linkDownload}" target="_blank" rel="noopener"
       style="color:#00d4aa;font-weight:bold;display:inline-block;margin-top:0.5rem">
      📥 Acessar e baixar suas fotos
    </a>
  `;
}

function copiarPix() {
  navigator.clipboard.writeText(document.getElementById('codigo-pix-texto').textContent).then(() => {
    document.getElementById('mensagem-copiado').classList.remove('escondido');
    setTimeout(() => document.getElementById('mensagem-copiado').classList.add('escondido'), 3000);
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
function fecharTudo() {
  fecharCarrinho();
  fecharPix();
  fecharPreview();
  // Fecha modal facial se estiver aberto (sem chamar fecharReconhecimento
  // para evitar recursão — apenas esconde o elemento)
  const modalFacial = document.getElementById('modal-facial');
  if (modalFacial && !modalFacial.classList.contains('escondido')) {
    if (typeof facialPararCamera === 'function') facialPararCamera();
    modalFacial.classList.add('escondido');
  }
}

// ── Inicia ────────────────────────────────────────────────────
init();

// ── Carrega eventos + fotos do admin ─────────────────────────
async function carregarFotosDinamicas() {
  try {
    const rEst = await fetch('/api/estrutura');
    if (rEst.ok) {
      const dados = await rEst.json();
      (dados.eventos || []).forEach(ev => {
        if (!EVENTOS.some(e => e.id === ev.id)) EVENTOS.push({ ...ev, fotos: [] });
      });
    }

    const rCat = await fetch('/api/catalogo');
    const fotos = await rCat.json();
    fotos.filter(f => f.categoria === 'evento').forEach(foto => {
      const ev = EVENTOS.find(e => e.id === foto.eventoId);
      if (ev && !ev.fotos.some(f => f.id === foto.id)) {
        ev.fotos.push(foto);
        if (!PRODUTOS.some(p => p.id === foto.id)) PRODUTOS.push(foto);
      }
    });
    renderizarEventos();
    if (eventoAtivo) renderizarGradeEventos();
  } catch(e) {
    console.warn('Dados dinâmicos não carregados:', e.message);
  }
}

