import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { PLANET_NAME, PLANET_DESCRIPTION } from "../lib/config";

export const GET: APIRoute = async ({ request }) => {
  // Robust helper to get simulation variables
  const getSimVar = (name: string): string | undefined => {
    if (env && (env as any)[name]) return (env as any)[name];
    if (
      typeof process !== "undefined" &&
      process.env &&
      (process.env as any)[name]
    )
      return (process.env as any)[name];
    if (import.meta.env && (import.meta.env as any)[name])
      return (import.meta.env as any)[name];
    return undefined;
  };

  const simUrl = getSimVar("PUBLIC_SIM_LANDING_SITE");
  const simName = getSimVar("PUBLIC_SIM_PLANET_NAME");

  const landingSite = simUrl || new URL(request.url).origin;

  const manifest: any = {
    name: simName || PLANET_NAME,
    description: PLANET_DESCRIPTION,
    landing_site: landingSite,
    space_port: `${landingSite}/api/v1/port`,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/json",
    },
  });
};
