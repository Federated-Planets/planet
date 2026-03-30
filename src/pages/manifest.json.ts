import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

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
    name: simName || "Towel 42 Space Outpost",
    description:
      "A remote outpost in the Federated Planets. A quiet spot for deep-space weary travelers. Don't panic, but bring a towel.",
    landing_site: landingSite,
    space_port: `${landingSite}/api/v1/port`,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/json",
    },
  });
};
