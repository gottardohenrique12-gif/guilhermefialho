// ============================================================
// FACIAL.JS — Reconhecimento facial (temporariamente desativado)
// ============================================================

function abrirReconhecimento() {
  alert('🔧 Funcionalidade em breve disponível!');
}

function fecharReconhecimento() {}

// Sobreescreve fecharTudo para incluir o modal facial
const _fecharTudoOriginal = window.fecharTudo;
window.fecharTudo = function() {
  fecharReconhecimento();
  if (_fecharTudoOriginal) _fecharTudoOriginal();
};