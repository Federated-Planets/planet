const { spawn, execSync } = require('child_process');
const path = require('path');

const TEST_PORT = 4500;
const TEST_HOST = "towel-warp-test.localhost";
const TEST_NAME = "Warp Test Planet";
const TEST_LINKS = [
    { name: "Test Link Alpha", url: "https://alpha.test" },
    { name: "Test Link Beta", url: "https://beta.test" }
];

const processes = [];

const cleanup = () => {
    console.log("Cleaning up...");
    processes.forEach(p => {
        try { p.kill(); } catch (e) {}
    });
    try {
        execSync("pkill -f 'wrangler dev' || true");
    } catch (e) {}
};

const runTest = async () => {
    try {
        console.log("Building project...");
        execSync("npm run build", { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

        console.log(`[${TEST_NAME}] Initializing database...`);
        execSync(`npx wrangler d1 execute planet_db --file=schema.sql -c wrangler.dev.jsonc --local --persist-to=.wrangler/state/warp-test`, {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit'
        });

        console.log(`Starting ${TEST_NAME} on http://${TEST_HOST}:${TEST_PORT}...`);
        
        const child = spawn('npx', [
            'wrangler', 'dev',
            '--port', TEST_PORT,
            '-c', 'wrangler.dev.jsonc',
            '--persist-to', '.wrangler/state/warp-test',
            '--var', `PUBLIC_SIM_PLANET_NAME:"${TEST_NAME}"`,
            '--var', `PUBLIC_SIM_LANDING_SITE:"http://${TEST_HOST}:${TEST_PORT}"`,
            '--var', `PUBLIC_SIM_WARP_LINKS:'${JSON.stringify(TEST_LINKS)}'`
        ], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });

        processes.push(child);

        // Wait for wrangler to be ready by parsing logs
        console.log("Waiting for planet to initialize...");
        await new Promise((resolve, reject) => {
            let isReady = false;
            const timeout = setTimeout(() => {
                if (!isReady) reject(new Error(`[${TEST_NAME}] Timed out waiting for readiness`));
            }, 30000);

            const handleData = (data) => {
                const str = data.toString();
                process.stdout.write(`[${TEST_NAME}] ${str}`);
                if (str.includes("Ready on")) {
                    isReady = true;
                    clearTimeout(timeout);
                    resolve();
                }
            };

            child.stdout.on('data', handleData);
            child.stderr.on('data', handleData);
            child.on('error', reject);
        });

        console.log("Fetching planet manifest...");
        const response = await fetch(`http://${TEST_HOST}:${TEST_PORT}/manifest.json`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch manifest: ${response.status}`);
        }

        const manifest = await response.json();
        console.log("Planet Name in Manifest:", manifest.name);

        if (manifest.name !== TEST_NAME) {
            throw new Error(`Name mismatch! Expected ${TEST_NAME}, got ${manifest.name}`);
        }

        // To verify WARP_LINKS, we can check the homepage HTML
        console.log("Fetching planet homepage to verify warp links...");
        const homeRes = await fetch(`http://${TEST_HOST}:${TEST_PORT}/`);
        const html = await homeRes.text();

        const alphaFound = html.includes("Test Link Alpha");
        const betaFound = html.includes("Test Link Beta");
        const defaultNotFound = !html.includes("Aether Reach"); 

        console.log("Test Link Alpha found:", alphaFound);
        console.log("Test Link Beta found:", betaFound);
        console.log("Default links absent:", defaultNotFound);

        if (alphaFound && betaFound && defaultNotFound) {
            console.log("--- WARP LINKS TEST PASSED ---");
            process.exit(0);
        } else {
            throw new Error("Warp links were not correctly overridden.");
        }

    } catch (e) {
        console.error("--- WARP LINKS TEST FAILED ---");
        console.error(e.message);
        process.exit(1);
    } finally {
        cleanup();
    }
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

runTest();
