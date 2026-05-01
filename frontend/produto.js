// ============================================================
// PRODUTO.JS — Catálogo com categorias: Eventos e Artísticas
// ============================================================

// Eventos são 100% dinâmicos — sem fixos
const EVENTOS = [];

const CATEGORIAS_ARTISTICAS = [
  { id: 'paisagens',   nome: 'Paisagens',     icone: '', fotos: [] },
  { id: 'animais',     nome: 'Animais',       icone: '', fotos: [] },
  { id: 'luar',        nome: 'Luar',          icone: '', fotos: [] },
  { id: 'natureza',    nome: 'Natureza',      icone: '', fotos: [] },
  { id: 'serra',       nome: 'Serra Gaúcha',  icone: '', fotos: [] },
  { id: 'arquitetura', nome: 'Arquitetura',   icone: '', fotos: [] },
];

// ── Array global PRODUTOS (mantém compatibilidade com facial.js) ──
const PRODUTOS = [
  ...EVENTOS.flatMap(e => e.fotos),
  ...CATEGORIAS_ARTISTICAS.flatMap(c => c.fotos),
];

// ── DESCONTOS PROGRESSIVOS ────────────────────────────────────
const DESCONTOS = [
  { minFotos: 5, percentual: 20, label: '5+ fotos = 20% off' },
  { minFotos: 3, percentual: 10, label: '3+ fotos = 10% off' },
  { minFotos: 1, percentual: 0,  label: ''                   },
];

function calcularDesconto(qtdFotos) {
  return DESCONTOS.find(d => qtdFotos >= d.minFotos) || DESCONTOS[2];
}