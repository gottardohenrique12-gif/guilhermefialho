// ============================================================
// PRODUTO.JS — Catálogo de eventos
// ============================================================

// Eventos são 100% dinâmicos — sem fixos
const EVENTOS = [];

// ── Array global PRODUTOS (mantém compatibilidade com facial.js) ──
const PRODUTOS = [
  ...EVENTOS.flatMap(e => e.fotos),
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