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

  // Clear any state left over from a prior test run
  console.log(`[${name}] Clearing previous state...`);
  execSync(`rm -rf .wrangler/state/test-planet-${id}`, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });

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

async function getQuorumCount(planetUrl: string): Promise<number> {
  const res = await fetch(`${planetUrl}/api/v1/control-ws`);
  if (!res.ok) return 0;
  const events = (await res.json()) as any[];
  return events.filter((e) => e.type === "QUORUM_REACHED").length;
}

async function collectQuorumPlanIds(
  planetUrls: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const url of planetUrls) {
    try {
      const res = await fetch(`${url}/api/v1/control-ws`);
      if (res.ok) {
        const events = (await res.json()) as any[];
        for (const e of events) {
          if (e.type === "QUORUM_REACHED" && e.plan_id) ids.add(e.plan_id);
        }
      }
    } catch {}
  }
  return ids;
}

async function waitForPlanQuorum(
  allUrls: string[],
  planId: string,
  label: string,
) {
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const ids = await collectQuorumPlanIds(allUrls);
    if (ids.has(planId)) {
      console.log(`SUCCESS: ${label}`);
      return;
    }
    console.log(`Waiting for ${label}... (attempt ${attempt + 1}/30)`);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

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

  it("should reject a third shuttle when the mutual-neighbor limit (2) is reached", async () => {
    // Towel 3 and Towel 4 are mutual neighbors of each other; limit is 2
    const origin = allPlanets[2]; // Towel 3
    const dest = allPlanets[3]; // Towel 4
    const allUrls = allPlanets.map((p) => p.url);

    const initiate = (shipId: string) =>
      fetch(`${origin.url}/api/v1/port?action=initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ship_id: shipId,
          destination_url: dest.url,
          departure_timestamp: Date.now(),
        }),
      });

    // Shuttle 1
    console.log("Initiating shuttle 1 from Towel 3 to Towel 4...");
    const res1 = await initiate("SHUTTLE-A");
    expect(res1.ok).toBe(true);
    const plan1Id = ((await res1.json()) as any).plan.id;
    console.log("Shuttle 1 plan:", plan1Id);
    await waitForPlanQuorum(allUrls, plan1Id, "shuttle 1 quorum");
    // Give origin's handleCommit time to write to its own DB after quorum is reached
    await new Promise((r) => setTimeout(r, 3000));

    // Shuttle 2
    console.log("Initiating shuttle 2 from Towel 3 to Towel 4...");
    const res2 = await initiate("SHUTTLE-B");
    expect(res2.ok).toBe(true);
    const plan2Id = ((await res2.json()) as any).plan.id;
    console.log("Shuttle 2 plan:", plan2Id);
    await waitForPlanQuorum(allUrls, plan2Id, "shuttle 2 quorum");
    // Give origin's handleCommit time to write to its own DB after quorum is reached
    await new Promise((r) => setTimeout(r, 3000));

    // Shuttle 3 — should be rejected at origin
    console.log("Initiating shuttle 3 (should be rejected)...");
    const res3 = await initiate("SHUTTLE-C");
    expect(res3.status).toBe(422);
    const data3 = (await res3.json()) as any;
    expect(data3.error).toBe("shuttle_limit_exceeded");
    expect(data3.limit).toBe(2);
    expect(data3.relationship).toBe("mutual_neighbors");
    expect(data3.active_shuttles).toBe(2);
    console.log("Shuttle 3 correctly rejected:", data3);
  }, 180000); // 3 minutes for two quorum rounds

  it("should refuse incoming travel at the destination when its shuttle limit is already reached", async () => {
    // Use Towel 1 → Towel 3 (mutual neighbors, limit = 2).
    // First establish 2 legitimate shuttles so Towel 3's DB is at the limit.
    // Then use the test-only bypass header to skip Towel 1's origin check —
    // the plan proceeds through consensus but Towel 3 refuses registration.
    const origin = allPlanets[0]; // Towel 1
    const dest = allPlanets[2]; // Towel 3
    const allUrls = allPlanets.map((p) => p.url);

    const initiate = (shipId: string, bypass = false) =>
      fetch(`${origin.url}/api/v1/port?action=initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bypass ? { "X-Bypass-Shuttle-Limit": "true" } : {}),
        },
        body: JSON.stringify({
          ship_id: shipId,
          destination_url: dest.url,
          departure_timestamp: Date.now(),
        }),
      });

    // Fill Towel 3's limit with 2 legitimate shuttles from Towel 1
    console.log("Filling Towel 3 limit with 2 shuttles from Towel 1...");
    const fillRes1 = await initiate("FILL-A");
    expect(fillRes1.ok).toBe(true);
    const fillPlan1 = ((await fillRes1.json()) as any).plan.id;
    await waitForPlanQuorum(allUrls, fillPlan1, "fill shuttle 1 quorum");

    const fillRes2 = await initiate("FILL-B");
    expect(fillRes2.ok).toBe(true);
    const fillPlan2 = ((await fillRes2.json()) as any).plan.id;
    await waitForPlanQuorum(allUrls, fillPlan2, "fill shuttle 2 quorum");

    // Now both Towel 1 and Towel 3 have count=2 for the 1↔3 pair.
    // Use the bypass header to skip Towel 1's origin check — the plan enters
    // consensus, but Towel 3 independently checks and refuses registration.
    console.log(
      "Initiating with bypass header — origin allows, destination should refuse...",
    );
    const response = await initiate("DEST-REFUSES", true);
    expect(response.ok).toBe(true);
    const planId = ((await response.json()) as any).plan.id;
    console.log("Bypass plan initiated:", planId);

    // Confirm no QUORUM_REACHED appears for this plan on any planet
    console.log(
      "Confirming destination refusal (no QUORUM_REACHED expected)...",
    );
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const quorumIds = await collectQuorumPlanIds(allUrls);
      if (quorumIds.has(planId)) {
        throw new Error(
          `Plan ${planId} should have been refused by destination but reached quorum`,
        );
      }
      console.log(
        `No QUORUM_REACHED seen (attempt ${attempt + 1}/10) — destination is refusing`,
      );
    }
    console.log("Confirmed: destination refused the travel plan");
  }, 300000); // 5 minutes: two fill quorum rounds + 20s destination refusal confirmation
});
