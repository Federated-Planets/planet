export const DEFAULT_WARP_LINKS = [
  {
    name: "Federation Prime",
    url: "https://prime.federatedplanets.com/",
  },
  { name: "Aether Reach", url: "https://aether.reach.io" },
  { name: "Iron Star Forge", url: "https://ironstar.forge" },
  { name: "Neon Nebula", url: "https://neon.nebula.web" },
  { name: "Crystal Spire", url: "https://crystal.spire.planet" },
  { name: "Rust Belt Outpost", url: "https://rustbelt.outpost.space" },
  { name: "Nova Prime", url: "https://nova.prime.core" },
  { name: "Solaris Gate", url: "https://solaris.gate.link" },
  { name: "Void Runner Base", url: "https://void.runner.base" },
  { name: "Starlight Bazaar", url: "https://starlight.bazaar.trade" },
  { name: "Obsidian Moon", url: "https://obsidian.moon.base" },
  { name: "Elysium Station", url: "https://elysium.station.xyz" },
  { name: "Titan's Grip", url: "https://titans.grip.mining" },
  { name: "Frozen Peak", url: "https://frozen.peak.outpost" },
  { name: "Gale Force V", url: "https://galeforce.five.storm" },
  { name: "The Monolith", url: "https://the.monolith.mystery" },
  { name: "Explorers Outpost", url: "https://www.nasa.gov/" },
];

import { env as cloudflareEnv } from "cloudflare:workers";

// Robust helper to get simulation variables from any available environment source
const getSimVar = (name: string): string | undefined => {
  // 1. Check Cloudflare env object (for wrangler dev --var)
  const env = cloudflareEnv as any;
  if (env && env[name]) return env[name];

  // 2. Check process.env (traditional node/dev env)
  if (typeof process !== "undefined" && process.env && process.env[name])
    return process.env[name];

  // 3. Check import.meta.env (build-time or astro-provided)
  if (import.meta.env && import.meta.env[name]) return import.meta.env[name];

  return undefined;
};

export const getWarpLinks = () => {
  try {
    const simLinks = getSimVar("PUBLIC_SIM_WARP_LINKS");
    if (simLinks) {
      return JSON.parse(simLinks);
    }
  } catch (e) {}
  return DEFAULT_WARP_LINKS;
};

export const WARP_LINKS = getWarpLinks();
