import type { APIRoute } from 'astro';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { TravelCalculator, type PlanetManifest } from '../../../lib/travel';
import { CryptoCore } from '../../../lib/crypto';
import { PlanetIdentity } from '../../../lib/identity';
import { ConsensusEngine, type TravelPlan } from '../../../lib/consensus';
import { WARP_LINKS } from '../../../lib/config';
import manifest from '../../../../public/manifest.json';

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

import { env } from 'cloudflare:workers';

export const POST: APIRoute = async ({ request }) => {
  const { KV, DB } = (env as any);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    switch (action) {
      case 'initiate':
        return await handleInitiate(request, KV, DB);
      case 'prepare':
        return await handlePrepare(request, KV, DB);
      case 'commit':
        return await handleCommit(request, KV, DB);
      case 'land':
        return await handleLanding(request, KV, DB);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }
  } catch (e: any) {
    console.error(`Action ${action} failed:`, e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

/**
 * FULL DISCOVERY PROTOCOL
 */
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
        const $ = cheerio.load(html);
        
        let manifestPath = $('link[rel="space-manifest"]').attr('href');
        if (!manifestPath) return null;

        const manifestUrl = new URL(manifestPath, landingSiteUrl).href;
        const manifestRes = await fetch(manifestUrl);
        const remoteManifest = await manifestRes.json();

        if (!remoteManifest.space_port) return null;

        const planet: PlanetManifest = {
            name: remoteManifest.name,
            landing_site: remoteManifest.landing_site,
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

/**
 * Origin Planet: Initiates the journey
 */
async function handleInitiate(request: Request, KV: KVNamespace, DB: D1Database) {
  const body = await request.json();
  const data = InitiateSchema.parse(body);

  const myCoords = TravelCalculator.calculateCoordinates(manifest.landing_site);
  const destCoords = TravelCalculator.calculateCoordinates(data.destination_url);
  const distance = TravelCalculator.calculateDistance(myCoords, destCoords);
  const travelTimeHours = TravelCalculator.calculateTravelTime(distance);
  
  const endTimestamp = data.departure_timestamp + (travelTimeHours * 3600 * 1000);
  
  const discoveryPromises = WARP_LINKS.map(l => discoverSpacePort(l.url, DB));
  const discoveredNeighbors = (await Promise.all(discoveryPromises)).filter((n): n is PlanetManifest => n !== null);

  if (!discoveredNeighbors.find(n => n.landing_site === manifest.landing_site)) {
      discoveredNeighbors.push({
          name: manifest.name,
          landing_site: manifest.landing_site,
          space_port: manifest.space_port
      });
  }

  const seed = `${myCoords.x}${myCoords.y}${myCoords.z}${destCoords.x}${destCoords.y}${destCoords.z}${data.departure_timestamp}`;
  const electedTCs = TravelCalculator.electControllers(seed, discoveredNeighbors);

  const plan: TravelPlan = {
    id: crypto.randomUUID(),
    ship_id: data.ship_id,
    origin_url: manifest.landing_site,
    destination_url: data.destination_url,
    start_timestamp: data.departure_timestamp,
    end_timestamp: endTimestamp,
    status: 'PREPARING',
    traffic_controllers: electedTCs.map(tc => tc.landing_site),
    signatures: {}
  };

  const { privateKey } = await PlanetIdentity.getIdentity(KV);
  const signature = await CryptoCore.sign(JSON.stringify(plan), privateKey);
  plan.signatures[manifest.landing_site] = signature;

  await ConsensusEngine.savePlanState(KV, plan);
  await ConsensusEngine.broadcast(plan, 'prepare', electedTCs);

  return new Response(JSON.stringify({ plan }), { status: 200 });
}

async function handlePrepare(request: Request, KV: KVNamespace, DB: D1Database) {
  const plan = TravelPlanSchema.parse(await request.json());

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
  plan.signatures[manifest.landing_site] = signature;

  await ConsensusEngine.savePlanState(KV, plan);

  const controllersPromises = plan.traffic_controllers.map(url => discoverSpacePort(url, DB));
  const controllers = (await Promise.all(controllersPromises)).filter((n): n is PlanetManifest => n !== null);
  
  await ConsensusEngine.broadcast(plan, 'commit', controllers);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

async function handleCommit(request: Request, KV: KVNamespace, DB: D1Database) {
  const incomingPlan = TravelPlanSchema.parse(await request.json());
  const existing = await ConsensusEngine.getPlanState(KV, incomingPlan.id) || incomingPlan;
  
  existing.signatures = { ...existing.signatures, ...incomingPlan.signatures };
  await ConsensusEngine.savePlanState(KV, existing);

  if (ConsensusEngine.hasQuorum(existing)) {
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

/**
 * Destination Planet: Completes the landing sequence
 */
async function handleLanding(request: Request, KV: KVNamespace, DB: D1Database) {
    const plan = TravelPlanSchema.parse(await request.json());

    // 1. Verify we are the destination
    if (plan.destination_url !== manifest.landing_site) {
        throw new Error("Invalid destination for this space port.");
    }

    // 2. Verify Quorum of signatures
    if (!ConsensusEngine.hasQuorum(plan)) {
        throw new Error("Insufficient signatures for landing authorization.");
    }

    // 3. Verify End Timestamp
    if (Date.now() < plan.end_timestamp) {
        throw new Error("Landing requested before End Timestamp. Warp skip detected.");
    }

    // 4. Record ARRIVED in mission archive
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

    // 5. Cleanup travel plans if exists
    await DB.prepare(`DELETE FROM travel_plans WHERE id = ?`).bind(plan.id).run();

    return new Response(JSON.stringify({ message: "Landing Authorization Granted. Welcome!" }), { status: 200 });
}
