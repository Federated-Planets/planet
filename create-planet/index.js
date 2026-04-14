#!/usr/bin/env node
import * as p from "@clack/prompts";
import { execSync, execFileSync } from "child_process";
import {
  cpSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "fs";
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

const isPlanetDir = (dir) => {
  const configPath = path.join(dir, "src/lib/config.ts");
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(configPath) || !existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const hasWrangler =
      (pkg.devDependencies && pkg.devDependencies.wrangler) ||
      (pkg.dependencies && pkg.dependencies.wrangler) ||
      (pkg.scripts &&
        Object.values(pkg.scripts).some((s) => /wrangler/.test(String(s))));
    return Boolean(hasWrangler);
  } catch {
    return false;
  }
};

const extractConfigSections = (content) => ({
  nameStmt: content.match(/export const PLANET_NAME =[^;]*;/)?.[0],
  descStmt: content.match(/export const PLANET_DESCRIPTION =[\s\S]*?;/)?.[0],
  linksStmt: content.match(
    /export const DEFAULT_WARP_LINKS = \[[\s\S]*?\];/,
  )?.[0],
});

const applyConfigSections = (filePath, sections) => {
  let content = readFileSync(filePath, "utf-8");
  if (sections.nameStmt) {
    content = content.replace(
      /export const PLANET_NAME =[^;]*;/,
      sections.nameStmt,
    );
  }
  if (sections.descStmt) {
    content = content.replace(
      /export const PLANET_DESCRIPTION =[\s\S]*?;/,
      sections.descStmt,
    );
  }
  if (sections.linksStmt) {
    content = content.replace(
      /export const DEFAULT_WARP_LINKS = \[[\s\S]*?\];/,
      sections.linksStmt,
    );
  }
  writeFileSync(filePath, content);
};

const mergePackageJson = (templatePkg, userPkg) => ({
  ...templatePkg,
  name: userPkg.name || templatePkg.name,
  dependencies: {
    ...(userPkg.dependencies || {}),
    ...(templatePkg.dependencies || {}),
  },
  devDependencies: {
    ...(userPkg.devDependencies || {}),
    ...(templatePkg.devDependencies || {}),
  },
  scripts: {
    ...(userPkg.scripts || {}),
    ...(templatePkg.scripts || {}),
  },
});

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

const onCancel = () => {
  p.cancel("Setup cancelled.");
  process.exit(0);
};

const writeWranglerDeployIfMissing = (outDir, workerName) => {
  const deployPath = path.join(outDir, "wrangler.deploy.jsonc");
  if (existsSync(deployPath)) return false;
  const wranglerConfig = {
    name: workerName,
    main: "dist/server/entry.mjs",
    compatibility_date: "2026-03-31",
    assets: { directory: "dist/client", binding: "STATIC_ASSETS" },
    durable_objects: {
      bindings: [{ name: "TRAFFIC_CONTROL", class_name: "TrafficControl" }],
    },
    migrations: [{ tag: "v1", new_sqlite_classes: ["TrafficControl"] }],
  };
  writeFileSync(deployPath, JSON.stringify(wranglerConfig, null, 2) + "\n");
  return true;
};

const runCreate = async (outDir, dirLabel) => {
  const answers = await p.group(
    {
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
      workerName: () =>
        p.text({
          message: "Cloudflare worker name",
          placeholder: dirLabel,
          defaultValue: dirLabel,
          validate: (v) => (v.trim() ? undefined : "Worker name is required"),
        }),
    },
    { onCancel },
  );

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

  s.start("Copying template files...");
  mkdirSync(outDir, { recursive: true });
  cpSync(TEMPLATE_DIR, outDir, { recursive: true });
  s.stop("Template copied.");

  s.start("Configuring planet...");
  const configPath = path.join(outDir, "src/lib/config.ts");
  const warpLinks = answers.warpLinks
    ? answers.warpLinks
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean)
    : [];
  patchConfigTs(
    configPath,
    answers.planetName,
    answers.planetDescription,
    warpLinks,
  );
  s.stop("Planet configured.");

  const pkgPath = path.join(outDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.name = answers.workerName;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  s.start("Writing wrangler.deploy.jsonc...");
  writeWranglerDeployIfMissing(outDir, answers.workerName);
  s.stop("wrangler.deploy.jsonc written.");

  p.outro(
    `Your planet is ready!\n\n  cd ${dirLabel}\n  npm install\n  npm run dev\n\nTo deploy, connect ${dirLabel} to Cloudflare Workers CI\nand set the deploy command to: npm run deploy`,
  );
};

const runUpdate = async (outDir, dirLabel) => {
  const proceed = await p.confirm({
    message: `"${dirLabel}" looks like an existing planet. Update it to the latest template?`,
    initialValue: true,
  });
  if (p.isCancel(proceed) || !proceed) onCancel();

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

  const configPath = path.join(outDir, "src/lib/config.ts");
  const pkgPath = path.join(outDir, "package.json");

  s.start("Reading existing planet configuration...");
  const existingConfig = extractConfigSections(
    readFileSync(configPath, "utf-8"),
  );
  const existingPkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const workerName = existingPkg.name;
  s.stop(`Preserving planet identity (worker: ${workerName}).`);

  s.start("Overlaying latest template files...");
  cpSync(TEMPLATE_DIR, outDir, { recursive: true });
  s.stop("Template files overlaid.");

  s.start("Restoring planet configuration...");
  applyConfigSections(configPath, existingConfig);
  s.stop("Planet configuration restored.");

  s.start("Merging package.json...");
  const templatePkg = JSON.parse(
    readFileSync(path.join(TEMPLATE_DIR, "package.json"), "utf-8"),
  );
  const mergedPkg = mergePackageJson(templatePkg, existingPkg);
  writeFileSync(pkgPath, JSON.stringify(mergedPkg, null, 2) + "\n");
  s.stop("package.json merged.");

  const wroteDeploy = writeWranglerDeployIfMissing(outDir, workerName);
  if (wroteDeploy) {
    p.note(
      "wrangler.deploy.jsonc was missing and has been generated.",
      "Deploy config",
    );
  }

  p.outro(
    `Planet updated!\n\n  cd ${dirLabel}\n  npm install\n  git diff   # review changes\n  npm run dev`,
  );
};

const main = async () => {
  p.intro("Welcome to Federated Planets — create or update a planet");

  const dirAnswer = await p.text({
    message: "Planet directory",
    placeholder: "my-planet",
    defaultValue: "my-planet",
    validate: (v) => (v.trim() ? undefined : "Directory name is required"),
  });
  if (p.isCancel(dirAnswer)) onCancel();

  const dirLabel = dirAnswer;
  const outDir = path.resolve(dirLabel);

  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    if (isPlanetDir(outDir)) {
      await runUpdate(outDir, dirLabel);
      return;
    }
    p.cancel(
      `Directory "${dirLabel}" already exists, is not empty, and doesn't look like a planet.`,
    );
    process.exit(1);
  }

  await runCreate(outDir, dirLabel);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
