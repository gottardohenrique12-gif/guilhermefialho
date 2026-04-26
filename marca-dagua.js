// ============================================================
// marca-dagua.js
// Aplica marca d'água em todas as fotos de frontend/img/
// As originais ficam salvas em downloads/artisticas/ (sem marca)
// Uso: node marca-dagua.js
// ============================================================

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const PASTA_IMG       = path.join(__dirname, 'frontend', 'img');
const PASTA_DOWNLOADS = path.join(__dirname, 'downloads', 'artisticas');
const TEXTO           = '© Guilherme Fialho Soares';
const EXTENSOES       = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG'];

async function aplicarMarcaDagua(arquivo) {
  const caminhoImg  = path.join(PASTA_IMG, arquivo);
  const caminhoDl   = path.join(PASTA_DOWNLOADS, arquivo);

  // Se já existe original em downloads, não sobrescreve
  // (significa que a marca já foi aplicada antes)
  if (fs.existsSync(caminhoDl)) {
    console.log(`⏭  Pulando (original já existe): ${arquivo}`);
    return;
  }

  // Salva cópia original em downloads ANTES de aplicar marca
  fs.copyFileSync(caminhoImg, caminhoDl);

  const meta   = await sharp(caminhoImg).metadata();
  const W      = meta.width;
  const H      = meta.height;

  // Tamanho da fonte proporcional à imagem
  const fontSize   = Math.max(18, Math.round(Math.min(W, H) * 0.035));
  const repetições = 6; // quantas vezes repete o texto na diagonal

  // Gera SVG com texto em diagonal repetido
  const svgTextos = [];
  const passo = Math.round(Math.max(W, H) / repetições);

  for (let i = -repetições; i <= repetições * 2; i++) {
    const x = i * passo;
    const y = 0;
    svgTextos.push(`
      <text
        x="${x}" y="${y}"
        font-size="${fontSize}"
        font-family="Arial, sans-serif"
        font-weight="bold"
        fill="white"
        fill-opacity="0.45"
        stroke="black"
        stroke-width="0.5"
        stroke-opacity="0.2"
        transform="rotate(-30, ${x}, ${y})"
        letter-spacing="2"
      >${TEXTO}</text>
    `);
  }

  const svg = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${svgTextos.join('')}
    </svg>
  `;

  const marcaDagua = Buffer.from(svg);

  await sharp(caminhoImg)
    .composite([{ input: marcaDagua, gravity: 'center' }])
    .jpeg({ quality: 82 })
    .toFile(caminhoImg + '.tmp');

  fs.renameSync(caminhoImg + '.tmp', caminhoImg);

  console.log(`✅ Marca aplicada: ${arquivo}`);
}

async function main() {
  console.log('🖼️  Aplicando marca d\'água nas fotos...\n');

  // Garante que pasta de downloads existe
  fs.mkdirSync(PASTA_DOWNLOADS, { recursive: true });

  const arquivos = fs.readdirSync(PASTA_IMG)
    .filter(f => EXTENSOES.includes(path.extname(f)));

  if (!arquivos.length) {
    console.log('Nenhuma imagem encontrada em frontend/img/');
    return;
  }

  console.log(`📸 ${arquivos.length} imagens encontradas.\n`);

  for (const arquivo of arquivos) {
    await aplicarMarcaDagua(arquivo);
  }

  console.log('\n🎉 Concluído!');
  console.log('✔ Fotos com marca d\'água: frontend/img/');
  console.log('✔ Originais sem marca:     downloads/artisticas/');
  console.log('\nAgora rode: git add . && git commit -m "aplicar marca dagua" && git push');
}

main();