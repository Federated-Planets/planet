import type { APIRoute } from 'astro';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { TravelCalculator, type PlanetManifest } from '../../../lib/travel';
import { CryptoCore } from '../../../lib/crypto';
import { PlanetIdentity } from '../../../lib/identity';
import { ConsensusEngine, type TravelPlan } from '../../../lib/consensus';
import { WARP_LINKS } from '../../../lib/config';
import { env } from 'cloudflare:workers';

const InitiateSchema = z.object({
  ship_id: z.string(),
  destination_url: z.string().url(),
  departure_timestamp: z.number(),
});

const TravelPlanSchema = z.object({
  id: z.string(),
  ship_id: z.string(),
  origin_url: z.string().url(),
  destination_url: z.string().url(),
  start_timestamp: z.number(),
  end_timestamp: z.number(),
  status: z.enum(['PREPARING', 'TRANSIT', 'ARRIVED']),
  traffic_controllers: z.array(z.string()),
  signatures: z.record(z.string()),
});

// Simulation Overrides helper
const getLocalPlanetInfo = (currentUrl: string) => {
    // Robust helper to get simulation variables
    const getSimVar = (name: string): string | undefined => {
        if (env && (env as any)[name]) return (env as any)[name];
        if (typeof process !== 'undefined' && process.env && (process.env as any)[name]) return (process.env as any)[name];
        if (import.meta.env && (import.meta.env as any)[name]) return (import.meta.env as any)[name];
        return undefined;
    };

    const simUrl = getSimVar('PUBLIC_SIM_LANDING_SITE');
    const simName = getSimVar('PUBLIC_SIM_PLANET_NAME');
    const origin = new URL(currentUrl).origin;
    const landingSite = simUrl || origin;
    
    return {
        name: simName || "Towel 42 Space Outpost",
        landing_site: landingSite,
        space_port: `${landingSite}/api/v1/port`
    };
};

