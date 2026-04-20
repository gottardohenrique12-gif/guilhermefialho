// ============================================================
// comprimir-fotos.js
// Roda UMA VEZ para comprimir todas as imagens de frontend/img
// Uso: node comprimir-fotos.js
// ============================================================

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PASTA_ENTRADA = path.join(__dirname, 'frontend', 'img');
const PASTA_SAIDA   = path.join(__dirname, 'frontend', 'img'); // substitui no lugar

const QUALIDADE_JPG  = 75; // 75% — boa qualidade, bem menor
const QUALIDADE_WEBP = 75;
const LARGURA_MAX    = 1920; // reduz se a foto for maior que isso

const extensoesValidas = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];

async function comprimirImagem(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  const caminhoEntrada = path.join(PASTA_ENTRADA, arquivo);
  const caminhoSaida   = path.join(PASTA_SAIDA, arquivo);

  try {
    const pipeline = sharp(caminhoEntrada)
      .resize({ width: LARGURA_MAX, withoutEnlargement: true }); // não aumenta se for menor

    if (ext === '.png') {
      await pipeline.png({ quality: QUALIDADE_JPG, compressionLevel: 9 }).toFile(caminhoSaida + '.tmp');
    } else {
      await pipeline.jpeg({ quality: QUALIDADE_JPG, mozjpeg: true }).toFile(caminhoSaida + '.tmp');
    }

    // pega tamanhos antes e depois
    const antes  = fs.statSync(caminhoEntrada).size;
    const depois  = fs.statSync(caminhoSaida + '.tmp').size;

    // substitui o original pelo comprimido
    fs.renameSync(caminhoSaida + '.tmp', caminhoSaida);

    const reducao = (((antes - depois) / antes) * 100).toFixed(1);
    console.log(`✅ ${arquivo}: ${(antes/1024/1024).toFixed(2)}MB → ${(depois/1024/1024).toFixed(2)}MB (${reducao}% menor)`);
  } catch (err) {
    console.error(`❌ Erro em ${arquivo}:`, err.message);
  }
}

async function main() {
  console.log('🔍 Lendo pasta frontend/img...\n');

  const arquivos = fs.readdirSync(PASTA_ENTRADA).filter(f =>
    extensoesValidas.includes(path.extname(f))
  );

  if (arquivos.length === 0) {
    console.log('Nenhuma imagem encontrada em frontend/img');
    return;
  }

  console.log(`📸 ${arquivos.length} imagens encontradas. Comprimindo...\n`);

  for (const arquivo of arquivos) {
    await comprimirImagem(arquivo);
  }

  console.log('\n🎉 Todas as imagens foram comprimidas!');
  console.log('Agora rode: git add . && git commit -m "comprimir imagens" && git push');
}

main();