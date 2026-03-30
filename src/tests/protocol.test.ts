import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawn, execSync, type ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "../../");

const NUM_PLANETS = 4; // Minimal quorum size (3f + 1 where f=1)
const BASE_PORT = 4000;
const BASE_INSPECTOR_PORT = 29229;

const allPlanets = Array.from({ length: NUM_PLANETS }, (_, i) => ({
  name: `Towel ${i + 1}`,
  url: `http://towel-${i + 1}.localhost:${BASE_PORT + i}`,
  port: BASE_PORT + i,
  id: i + 1,
}));

const processes: ChildProcess[] = [];

const cleanup = () => {
  console.log("Cleaning up processes...");
  processes.forEach((p) => {
    try {
      p.kill();
    } catch (e) {}
  });
  try {
    execSync("pkill -f 'test-planet' || true");
  } catch (e) {}
};

const startPlanet = (planet: (typeof allPlanets)[0]) => {
  const { id, name, url, port } = planet;
  const inspectorPort = BASE_INSPECTOR_PORT + id;

  // Initialize Database first
  console.log(`[${name}] Initializing database...`);
  execSync(
    `npx wrangler d1 execute planet_db --file=schema.sql -c wrangler.dev.jsonc --local --persist-to=.wrangler/state/test-planet-${id}`,
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
    },
  );

  const child = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      port.toString(),
      "--inspector-port",
      inspectorPort.toString(),
      "-c",
      "wrangler.dev.jsonc",
      "--persist-to",
      `.wrangler/state/test-planet-${id}`,
      "--var",
      `PUBLIC_SIM_PLANET_NAME:"${name}"`,
      "--var",
      `PUBLIC_SIM_LANDING_SITE:"${url}"`,
      "--var",
      `PUBLIC_SIM_WARP_LINKS:'${JSON.stringify(allPlanets.filter((p) => p.url !== url).map((n) => ({ name: n.name, url: n.url })))}'`,
    ],
    {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    },
  );

  processes.push(child);

  return new Promise<void>((resolve, reject) => {
    let isReady = false;
    const timeout = setTimeout(() => {
      if (!isReady)
        reject(new Error(`[${name}] Timed out waiting for readiness`));
    }, 45000); // Increased timeout for CI/slow environments

    const handleData = (data: Buffer) => {
      const str = data.toString();
      process.stdout.write(`[${name}] ${str}`);
      if (str.includes("Ready on")) {
        isReady = true;
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);
    child.on("error", reject);
  });
};

describe("Federated Planets Protocol", () => {
  beforeAll(async () => {
    console.log(`Starting ${NUM_PLANETS} planets...`);
    const startupPromises = allPlanets.map((p) => startPlanet(p));
    await Promise.all(startupPromises);
  }, 120000); // 2 minute setup timeout

  afterAll(() => {
    cleanup();
  });

  it("should reach quorum when initiating a jump", async () => {
    console.log("Initiating jump from Towel 1 to Towel 2...");
    const response = await fetch(
      `${allPlanets[0].url}/api/v1/port?action=initiate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ship_id: "TEST-SHIP",
          destination_url: allPlanets[1].url,
          departure_timestamp: Date.now(),
        }),
      },
    );

    expect(response.ok).toBe(true);
    const data = (await response.json()) as any;
    expect(data.plan.id).toBeDefined();
    console.log("Plan initiated:", data.plan.id);

    console.log("Monitoring events for QUORUM_REACHED...");
    let quorumReached = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));

      const eventsRes = await fetch(`${allPlanets[0].url}/api/v1/control-ws`);
      if (eventsRes.ok) {
        const events = (await eventsRes.json()) as any[];
        const quorumEvent = events.find((e) => e.type === "QUORUM_REACHED");
        const errorEvent = events.find((e) => e.type === "API_ERROR");

        if (errorEvent) {
          console.error("API ERROR DETECTED:", errorEvent.error);
        }

        if (quorumEvent) {
          console.log("SUCCESS: Quorum reached!");
          quorumReached = true;
          break;
        }
      }
      console.log(`Waiting for quorum... (attempt ${attempt + 1}/30)`);
    }

    expect(quorumReached).toBe(true);
  }, 90000); // 90s test timeout
});
