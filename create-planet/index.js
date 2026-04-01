#!/usr/bin/env node
import * as p from "@clack/prompts";
import { execSync, execFileSync } from "child_process";
import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, "template");

const WARP_LINK_SUGGESTIONS = [
  "https://prime.federatedplanets.com/",
  "https://waystation.federatedplanets.com/",
  "https://interchange.federatedplanets.com/",
  "https://port-cassini.federatedplanets.com/",
  "https://terminus.federatedplanets.com/",
  "https://driftyard.federatedplanets.com/",
  "https://towel-42.federatedplanets.com/",
];

const checkWrangler = () => {
  try {
    execSync("wrangler whoami", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

const runWrangler = (args) => {
  try {
    const output = execFileSync("npx", ["wrangler", ...args], {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return output;
  } catch (e) {
    return e.stdout || "";
  }
};

const parseKvId = (output) => {
  const match = output.match(/"id":\s*"([^"]+)"/);
  return match?.[1] ?? null;
};

const parseD1Id = (output) => {
  const match = output.match(/"uuid":\s*"([^"]+)"/);
  return match?.[1] ?? null;
};

const patchConfigTs = (filePath, name, description, warpLinks) => {
  let content = readFileSync(filePath, "utf-8");

  content = content.replace(
    /export const PLANET_NAME = ".*?";/,
    `export const PLANET_NAME = ${JSON.stringify(name)};`,
  );

  content = content.replace(
    /export const PLANET_DESCRIPTION =\s*"[\s\S]*?";/,
    `export const PLANET_DESCRIPTION =\n  ${JSON.stringify(description)};`,
  );

  if (warpLinks.length > 0) {
    const linksTs = warpLinks
      .map((url, i) => {
        const name = url
          .replace(/https?:\/\//, "")
          .replace(/\/$/, "")
          .split(".")[0]
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return i === 0
          ? `  {\n    name: ${JSON.stringify(name)},\n    url: ${JSON.stringify(url)},\n  }`
          : `  { name: ${JSON.stringify(name)}, url: ${JSON.stringify(url)} }`;
      })
      .join(",\n");
    content = content.replace(
      /export const DEFAULT_WARP_LINKS = \[[\s\S]*?\];/,
      `export const DEFAULT_WARP_LINKS = [\n${linksTs},\n];`,
    );
  }

  writeFileSync(filePath, content);
};

const main = async () => {
  p.intro("Welcome to Federated Planets — create a new planet");

  const answers = await p.group(
    {
      dir: () =>
        p.text({
          message: "Output directory",
          placeholder: "my-planet",
          defaultValue: "my-planet",
          validate: (v) => (v.trim() ? undefined : "Directory name is required"),
        }),
      planetName: () =>
        p.text({
          message: "Planet name",
          placeholder: "My Space Outpost",
          defaultValue: "My Space Outpost",
          validate: (v) => (v.trim() ? undefined : "Planet name is required"),
        }),
      planetDescription: () =>
        p.text({
          message: "Planet description",
          placeholder: "A remote outpost in the Federated Planets.",
          defaultValue: "A remote outpost in the Federated Planets.",
        }),
      warpLinks: () =>
        p.text({
          message: `Warp links (comma-separated URLs, leave empty to use defaults)\nSuggestions: ${WARP_LINK_SUGGESTIONS.slice(0, 4).join(", ")} ...`,
          placeholder: "(leave empty for defaults)",
        }),
      workerName: ({ results }) =>
        p.text({
          message: "Cloudflare worker name",
          placeholder: results.dir,
          defaultValue: results.dir,
          validate: (v) => (v.trim() ? undefined : "Worker name is required"),
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  const outDir = path.resolve(answers.dir);

  // Validate output directory
  if (existsSync(outDir)) {
    const files = readdirSync(outDir);
    if (files.length > 0) {
      p.cancel(`Directory "${answers.dir}" already exists and is not empty.`);
      process.exit(1);
    }
  }

  // Check wrangler auth
  const s = p.spinner();
  s.start("Checking Wrangler authentication...");
  if (!checkWrangler()) {
    s.stop("Wrangler not authenticated.");
    p.note(
      "Run `npx wrangler login` to authenticate, then try again.",
      "Authentication required",
    );
    process.exit(1);
  }
  s.stop("Wrangler authenticated.");

  // Copy template
  s.start("Copying template files...");
  mkdirSync(outDir, { recursive: true });
  cpSync(TEMPLATE_DIR, outDir, { recursive: true });
  s.stop("Template copied.");

  // Patch config.ts
  s.start("Configuring planet...");
  const configPath = path.join(outDir, "src/lib/config.ts");
  const warpLinks = answers.warpLinks
    ? answers.warpLinks.split(",").map((u) => u.trim()).filter(Boolean)
    : [];
  patchConfigTs(configPath, answers.planetName, answers.planetDescription, warpLinks);
  s.stop("Planet configured.");

  // Update package.json name
  const pkgPath = path.join(outDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.name = answers.workerName;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // Create Cloudflare resources
  s.start("Creating KV namespace...");
  const kvOutput = runWrangler(["kv", "namespace", "create", "KV", "--json"]);
  const kvId = parseKvId(kvOutput);
  if (!kvId) {
    s.stop("Failed to create KV namespace.");
    p.note(kvOutput, "Wrangler output");
    process.exit(1);
  }
  s.stop(`KV namespace created: ${kvId}`);

  s.start("Creating D1 database...");
  const d1Output = runWrangler(["d1", "create", "planet_db", "--json"]);
  const d1Id = parseD1Id(d1Output);
  if (!d1Id) {
    s.stop("Failed to create D1 database.");
    p.note(d1Output, "Wrangler output");
    process.exit(1);
  }
  s.stop(`D1 database created: ${d1Id}`);

  // Write wrangler.jsonc
  s.start("Writing wrangler.jsonc...");
  const wranglerConfig = {
    name: answers.workerName,
    main: "dist/server/entry.mjs",
    compatibility_date: "2026-03-31",
    assets: { directory: "dist/client", binding: "STATIC_ASSETS" },
    d1_databases: [
      {
        binding: "DB",
        database_name: "planet_db",
        database_id: d1Id,
        migrations_dir: "migrations",
      },
    ],
    kv_namespaces: [{ binding: "KV", id: kvId }],
    durable_objects: {
      bindings: [{ name: "TRAFFIC_CONTROL", class_name: "TrafficControl" }],
    },
    migrations: [{ tag: "v1", new_classes: ["TrafficControl"] }],
  };
  writeFileSync(
    path.join(outDir, "wrangler.jsonc"),
    JSON.stringify(wranglerConfig, null, 2) + "\n",
  );
  s.stop("wrangler.jsonc written.");

  p.outro(
    `Your planet is ready!\n\n  cd ${answers.dir}\n  npm install\n  npm run dev\n\nTo deploy, connect ${answers.dir} to Cloudflare Workers CI\nand set the deploy command to: npx wrangler deploy -c wrangler.jsonc`,
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
