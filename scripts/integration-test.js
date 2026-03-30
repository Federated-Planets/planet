const { spawn, execSync } = require('child_process');
const path = require('path');

const NUM_PLANETS = 4; // Minimal quorum size (3f + 1 where f=1)
const BASE_PORT = 4000;
const BASE_INSPECTOR_PORT = 29229;

const allPlanets = Array.from({ length: NUM_PLANETS }, (_, i) => ({
    name: `Towel ${i + 1}`,
    url: `http://localhost:${BASE_PORT + i}`
}));

const processes = [];

const cleanup = () => {
    console.log("Cleaning up processes...");
    processes.forEach(p => {
        try { p.kill(); } catch (e) {}
    });
    try {
        execSync("pkill -f 'wrangler dev' || true");
    } catch (e) {}
};

const startPlanet = (index) => {
    const id = index + 1;
    const name = `Towel ${id}`;
    const url = `http://localhost:${BASE_PORT + index}`;
    const port = BASE_PORT + index;
    const inspectorPort = BASE_INSPECTOR_PORT + index;

    const env = {
        ...process.env,
        PUBLIC_SIM_PLANET_NAME: name,
        PUBLIC_SIM_LANDING_SITE: url,
        PUBLIC_SIM_WARP_LINKS: JSON.stringify(
            allPlanets
                .filter(p => p.url !== url)
                .map(n => ({ name: n.name, url: n.url }))
        )
    };

    const child = spawn('npx', [
        'wrangler', 'dev',
        '--port', port,
        '--inspector-port', inspectorPort,
        '-c', 'wrangler.dev.jsonc',
        '--var', `PUBLIC_SIM_PLANET_NAME:"${name}"`,
        '--var', `PUBLIC_SIM_LANDING_SITE:"${url}"`,
        '--var', `PUBLIC_SIM_WARP_LINKS:'${JSON.stringify(allPlanets.filter(p => p.url !== url).map(n => ({ name: n.name, url: n.url })))}'`
    ], {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        stdio: 'pipe',
        shell: true
    });

    processes.push(child);
    return child;
};

const runTest = async () => {
    try {
        console.log("Building project...");
        execSync("npm run build", { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

        console.log(`Starting ${NUM_PLANETS} planets...`);
        for (let i = 0; i < NUM_PLANETS; i++) {
            startPlanet(i);
        }

        console.log("Waiting for planets to initialize (30s)...");
        await new Promise(r => setTimeout(r, 30000));

        console.log("Initiating jump from Towel 1 to Towel 2...");
        const response = await fetch(`${allPlanets[0].url}/api/v1/port?action=initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ship_id: 'TEST-SHIP',
                destination_url: allPlanets[1].url,
                departure_timestamp: Date.now()
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Initiate failed: ${response.status} ${text}`);
        }

        const data = await response.json();
        console.log("Plan initiated:", data.plan.id);

        console.log("Monitoring events for QUORUM_REACHED...");
        let quorumReached = false;
        for (let attempt = 0; attempt < 20; attempt++) {
            await new Promise(r => setTimeout(r, 2000));
            
            // Check Towel 1's events
            const eventsRes = await fetch(`${allPlanets[0].url}/api/v1/control-ws`);
            if (eventsRes.ok) {
                const events = await eventsRes.json();
                const quorumEvent = events.find(e => e.type === 'QUORUM_REACHED');
                const errorEvent = events.find(e => e.type === 'API_ERROR');
                
                if (errorEvent) {
                    console.error("API ERROR DETECTED:", errorEvent.error);
                }
                
                if (quorumEvent) {
                    console.log("SUCCESS: Quorum reached!");
                    quorumReached = true;
                    break;
                }
            }
            console.log(`Waiting... (attempt ${attempt + 1}/20)`);
        }

        if (!quorumReached) {
            throw new Error("Test failed: QUORUM_REACHED event not found after 40 seconds.");
        }

        console.log("--- INTEGRATION TEST PASSED ---");
        process.exit(0);

    } catch (e) {
        console.error("--- INTEGRATION TEST FAILED ---");
        console.error(e.message);
        process.exit(1);
    } finally {
        cleanup();
    }
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

runTest();
