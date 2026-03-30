const { spawn, execSync } = require('child_process');
const path = require('path');

const TEST_PORT = 4500;
const TEST_NAME = "Warp Test Planet";
const TEST_LINKS = [
    { name: "Test Link Alpha", url: "https://alpha.test" },
    { name: "Test Link Beta", url: "https://beta.test" }
];

const cleanup = () => {
    console.log("Cleaning up...");
    try {
        execSync("pkill -f 'wrangler dev' || true");
    } catch (e) {}
};

const runTest = async () => {
    try {
        console.log("Building project...");
        execSync("npm run build", { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

        console.log(`Starting ${TEST_NAME} on port ${TEST_PORT}...`);
        
        const env = {
            ...process.env,
            PUBLIC_SIM_PLANET_NAME: TEST_NAME,
            PUBLIC_SIM_LANDING_SITE: `http://localhost:${TEST_PORT}`,
            PUBLIC_SIM_WARP_LINKS: JSON.stringify(TEST_LINKS)
        };

        const child = spawn('npx', [
            'wrangler', 'dev',
            '--port', TEST_PORT,
            '-c', 'wrangler.dev.jsonc',
            '--var', `PUBLIC_SIM_PLANET_NAME:"${TEST_NAME}"`,
            '--var', `PUBLIC_SIM_LANDING_SITE:"http://localhost:${TEST_PORT}"`,
            '--var', `PUBLIC_SIM_WARP_LINKS:'${JSON.stringify(TEST_LINKS)}'`
        ], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env }, // We still pass process.env for node
            stdio: 'pipe',
            shell: true
        });

        // Wait for wrangler to be ready
        console.log("Waiting for planet to initialize (15s)...");
        await new Promise(r => setTimeout(r, 15000));

        console.log("Fetching planet manifest...");
        const response = await fetch(`http://localhost:${TEST_PORT}/manifest.json`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch manifest: ${response.status}`);
        }

        const manifest = await response.json();
        console.log("Planet Name in Manifest:", manifest.name);

        if (manifest.name !== TEST_NAME) {
            throw new Error(`Name mismatch! Expected ${TEST_NAME}, got ${manifest.name}`);
        }

        // To verify WARP_LINKS, we can check the homepage HTML since it's not in the manifest.json
        console.log("Fetching planet homepage to verify warp links...");
        const homeRes = await fetch(`http://localhost:${TEST_PORT}/`);
        const html = await homeRes.text();

        const alphaFound = html.includes("Test Link Alpha");
        const betaFound = html.includes("Test Link Beta");
        const defaultNotFound = !html.includes("Aether Reach"); // One of the defaults

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

runTest();
