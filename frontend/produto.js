// ============================================================
// PRODUTO.JS — Catálogo de eventos
// ============================================================

// Eventos são 100% dinâmicos — sem fixos
const EVENTOS = [];

// ── Array global PRODUTOS (mantém compatibilidade com facial.js) ──
const PRODUTOS = [
  ...EVENTOS.flatMap(e => e.fotos),
];

// Os descontos agora são configurados individualmente em cada evento pelo painel admin.
