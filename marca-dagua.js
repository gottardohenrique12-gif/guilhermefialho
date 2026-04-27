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
const EXTENSOES       = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.JPG'];

async function aplicarMarcaDagua(arquivo) {
  const caminhoImg = path.join(PASTA_IMG, arquivo);
  const caminhoDl  = path.join(PASTA_DOWNLOADS, arquivo);

  if (fs.existsSync(caminhoDl)) {
    console.log(`⏭  Pulando (original já existe): ${arquivo}`);
    return;
  }

  // Salva original antes de modificar
  fs.copyFileSync(caminhoImg, caminhoDl);

  const meta = await sharp(caminhoImg).metadata();
  const W    = meta.width;
  const H    = meta.height;

  const fontSize = Math.max(20, Math.round(Math.min(W, H) * 0.04));
  const passo    = Math.round(Math.max(W, H) / 4);

  const svgTextos = [];

  // Preenche a imagem com texto em diagonal, distribuído em grade
  for (let col = -2; col <= 6; col++) {
    for (let row = -2; row <= 6; row++) {
      const x = col * passo;
      const y = row * passo;
      svgTextos.push(`
        <text
          x="${x}" y="${y}"
          font-size="${fontSize}"
          font-family="Liberation Sans, Arial, sans-serif"
          font-weight="bold"
          fill="white"
          fill-opacity="0.5"
          stroke="black"
          stroke-width="1"
          stroke-opacity="0.3"
          transform="rotate(-30, ${x}, ${y})"
          letter-spacing="3"
        >${TEXTO}</text>
      `);
    }
  }

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${svgTextos.join('')}
    </svg>
  `);

  await sharp(caminhoImg)
    .composite([{ input: svg, gravity: 'northwest' }])
    .jpeg({ quality: 82 })
    .toFile(caminhoImg + '.tmp');

  fs.renameSync(caminhoImg + '.tmp', caminhoImg);
  console.log(`✅ Marca aplicada: ${arquivo}`);
}

async function main() {
  console.log('🖼️  Aplicando marca d\'água nas fotos...\n');

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