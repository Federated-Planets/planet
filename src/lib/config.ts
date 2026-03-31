export const DEFAULT_WARP_LINKS = [
  {
    name: "Federation Prime",
    url: "https://prime.federatedplanets.com/",
  },
  { name: "Waystation Meridian", url: "https://waystation.federatedplanets.com/" },
  { name: "The Interchange", url: "https://interchange.federatedplanets.com/" },
  { name: "Port Cassini", url: "https://port-cassini.federatedplanets.com/" },
  { name: "Terminus Reach", url: "https://terminus.federatedplanets.com/" },
  { name: "Driftyard Seven", url: "https://driftyard.federatedplanets.com/" },
  { name: "Towel 42 Space Outpost", url: "https://towel-42.federatedplanets.com/" },
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
  const landingSite = getSimVar("PUBLIC_SIM_LANDING_SITE")?.replace(/\/$/, "");
  try {
    const simLinks = getSimVar("PUBLIC_SIM_WARP_LINKS");
    if (simLinks) {
      return JSON.parse(simLinks);
    }
  } catch (e) {}
  if (!landingSite) return DEFAULT_WARP_LINKS;
  return DEFAULT_WARP_LINKS.filter(
    (l) => l.url.replace(/\/$/, "") !== landingSite,
  );
};

export const WARP_LINKS = getWarpLinks();
