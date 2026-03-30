/**
 * Post-build script that patches dist/server/entry.mjs to export Durable Object
 * classes required by Cloudflare Workers. Astro's build doesn't re-export these
 * from the entrypoint, causing "Worker depends on Durable Objects not exported
 * in entrypoint" errors.
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const serverDir = "dist/server";
const chunksDir = join(serverDir, "chunks");
const entryFile = join(serverDir, "entry.mjs");

// Map of DO class names to search for in chunks
const durableObjects = ["TrafficControl"];

for (const className of durableObjects) {
  // Find the chunk containing this DO class
  const chunks = readdirSync(chunksDir);
  let targetChunk = null;

  for (const chunk of chunks) {
    if (!chunk.endsWith(".mjs")) continue;
    const content = readFileSync(join(chunksDir, chunk), "utf-8");
    if (content.includes(`class ${className} extends DurableObject`)) {
      targetChunk = chunk;
      break;
    }
  }

  if (!targetChunk) {
    console.error(
      `[inject-do-exports] Could not find ${className} in any chunk`,
    );
    process.exit(1);
  }

  // Add named export to the chunk file
  const chunkPath = join(chunksDir, targetChunk);
  let chunkContent = readFileSync(chunkPath, "utf-8");
  if (!chunkContent.includes(`export { ${className}`)) {
    chunkContent = chunkContent.replace(
      /export \{\s*page\s*\};/,
      `export {\n  page,\n  ${className}\n};`,
    );
    writeFileSync(chunkPath, chunkContent);
    console.log(
      `[inject-do-exports] Exported ${className} from chunks/${targetChunk}`,
    );
  }

  // Re-export from entry.mjs
  let entryContent = readFileSync(entryFile, "utf-8");
  if (!entryContent.includes(className)) {
    entryContent += `export { ${className} } from './chunks/${targetChunk}';\n`;
    writeFileSync(entryFile, entryContent);
    console.log(`[inject-do-exports] Re-exported ${className} in entry.mjs`);
  }
}

console.log("[inject-do-exports] Done");
