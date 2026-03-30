import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import TrafficControl from '../../../traffic-control';
export { TrafficControl };

export const GET: APIRoute = async ({ request }) => {
  const { TRAFFIC_CONTROL } = (env as any);

  if (!TRAFFIC_CONTROL) {
    return new Response("Durable Object binding not found", { status: 500 });
  }

  const isWebSocket = request.headers.get("Upgrade") === "websocket";
  const id = TRAFFIC_CONTROL.idFromName('global');
  const obj = TRAFFIC_CONTROL.get(id);

  try {
    return await obj.fetch(request);
  } catch (e: any) {
    return new Response(`DO fetch error: ${e.message}`, { status: 500 });
  }
};