async function broadcastEvent(TRAFFIC_CONTROL: DurableObjectNamespace, event: any) {
  if (!TRAFFIC_CONTROL || typeof TRAFFIC_CONTROL.idFromName !== 'function') {
      return;
  }
  try {
    const id = TRAFFIC_CONTROL.idFromName('global');
    const obj = TRAFFIC_CONTROL.get(id);
    const payload = JSON.stringify({ ...event, timestamp: Date.now() });
    console.log(`[broadcastEvent] Sending to DO: ${payload}`);
    // Fire and forget to avoid blocking or crashing on DO errors
    obj.fetch('http://do/events', {
      method: 'POST',
      body: payload
    }).then(res => {
        if (!res.ok) console.warn(`[broadcastEvent] DO responded with ${res.status}`);
    }).catch(e => console.warn(`[broadcastEvent] Background DO broadcast failed: ${e.message}`));
  } catch (e: any) {
    console.warn(`[broadcastEvent] Failed to initiate broadcast: ${e.message}`);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const { KV, DB, TRAFFIC_CONTROL } = (env as any);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  const localPlanet = getLocalPlanetInfo(request.url);

  console.log(`[${localPlanet.name}] Received ${request.method} request for action: ${action}`);

  try {
    await broadcastEvent(TRAFFIC_CONTROL, {
        type: 'API_REQUEST',
        planet: localPlanet.name,
        action,
        method: request.method
    });

    switch (action) {
      case 'initiate':
        return await handleInitiate(request, KV, DB, localPlanet, TRAFFIC_CONTROL);
      case 'prepare':
        return await handlePrepare(request, KV, DB, localPlanet, TRAFFIC_CONTROL);
      case 'commit':
        return await handleCommit(request, KV, DB, localPlanet, TRAFFIC_CONTROL);
      case 'land':
        return await handleLanding(request, KV, DB, localPlanet, TRAFFIC_CONTROL);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }
  } catch (e: any) {
    console.error(`[${localPlanet.name}] Action ${action} failed:`, e);
    await broadcastEvent(TRAFFIC_CONTROL, {
        type: 'API_ERROR',
        planet: localPlanet.name,
        action,
        error: e.message
    });
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

async function discoverSpacePort(landingSiteUrl: string, DB: D1Database): Promise<PlanetManifest | null> {
    try {
        const cached: any = await DB.prepare(`
            SELECT * FROM traffic_controllers 
            WHERE planet_url = ? 
            AND last_manifest_fetch > ?
        `).bind(landingSiteUrl, Date.now() - 3600000).first();

        if (cached) {
            return {
                name: cached.name,
                landing_site: cached.planet_url,
                space_port: cached.space_port_url
            };
        }

        const siteRes = await fetch(landingSiteUrl);
        const html = await siteRes.text();
        if (!html || !html.includes('rel="space-manifest"')) {
            return null;
        }
        const $ = cheerio.load(html);
        
        let manifestPath = $('link[rel="space-manifest"]').attr('href');
        if (!manifestPath) return null;

        const manifestUrl = new URL(manifestPath, landingSiteUrl).href;
        const manifestRes = await fetch(manifestUrl);
        
        if (!manifestRes.ok || !manifestRes.headers.get("content-type")?.includes("application/json")) {
            return null;
        }

        const remoteManifest: any = await manifestRes.json().catch(() => null);

        if (!remoteManifest || !remoteManifest.space_port) return null;

        const planet: PlanetManifest = {
            name: remoteManifest.name,
            landing_site: remoteManifest.landing_site || landingSiteUrl,
            space_port: remoteManifest.space_port
        };

        await DB.prepare(`
            INSERT OR REPLACE INTO traffic_controllers (planet_url, name, space_port_url, last_manifest_fetch)
            VALUES (?, ?, ?, ?)
        `).bind(planet.landing_site, planet.name, planet.space_port, Date.now()).run();

        return planet;
    } catch (e) {
        console.error(`Discovery failed for ${landingSiteUrl}:`, e);
        return null;
    }
}

async function handleInitiate(request: Request, KV: KVNamespace, DB: D1Database, localPlanet: any, TRAFFIC_CONTROL: any) {
  const body = await request.json();
  const data = InitiateSchema.parse(body);

  console.log(`[${localPlanet.name}] Initiating travel for ship ${data.ship_id} to ${data.destination_url}`);
  await broadcastEvent(TRAFFIC_CONTROL, {
      type: 'INITIATE_TRAVEL',
      planet: localPlanet.name,
      ship_id: data.ship_id,
      destination: data.destination_url
  });

  const myCoords = TravelCalculator.calculateCoordinates(localPlanet.landing_site);
  const destCoords = TravelCalculator.calculateCoordinates(data.destination_url);
  const distance = TravelCalculator.calculateDistance(myCoords, destCoords);
  const travelTimeHours = TravelCalculator.calculateTravelTime(distance);
  const endTimestamp = data.departure_timestamp + (travelTimeHours * 3600 * 1000);
  
  const discoveryPromises = WARP_LINKS.map(l => discoverSpacePort(l.url, DB));
  const discoveredNeighbors = (await Promise.all(discoveryPromises)).filter((n): n is PlanetManifest => n !== null);

  if (!discoveredNeighbors.find(n => n.landing_site === localPlanet.landing_site)) {
      discoveredNeighbors.push({
          name: localPlanet.name,
          landing_site: localPlanet.landing_site,
          space_port: localPlanet.space_port
      });
  }

  const seed = `${myCoords.x}${myCoords.y}${myCoords.z}${destCoords.x}${destCoords.y}${destCoords.z}${data.departure_timestamp}`;
  const electedTCs = TravelCalculator.electControllers(seed, discoveredNeighbors);

  const plan: TravelPlan = {
    id: crypto.randomUUID(),
    ship_id: data.ship_id,
    origin_url: localPlanet.landing_site,
    destination_url: data.destination_url,
    start_timestamp: data.departure_timestamp,
    end_timestamp: endTimestamp,
    status: 'PREPARING',
    traffic_controllers: electedTCs.map(tc => tc.landing_site),
    signatures: {}
  };

  const { privateKey } = await PlanetIdentity.getIdentity(KV);
  const signature = await CryptoCore.sign(JSON.stringify(plan), privateKey);
  plan.signatures[localPlanet.landing_site] = signature;

  await ConsensusEngine.savePlanState(KV, plan);
  await ConsensusEngine.broadcast(plan, 'prepare', electedTCs);

  return new Response(JSON.stringify({ plan }), { status: 200 });
}

async function handlePrepare(request: Request, KV: KVNamespace, DB: D1Database, localPlanet: any, TRAFFIC_CONTROL: any) {
  const plan = TravelPlanSchema.parse(await request.json());

  console.log(`[${localPlanet.name}] Preparing for travel plan ${plan.id} for ship ${plan.ship_id}`);
  await broadcastEvent(TRAFFIC_CONTROL, {
      type: 'PREPARE_PLAN',
      planet: localPlanet.name,
      ship_id: plan.ship_id,
      plan_id: plan.id
  });

  const originCoords = TravelCalculator.calculateCoordinates(plan.origin_url);
  const destCoords = TravelCalculator.calculateCoordinates(plan.destination_url);
  const dist = TravelCalculator.calculateDistance(originCoords, destCoords);
  const expectedTime = TravelCalculator.calculateTravelTime(dist);
  const actualTime = (plan.end_timestamp - plan.start_timestamp) / (3600 * 1000);
  
  if (Math.abs(actualTime - expectedTime) > 0.01) {
      throw new Error("Invalid travel time calculation.");
  }

  const { privateKey } = await PlanetIdentity.getIdentity(KV);
  const signature = await CryptoCore.sign(JSON.stringify(plan), privateKey);
  plan.signatures[localPlanet.landing_site] = signature;

  await ConsensusEngine.savePlanState(KV, plan);

  const controllersPromises = plan.traffic_controllers.map(url => discoverSpacePort(url, DB));
  const controllers = (await Promise.all(controllersPromises)).filter((n): n is PlanetManifest => n !== null);
  
  await ConsensusEngine.broadcast(plan, 'commit', controllers);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
async function handleCommit(request: Request, KV: KVNamespace, DB: D1Database, localPlanet: any, TRAFFIC_CONTROL: any) {
  const incomingPlan = TravelPlanSchema.parse(await request.json());
  const existing = await ConsensusEngine.getPlanState(KV, incomingPlan.id) || incomingPlan;

  console.log(`[${localPlanet.name}] Committing travel plan ${incomingPlan.id} (Existing signatures: ${Object.keys(existing.signatures).length}, New signatures: ${Object.keys(incomingPlan.signatures).length})`);

  existing.signatures = { ...existing.signatures, ...incomingPlan.signatures };
  await ConsensusEngine.savePlanState(KV, existing);

  if (ConsensusEngine.hasQuorum(existing)) {
      console.log(`[${localPlanet.name}] Quorum reached for plan ${existing.id}. Archiving mission.`);
      await broadcastEvent(TRAFFIC_CONTROL, {
          type: 'QUORUM_REACHED',
          planet: localPlanet.name,
          ship_id: existing.ship_id,
          plan_id: existing.id
      });
      await DB.prepare(`
          INSERT OR IGNORE INTO travel_plans (id, ship_id, origin_url, destination_url, start_timestamp, end_timestamp, status, signatures)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
          existing.id,
          existing.ship_id,
          existing.origin_url,
          existing.destination_url,
          existing.start_timestamp,
          existing.end_timestamp,
          existing.status,
          JSON.stringify(existing.signatures)
      ).run();

      await DB.prepare(`
          INSERT INTO mission_archive (ship_id, event, location_name, location_url, timestamp)
          VALUES (?, ?, ?, ?, ?)
      `).bind(
          existing.ship_id,
          'DEPARTED',
          new URL(existing.destination_url).hostname,
          existing.destination_url,
          Date.now()
      ).run();
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
async function handleLanding(request: Request, KV: KVNamespace, DB: D1Database, localPlanet: any, TRAFFIC_CONTROL: any) {
    const plan = TravelPlanSchema.parse(await request.json());

    console.log(`[${localPlanet.name}] Handling landing request for ship ${plan.ship_id} from ${plan.origin_url}`);

    if (plan.destination_url !== localPlanet.landing_site) {
        console.error(`[${localPlanet.name}] Landing rejected: Incorrect destination. Expected ${localPlanet.landing_site}, got ${plan.destination_url}`);
        throw new Error("Invalid destination for this space port.");
    }

    if (!ConsensusEngine.hasQuorum(plan)) {
        console.error(`[${localPlanet.name}] Landing rejected: Insufficient signatures.`);
        throw new Error("Insufficient signatures for landing authorization.");
    }

    if (Date.now() < plan.end_timestamp) {
        console.error(`[${localPlanet.name}] Landing rejected: Warp skip detected.`);
        throw new Error("Landing requested before End Timestamp. Warp skip detected.");
    }

    console.log(`[${localPlanet.name}] Landing authorization granted for ship ${plan.ship_id}.`);
    await broadcastEvent(TRAFFIC_CONTROL, {
        type: 'LANDING_AUTHORIZED',
        planet: localPlanet.name,
        ship_id: plan.ship_id
    });
    await DB.prepare(`
        INSERT INTO mission_archive (ship_id, event, location_name, location_url, timestamp)
        VALUES (?, ?, ?, ?, ?)
    `).bind(
        plan.ship_id,
        'ARRIVED',
        new URL(plan.origin_url).hostname,
        plan.origin_url,
        Date.now()
    ).run();

    await DB.prepare(`DELETE FROM travel_plans WHERE id = ?`).bind(plan.id).run();

    return new Response(JSON.stringify({ message: "Landing Authorization Granted. Welcome!" }), { status: 200 });
}
