import { spawn, execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NUM_PLANETS = 10;
const BASE_PORT = 3000;
const BASE_INSPECTOR_PORT = 19229;
const OPEN_BROWSER = process.argv.includes("--open");

const allPlanets = Array.from({ length: NUM_PLANETS }, (_, i) => ({
  name: `Towel ${i + 1}`,
  url: `http://towel-${i + 1}.localhost:${BASE_PORT + i}`,
  port: BASE_PORT + i,
  id: i + 1,
}));

const processes = [];

const cleanup = () => {
  console.log("Cleaning up existing processes...");
  processes.forEach((p) => {
    try {
      p.kill();
    } catch (e) {}
  });
  try {
    execSync("pkill -f 'wrangler dev' || true");
  } catch (e) {}
};

const startPlanet = (planet) => {
  const { id, name, url, port } = planet;
  const inspectorPort = BASE_INSPECTOR_PORT + id;

  const env = {
    ...process.env,
    PUBLIC_SIM_PLANET_NAME: name,
    PUBLIC_SIM_LANDING_SITE: url,
    PUBLIC_SIM_WARP_LINKS: JSON.stringify(
      allPlanets
        .filter((p) => p.url !== url)
        .sort(() => 0.5 - Math.random())
        .slice(0, 5)
        .map((n) => ({ name: n.name, url: n.url })),
    ),
  };

  const child = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      port,
      "--ip",
      "0.0.0.0",
      "--inspector-port",
      inspectorPort,
      "-c",
      "wrangler.dev.jsonc",
      "--persist-to",
      `.wrangler/state/planet-${id}`,
      "--var",
      `PUBLIC_SIM_PLANET_NAME:"${name}"`,
      "--var",
      `PUBLIC_SIM_LANDING_SITE:"${url}"`,
      "--var",
      `PUBLIC_SIM_WARP_LINKS:'${env.PUBLIC_SIM_WARP_LINKS}'`,
    ],
    {
      cwd: path.join(__dirname, ".."),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    },
  );

  processes.push(child);

  return new Promise((resolve, reject) => {
    let isReady = false;
    const timeout = setTimeout(() => {
      if (!isReady)
        reject(new Error(`[${name}] Timed out waiting for readiness`));
    }, 30000);

    const handleData = (data) => {
      const str = data.toString();
      process.stdout.write(`[${name}] ${str}`);
      if (str.includes("Ready on")) {
        isReady = true;
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on("data", handleData);
    child.stderr.on("data", handleData);
    child.on("error", reject);
  });
};

const run = async () => {
  try {
    cleanup();
    console.log("Building project for wrangler...");
    execSync("npm run build", {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });

    console.log(
      `--- SIMULATING FEDERATED UNIVERSE (${NUM_PLANETS} PLANETS) ---`,
    );

    // Start planets sequentially to avoid overwhelming the system, but wait for readiness
    for (const planet of allPlanets) {
      await startPlanet(planet);
    }

    if (OPEN_BROWSER) {
      console.log("All planets are ready! Opening browser windows...");
      const urlsToOpen = [
        allPlanets[0].url, // First planet landing site
        ...allPlanets.map((p) => `${p.url}/control`), // All planets control centers
      ];
      const urls = urlsToOpen.join(" ");
      // On macOS, 'open' with multiple URLs opens them in tabs
      execSync(`open ${urls}`);
    } else {
      console.log(`All planets are ready! (pass --open to launch browser)`);
      allPlanets.forEach((p) => console.log(`  ${p.name}: ${p.url}`));
    }

    console.log("Simulation running. Press Ctrl+C to stop.");
  } catch (e) {
    console.error("Simulation failed to start:", e.message);
    cleanup();
    process.exit(1);
  }
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

run();
