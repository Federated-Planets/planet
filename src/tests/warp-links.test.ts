import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawn, execSync, type ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "../../");

const TEST_PORT = 4500;
const TEST_HOST = "towel-warp-test.localhost";
const TEST_NAME = "Warp Test Planet";
const TEST_LINKS = [
  { name: "Test Link Alpha", url: "https://alpha.test" },
  { name: "Test Link Beta", url: "https://beta.test" },
];

const processes: ChildProcess[] = [];

const cleanup = () => {
  console.log("Cleaning up...");
  processes.forEach((p) => {
    try {
      p.kill();
    } catch (e) {}
  });
  try {
    execSync("pkill -f 'warp-test' || true");
  } catch (e) {}
};

describe("Warp Links Configuration", () => {
  beforeAll(async () => {
    console.log(`[${TEST_NAME}] Clearing previous state...`);
    execSync(`rm -rf .wrangler/state/warp-test`, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
    });

    console.log(`Starting ${TEST_NAME} on http://${TEST_HOST}:${TEST_PORT}...`);

    const child = spawn(
      "npx",
      [
        "wrangler",
        "dev",
        "--port",
        TEST_PORT.toString(),
        "-c",
        "wrangler.dev.jsonc",
        "--persist-to",
        ".wrangler/state/warp-test",
        "--var",
        `PUBLIC_SIM_PLANET_NAME:"${TEST_NAME}"`,
        "--var",
        `PUBLIC_SIM_LANDING_SITE:"http://${TEST_HOST}:${TEST_PORT}"`,
        "--var",
        `PUBLIC_SIM_WARP_LINKS:'${JSON.stringify(TEST_LINKS)}'`,
      ],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      },
    );

    processes.push(child);

    await new Promise<void>((resolve, reject) => {
      let isReady = false;
      const timeout = setTimeout(() => {
        if (!isReady)
          reject(new Error(`[${TEST_NAME}] Timed out waiting for readiness`));
      }, 45000);

      const handleData = (data: Buffer) => {
        const str = data.toString();
        process.stdout.write(`[${TEST_NAME}] ${str}`);
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
  }, 60000);

  afterAll(() => {
    cleanup();
  });

  it("should override planet name in manifest", async () => {
    const response = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/manifest.json`,
    );
    expect(response.ok).toBe(true);
    const manifest = (await response.json()) as any;
    expect(manifest.name).toBe(TEST_NAME);
  });

  it("should correctly override warp links on homepage", async () => {
    const homeRes = await fetch(`http://${TEST_HOST}:${TEST_PORT}/`);
    expect(homeRes.ok).toBe(true);
    const html = await homeRes.text();

    expect(html).toContain("Test Link Alpha");
    expect(html).toContain("Test Link Beta");
    expect(html).not.toContain("Aether Reach"); // Default link should be absent
  });
});
