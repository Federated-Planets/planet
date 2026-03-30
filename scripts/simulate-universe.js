const { spawn, execSync } = require('child_process');
const path = require('path');

const NUM_PLANETS = 10;
const BASE_PORT = 3000;
const BASE_INSPECTOR_PORT = 19229;

const allPlanets = Array.from({ length: NUM_PLANETS }, (_, i) => ({
    name: `Towel ${i + 1}`,
    url: `http://towel-${i + 1}.localhost:${BASE_PORT + i}`
}));

const cleanup = () => {
    console.log("Cleaning up existing processes...");
    try {
        execSync("pkill -f 'wrangler dev' || true");
    } catch (e) {}
};

const startPlanet = async (index) => {
    const id = index + 1;
    const name = `Towel ${id}`;
    const url = `http://towel-${id}.localhost:${BASE_PORT + index}`;
    const port = BASE_PORT + index;
    const inspectorPort = BASE_INSPECTOR_PORT + index;

    console.log(`Starting ${name} on ${url} (Inspector: ${inspectorPort})...`);

    const env = {
        ...process.env,
        PUBLIC_SIM_PLANET_NAME: name,
        PUBLIC_SIM_LANDING_SITE: url,
        PUBLIC_SIM_WARP_LINKS: JSON.stringify(
            allPlanets
                .filter(p => p.url !== url)
                .sort(() => 0.5 - Math.random())
                .slice(0, 5)
                .map(n => ({ name: n.name, url: n.url }))
        )
    };

    const child = spawn('npx', [
        'wrangler', 'dev',
        '--port', port,
        '--ip', '0.0.0.0',
        '--inspector-port', inspectorPort,
        '-c', 'wrangler.dev.jsonc',
        '--var', `PUBLIC_SIM_PLANET_NAME:"${name}"`,
        '--var', `PUBLIC_SIM_LANDING_SITE:"${url}"`,
        '--var', `PUBLIC_SIM_WARP_LINKS:'${JSON.stringify(allPlanets.filter(p => p.url !== url).sort(() => 0.5 - Math.random()).slice(0, 5).map(n => ({ name: n.name, url: n.url })))}'`
    ], {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        stdio: 'ignore',
        shell: true
    });

    child.on('error', (err) => {
        console.error(`Failed to start ${name}:`, err);
    });
};

const run = async () => {
    cleanup();
    console.log("Building project for wrangler...");
    execSync("npm run build", { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

    console.log(`--- SIMULATING FEDERATED UNIVERSE (${NUM_PLANETS} PLANETS) ---`);
    for (let i = 0; i < NUM_PLANETS; i++) {
        startPlanet(i);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log("Opening all planets in browser...");
    const urls = allPlanets.map(p => `${p.url}/control`).join(' ');
    // On macOS, 'open' with multiple URLs opens them in tabs
    execSync(`open ${urls}`);
};

run();
