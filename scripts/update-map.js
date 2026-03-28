const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const cheerio = require('cheerio');

const calculateCoordinates = (domain) => {
  const hash = crypto.createHash('md5').update(domain).digest('hex');
  const xHex = hash.slice(0, 6);
  const yHex = hash.slice(6, 12);
  
  const xCoord = (parseInt(xHex, 16) % 1000000) / 1000;
  const yCoord = (parseInt(yHex, 16) % 1000000) / 1000;
  
  return {
    x: xCoord.toFixed(3),
    y: yCoord.toFixed(3)
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
  const myDomain = new URL(manifest.canonical_url).hostname;
  const myCoords = calculateCoordinates(myDomain);
  
  manifest.coordinates = {
    x: parseFloat(myCoords.x),
    y: parseFloat(myCoords.y)
  };
  
  fs.writeFileSync(manifestDistPath, JSON.stringify(manifest, null, 2));
  fs.copyFileSync(cssSrcPath, cssDistPath);
  fs.copyFileSync(jsSrcPath, jsDistPath);

  const indexHtml = fs.readFileSync(indexSrcPath, 'utf8');
  const $ = cheerio.load(indexHtml);

  $('link[rel="canonical"]').remove();
  $('head').prepend(`\n    <link rel="canonical" href="${manifest.canonical_url}">`);

  $('.coord-display').text(`${myCoords.x} - ${myCoords.y}`);
  $('.crosshair').attr('transform', `translate(${myCoords.x}, ${myCoords.y})`);

  const $courseLines = $('#map-course-lines');
  const $planets = $('#map-planets');
  $courseLines.empty();
  $planets.empty();

  $('.warp-links li').each((i, el) => {
    const id = i + 1;
    let link = $(el).find('a');
    
    if (!link.length) return;

    const url = link.attr('href');
    const domain = new URL(url).hostname;
    const coords = calculateCoordinates(domain);
    const name = link.text();

    // 1. Wrap content in .neighbor-entry-content for flex layout
    if ($(el).find('.neighbor-entry-content').length === 0) {
      $(el).wrapInner('<div class="neighbor-entry-content"></div>');
    }
    const $content = $(el).find('.neighbor-entry-content');

    // 2. Update/Add coordinate tag
    link.attr('data-id', id);
    let coordTag = $content.find('code.coord');
    if (coordTag.length === 0) {
      $content.append(` <code class="coord"></code>`);
      coordTag = $content.find('code.coord');
    }
    coordTag.text(`${coords.x} - ${coords.y}`);
    coordTag.attr('data-id', id);

    // 3. Generate SVG Circle
    $planets.append(`
              <circle
                id="neighbor-circle-${id}"
                class="neighbor-circle"
                data-id="${id}"
                cx="${coords.x}"
                cy="${coords.y}"
                r="4"
              >
                <title>${name} (${coords.x} - ${coords.y})</title>
              </circle>`);

    // 4. Generate Course Line
    $courseLines.append(`
              <line
                id="course-line-${id}"
                class="course-line"
                data-id="${id}"
                x1="${myCoords.x}"
                y1="${myCoords.y}"
                x2="${coords.x}"
                y2="${coords.y}"
              ></line>`);
  });

  fs.writeFileSync(indexDistPath, $.html());
  console.log('Build complete: Ordered list support applied.');
};

updateFiles();
