const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const cheerio = require('cheerio');

const formatCoord = (n) => n.toFixed(2).padStart(6, '0');

const calculateCoordinates = (url) => {
  const domain = new URL(url).hostname.toLowerCase();
  const hash = crypto.createHash('md5').update(domain).digest('hex');
  
  const xHex = hash.slice(0, 6);
  const yHex = hash.slice(6, 12);
  const zHex = hash.slice(12, 18);
  
  const xCoord = (parseInt(xHex, 16) % 100000) / 100;
  const yCoord = (parseInt(yHex, 16) % 100000) / 100;
  const zCoord = (parseInt(zHex, 16) % 100000) / 100;
  
  return {
    x: xCoord,
    y: yCoord,
    z: zCoord
  };
};

const updateFiles = () => {
  const srcDir = path.join(__dirname, '../public');
  const distDir = path.join(__dirname, '../dist');
  
  const manifestSrcPath = path.join(srcDir, 'manifest.json');
  const indexSrcPath = path.join(srcDir, 'index.html');
  const cssSrcPath = path.join(srcDir, 'planet.css');
  const jsSrcPath = path.join(srcDir, 'map.js');
  
  const manifestDistPath = path.join(distDir, 'manifest.json');
  const indexDistPath = path.join(distDir, 'index.html');
  const cssDistPath = path.join(distDir, 'planet.css');
  const jsDistPath = path.join(distDir, 'map.js');

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestSrcPath, 'utf8'));
  const myCoords = calculateCoordinates(manifest.landing_site);
  
  // No longer saving coordinates to manifest per instructions
  fs.writeFileSync(manifestDistPath, JSON.stringify(manifest, null, 2));
  fs.copyFileSync(cssSrcPath, cssDistPath);
  fs.copyFileSync(jsSrcPath, jsDistPath);

  const indexHtml = fs.readFileSync(indexSrcPath, 'utf8');
  const $ = cheerio.load(indexHtml);

  // Update coordinate display in text
  const myFormatted = `${formatCoord(myCoords.x)}:${formatCoord(myCoords.y)}:${formatCoord(myCoords.z)}`;
  $('.coord-display').text(myFormatted);
  
  // Store my coordinates for ThreeJS (as raw numbers)
  $('body').attr('data-my-x', myCoords.x);
  $('body').attr('data-my-y', myCoords.y);
  $('body').attr('data-my-z', myCoords.z);

  $('.warp-links li').each((i, el) => {
    const id = i + 1;
    let link = $(el).find('a');
    
    if (!link.length) return;

    const url = link.attr('href');
    const coords = calculateCoordinates(url);

    // Update/Add coordinate tag directly inside the LI
    link.attr('data-id', id);
    link.attr('data-x', coords.x);
    link.attr('data-y', coords.y);
    link.attr('data-z', coords.z);
    
    let coordTag = $(el).find('code.coord');
    if (coordTag.length === 0) {
      $(el).append(` <code class="coord"></code>`);
      coordTag = $(el).find('code.coord');
    }
    const neighborFormatted = `${formatCoord(coords.x)}:${formatCoord(coords.y)}:${formatCoord(coords.z)}`;
    coordTag.text(neighborFormatted);
    coordTag.attr('data-id', id);
  });

  fs.writeFileSync(indexDistPath, $.html());
  console.log('Build complete: 3D Coordinates applied.');
};

updateFiles();
