import type { APIRoute } from "astro";
import { z } from "zod";
import * as cheerio from "cheerio";
import { TravelCalculator, type PlanetManifest } from "../../../lib/travel";
import { CryptoCore } from "../../../lib/crypto";
import { PlanetIdentity } from "../../../lib/identity";
import { ConsensusEngine, type TravelPlan } from "../../../lib/consensus";
import { WARP_LINKS, PLANET_NAME } from "../../../lib/config";
import { doQuery, doExec } from "../../../lib/do-storage";
import { env } from "cloudflare:workers";

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
  status: z.enum(["PREPARING", "PLAN_ACCEPTED"]),
  traffic_controllers: z.array(z.string()),
  signatures: z.record(z.string()),
  origin_lists_dest: z.boolean().optional(),
});

// Returns ms per Flight-Year. Default: 1 hour (production). Override with WARP_MS_PER_FY for dev.
const msPerFY = (): number =>
  parseInt((env as any).WARP_MS_PER_FY) || 3600 * 1000;
const departureBuffer = (): number =>
  parseInt((env as any).DEPARTURE_BUFFER_MS) || 30 * 1000;

// Simulation Overrides helper
const getLocalPlanetInfo = (currentUrl: string) => {
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
  const origin = new URL(currentUrl).origin;
  const landingSite = simUrl || origin;

  return {
    name: simName || PLANET_NAME,
    landing_site: landingSite,
    space_port: `${landingSite}/api/v1/port`,
  };
};

async function broadcastEvent(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  event: any,
) {
  if (!TRAFFIC_CONTROL || typeof TRAFFIC_CONTROL.idFromName !== "function") {
    return;
  }
  try {
    const id = TRAFFIC_CONTROL.idFromName("global");
    const obj = TRAFFIC_CONTROL.get(id);
    const payload = JSON.stringify({ ...event, timestamp: Date.now() });
    console.log(`[broadcastEvent] Sending to DO: ${payload}`);
    // Fire and forget to avoid blocking or crashing on DO errors
    obj
      .fetch("http://do/events", {
        method: "POST",
        body: payload,
      })
      .then((res) => {
        if (!res.ok)
          console.warn(`[broadcastEvent] DO responded with ${res.status}`);
      })
      .catch((e) =>
        console.warn(
          `[broadcastEvent] Background DO broadcast failed: ${e.message}`,
        ),
      );
  } catch (e: any) {
    console.warn(`[broadcastEvent] Failed to initiate broadcast: ${e.message}`);
  }
}
export const GET: APIRoute = async ({ request }) => {
  const { TRAFFIC_CONTROL } = env as any;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "check") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), {
        status: 400,
      });
    }
    const manifest = await discoverSpacePort(targetUrl, TRAFFIC_CONTROL);
    return new Response(JSON.stringify({ has_space_port: manifest !== null }), {
      status: 200,
    });
  }

  if (action === "neighbors") {
    if (!TRAFFIC_CONTROL || WARP_LINKS.length === 0) {
      return new Response(JSON.stringify({ neighbors: [] }), { status: 200 });
    }
    const results = await Promise.all(
      WARP_LINKS.map((l) => discoverSpacePort(l.url, TRAFFIC_CONTROL)),
    );
    const neighbors = results.filter((n): n is PlanetManifest => n !== null);
    return new Response(JSON.stringify({ neighbors }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), {
    status: 400,
  });
};

export const POST: APIRoute = async ({ request }) => {
  const { TRAFFIC_CONTROL } = env as any;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const senderOrigin =
    request.headers.get("X-Planet-Origin") || "Browser/Unknown";

  const localPlanet = getLocalPlanetInfo(request.url);

  console.log(
    `[${localPlanet.name}] Received ${request.method} request for action: ${action} from ${senderOrigin}`,
  );

  try {
    // Broadcast incoming request event
    await broadcastEvent(TRAFFIC_CONTROL, {
      type: "API_REQUEST",
      planet: localPlanet.name,
      from: senderOrigin,
      action,
      method: request.method,
    });

    switch (action) {
      case "initiate":
        return await handleInitiate(request, TRAFFIC_CONTROL, localPlanet);
      case "prepare":
        return await handlePrepare(request, TRAFFIC_CONTROL, localPlanet);
      case "register":
        return await handleRegister(request, TRAFFIC_CONTROL, localPlanet);
      case "commit":
        return await handleCommit(request, TRAFFIC_CONTROL, localPlanet);
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
        });
    }
  } catch (e: any) {
    console.error(`[${localPlanet.name}] Action ${action} failed:`, e);
    await broadcastEvent(TRAFFIC_CONTROL, {
      type: "API_ERROR",
      planet: localPlanet.name,
      action,
      error: e.message,
    });
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

async function discoverSpacePort(
  landingSiteUrl: string,
  TRAFFIC_CONTROL: DurableObjectNamespace,
): Promise<PlanetManifest | null> {
  try {
    const cached = await doQuery(
      TRAFFIC_CONTROL,
      `SELECT * FROM traffic_controllers WHERE planet_url = ? AND last_manifest_fetch > ?`,
      [landingSiteUrl, Date.now() - 3600000],
    );

    if (cached.length > 0) {
      const row: any = cached[0];
      return {
        name: row.name,
        landing_site: row.planet_url,
        space_port: row.space_port_url,
      };
    }

    const siteRes = await fetch(landingSiteUrl);
    const html = await siteRes.text();
    if (!html || !html.includes('rel="space-manifest"')) {
      return null;
    }
    const $ = cheerio.load(html);

    let manifestPath = $('link[rel="space-manifest"]').attr("href");
    if (!manifestPath) return null;

    const manifestUrl = new URL(manifestPath, landingSiteUrl).href;
    const manifestRes = await fetch(manifestUrl);

    if (
      !manifestRes.ok ||
      !manifestRes.headers.get("content-type")?.includes("application/json")
    ) {
      return null;
    }

    const remoteManifest: any = await manifestRes.json().catch(() => null);

    if (!remoteManifest || !remoteManifest.space_port) return null;

    const planet: PlanetManifest = {
      name: remoteManifest.name,
      landing_site: remoteManifest.landing_site || landingSiteUrl,
      space_port: remoteManifest.space_port,
    };

    await doExec(
      TRAFFIC_CONTROL,
      `INSERT OR REPLACE INTO traffic_controllers (planet_url, name, space_port_url, last_manifest_fetch) VALUES (?, ?, ?, ?)`,
      [planet.landing_site, planet.name, planet.space_port, Date.now()],
    );

    return planet;
  } catch (e) {
    console.error(`Discovery failed for ${landingSiteUrl}:`, e);
    return null;
  }
}

async function handleInitiate(
  request: Request,
  TRAFFIC_CONTROL: DurableObjectNamespace,
  localPlanet: any,
) {
  const body = await request.json();
  const data = InitiateSchema.parse(body);

  console.log(
    `[${localPlanet.name}] Initiating travel for ship ${data.ship_id} to ${data.destination_url}`,
  );
  await broadcastEvent(TRAFFIC_CONTROL, {
    type: "INITIATE_TRAVEL",
    planet: localPlanet.name,
    ship_id: data.ship_id,
    destination: data.destination_url,
  });

  const myCoords = TravelCalculator.calculateCoordinates(
    localPlanet.landing_site,
  );
  const destCoords = TravelCalculator.calculateCoordinates(
    data.destination_url,
  );
  const distance = TravelCalculator.calculateDistance(myCoords, destCoords);
  const travelTimeHours = TravelCalculator.calculateTravelTime(distance);
  const startTimestamp = data.departure_timestamp + departureBuffer();
  const endTimestamp = startTimestamp + travelTimeHours * msPerFY();

  const discoveryPromises = [
    discoverSpacePort(data.destination_url, TRAFFIC_CONTROL),
    ...WARP_LINKS.map((l) => discoverSpacePort(l.url, TRAFFIC_CONTROL)),
  ];
  const [destManifest, ...neighborResults] =
    await Promise.all(discoveryPromises);

  if (!destManifest) {
    return new Response(
      JSON.stringify({ error: "no_destination_space_port" }),
      { status: 422 },
    );
  }

  const originNeighbors = neighborResults.filter(
    (n): n is PlanetManifest => n !== null,
  );

  console.log(
    `[${localPlanet.name}] Origin neighbors checked (${WARP_LINKS.length} links, ${originNeighbors.length} with space port): ${WARP_LINKS.map((l, i) => `${l.name ?? l.url} → ${neighborResults[i] ? "✓" : "✗"}`).join(", ")}`,
  );

  // Fetch destination's known neighbors so we can elect TCs from both sides
  let destNeighbors: PlanetManifest[] = [];
  try {
    const res = await fetch(`${destManifest.space_port}?action=neighbors`, {
      headers: { "X-Planet-Origin": localPlanet.landing_site },
    });
    if (res.ok) {
      const json: any = await res.json();
      destNeighbors = (json.neighbors || []).filter(
        (n: any): n is PlanetManifest => n.landing_site && n.space_port,
      );
      console.log(
        `[${localPlanet.name}] Destination neighbors from ${destManifest.name} (${destNeighbors.length} with space port): ${destNeighbors.map((n) => n.name ?? n.landing_site).join(", ") || "(none)"}`,
      );
    }
  } catch (e: any) {
    console.warn(
      `[${localPlanet.name}] Could not fetch destination neighbors: ${e.message}`,
    );
  }

  // Enforce planet-funded shuttle limits based on neighbor relationship
  const originListsDest = originNeighbors.some(
    (n) => n.landing_site === destManifest.landing_site,
  );
  const destListsOrigin = destNeighbors.some(
    (n) => n.landing_site === localPlanet.landing_site,
  );

  const shuttleLimit =
    originListsDest && destListsOrigin
      ? 2
      : originListsDest || destListsOrigin
        ? 1
        : 0;

  const activeRows = await doQuery(
    TRAFFIC_CONTROL,
    `SELECT COUNT(*) as count FROM travel_plans
     WHERE ((origin_url = ? AND destination_url = ?)
        OR  (origin_url = ? AND destination_url = ?))
       AND end_timestamp > ?`,
    [
      localPlanet.landing_site,
      destManifest.landing_site,
      destManifest.landing_site,
      localPlanet.landing_site,
      Date.now(),
    ],
  );

  const activeShuttles = (activeRows[0] as any)?.count ?? 0;

  console.log(
    `[${localPlanet.name}] Shuttle limit check: ${activeShuttles}/${shuttleLimit} active (${localPlanet.landing_site} ↔ ${destManifest.landing_site})`,
  );

  const bypassAllowed = (env as any).ALLOW_TEST_SHUTTLE_BYPASS === "true";
  const bypassRequested =
    request.headers.get("X-Bypass-Shuttle-Limit") === "true";

  if (activeShuttles >= shuttleLimit && !(bypassAllowed && bypassRequested)) {
    const relationship =
      originListsDest && destListsOrigin
        ? "mutual_neighbors"
        : originListsDest || destListsOrigin
          ? "one_sided_neighbors"
          : "non_neighbors";
    return new Response(
      JSON.stringify({
        error: "shuttle_limit_exceeded",
        active_shuttles: activeShuttles,
        limit: shuttleLimit,
        relationship,
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  // Origin and destination are mandatory TC participants — their votes are always required
  const mandatoryTCs: PlanetManifest[] = [
    {
      name: localPlanet.name,
      landing_site: localPlanet.landing_site,
      space_port: localPlanet.space_port,
    },
    destManifest,
  ];

  // Require at least 4 controllers (3f+1 where f≥1) for meaningful fault tolerance
  const MIN_CONTROLLERS = 4;

  // Elect remaining slots equally from each neighbor pool, excluding mandatory TCs
  const remaining = MIN_CONTROLLERS - mandatoryTCs.length;
  const halfRemaining = Math.ceil(remaining / 2);
  const seed = `${myCoords.x}${myCoords.y}${myCoords.z}${destCoords.x}${destCoords.y}${destCoords.z}${data.departure_timestamp}`;

  // Deduplicate each pool against mandatory TCs, then against each other so a
  // planet shared by both neighbor lists is only counted once across the pools.
  const mandatoryUrls = new Set(mandatoryTCs.map((m) => m.landing_site));

  const originPool = originNeighbors.filter(
    (n) => !mandatoryUrls.has(n.landing_site),
  );
  // Dest pool excludes only mandatory TCs; elected origin candidates are
  // excluded below after the origin election so small networks (where both
  // pools overlap) can still contribute planets to reach MIN_CONTROLLERS.
  const destPool = destNeighbors.filter(
    (n) => !mandatoryUrls.has(n.landing_site),
  );

  const originElected = TravelCalculator.electControllers(
    seed,
    originPool,
    halfRemaining,
  );
  const originElectedUrls = new Set([
    ...mandatoryUrls,
    ...originElected.map((n) => n.landing_site),
  ]);
  // Exclude mandatory TCs and already-elected origin candidates so no planet
  // is counted twice, but planets shared by both pools are still available.
  const destPoolFiltered = destPool.filter(
    (n) => !originElectedUrls.has(n.landing_site),
  );
  const destElected = TravelCalculator.electControllers(
    seed,
    destPoolFiltered,
    halfRemaining,
  );

  // Combine: mandatory first, then elected (already disjoint, no further dedup needed)
  const electedTCs = [...mandatoryTCs, ...originElected, ...destElected];

  console.log(
    `[${localPlanet.name}] TC election: mandatory=[${mandatoryTCs.map((t) => t.name ?? t.landing_site).join(", ")}] originPool=${originPool.length} destPool=${destPool.length} elected=[${electedTCs.map((t) => t.name ?? t.landing_site).join(", ")}] (${electedTCs.length}/${MIN_CONTROLLERS} required)`,
  );

  if (electedTCs.length < MIN_CONTROLLERS) {
    return new Response(
      JSON.stringify({
        error: "insufficient_controllers",
        found: electedTCs.length,
        required: MIN_CONTROLLERS,
      }),
      { status: 422 },
    );
  }

  const plan: TravelPlan = {
    id: crypto.randomUUID(),
    ship_id: data.ship_id,
    origin_url: localPlanet.landing_site.replace(/\/$/, ""),
    destination_url: data.destination_url.replace(/\/$/, ""),
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    status: "PREPARING",
    traffic_controllers: electedTCs.map((tc) => tc.landing_site),
    signatures: {},
    origin_lists_dest: originListsDest,
  };

  const { privateKey } = await PlanetIdentity.getIdentity(TRAFFIC_CONTROL);
  const signature = await CryptoCore.sign(JSON.stringify(plan), privateKey);
  plan.signatures[localPlanet.landing_site] = signature;

  await ConsensusEngine.savePlanState(TRAFFIC_CONTROL, plan);
  await ConsensusEngine.broadcast(plan, "prepare", electedTCs);

  return new Response(JSON.stringify({ plan }), { status: 200 });
}

async function handlePrepare(
  request: Request,
  TRAFFIC_CONTROL: DurableObjectNamespace,
  localPlanet: any,
) {
  const plan = TravelPlanSchema.parse(await request.json());

  console.log(
    `[${localPlanet.name}] Preparing for travel plan ${plan.id} for ship ${plan.ship_id}`,
  );
  await broadcastEvent(TRAFFIC_CONTROL, {
    type: "PREPARE_PLAN",
    planet: localPlanet.name,
    ship_id: plan.ship_id,
    plan_id: plan.id,
  });

  const originCoords = TravelCalculator.calculateCoordinates(plan.origin_url);
  const destCoords = TravelCalculator.calculateCoordinates(
    plan.destination_url,
  );
  const dist = TravelCalculator.calculateDistance(originCoords, destCoords);
  const expectedTime = TravelCalculator.calculateTravelTime(dist);
  const actualTime = (plan.end_timestamp - plan.start_timestamp) / msPerFY();

  if (Math.abs(actualTime - expectedTime) > 0.01) {
    throw new Error("Invalid travel time calculation.");
  }

  const { privateKey } = await PlanetIdentity.getIdentity(TRAFFIC_CONTROL);
  const signature = await CryptoCore.sign(JSON.stringify(plan), privateKey);
  plan.signatures[localPlanet.landing_site] = signature;

  await ConsensusEngine.savePlanState(TRAFFIC_CONTROL, plan);

  const controllersPromises = plan.traffic_controllers.map((url) =>
    discoverSpacePort(url, TRAFFIC_CONTROL),
  );
  const controllers = (await Promise.all(controllersPromises)).filter(
    (n): n is PlanetManifest => n !== null,
  );

  await ConsensusEngine.broadcast(plan, "commit", controllers);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
async function handleRegister(
  request: Request,
  TRAFFIC_CONTROL: DurableObjectNamespace,
  localPlanet: any,
) {
  const plan = TravelPlanSchema.parse(await request.json());

  console.log(
    `[${localPlanet.name}] Registering incoming plan ${plan.id} for ship ${plan.ship_id}`,
  );

  // Verify this planet is the intended destination
  if (
    new URL(plan.destination_url).origin !==
    new URL(localPlanet.landing_site).origin
  ) {
    return new Response(JSON.stringify({ error: "not_our_destination" }), {
      status: 422,
    });
  }

  // Verify travel time math (same check as handlePrepare)
  const originCoords = TravelCalculator.calculateCoordinates(plan.origin_url);
  const destCoords = TravelCalculator.calculateCoordinates(
    plan.destination_url,
  );
  const dist = TravelCalculator.calculateDistance(originCoords, destCoords);
  const expectedTime = TravelCalculator.calculateTravelTime(dist);
  const actualTime = (plan.end_timestamp - plan.start_timestamp) / msPerFY();
  if (Math.abs(actualTime - expectedTime) > 0.01) {
    return new Response(JSON.stringify({ error: "invalid_travel_time" }), {
      status: 422,
    });
  }

  // Anti-cheat: plan must not have already expired
  if (Date.now() > plan.end_timestamp) {
    return new Response(JSON.stringify({ error: "plan_expired" }), {
      status: 422,
    });
  }

  // Require quorum before accepting the plan
  if (!ConsensusEngine.hasQuorum(plan)) {
    return new Response(JSON.stringify({ error: "insufficient_quorum" }), {
      status: 422,
    });
  }

  const alreadyStored = await doQuery(
    TRAFFIC_CONTROL,
    `SELECT id FROM travel_plans WHERE id = ?`,
    [plan.id],
  );

  if (alreadyStored.length === 0) {
    // Enforce shuttle limit from destination's perspective.
    // originListsDest is carried in the plan (set at initiation) to avoid a
    // circular HTTP call back to the origin while it is processing handleCommit.
    const destListsOrigin = WARP_LINKS.some(
      (l) => new URL(l.url).origin === new URL(plan.origin_url).origin,
    );
    const originListsDest = plan.origin_lists_dest ?? false;

    const destShuttleLimit =
      originListsDest && destListsOrigin
        ? 2
        : originListsDest || destListsOrigin
          ? 1
          : 0;

    const destActiveRows = await doQuery(
      TRAFFIC_CONTROL,
      `SELECT COUNT(*) as count FROM travel_plans
       WHERE ((origin_url = ? AND destination_url = ?)
          OR  (origin_url = ? AND destination_url = ?))
         AND end_timestamp > ?`,
      [
        plan.origin_url,
        localPlanet.landing_site,
        localPlanet.landing_site,
        plan.origin_url,
        Date.now(),
      ],
    );

    if (((destActiveRows[0] as any)?.count ?? 0) >= destShuttleLimit) {
      const relationship =
        originListsDest && destListsOrigin
          ? "mutual_neighbors"
          : originListsDest || destListsOrigin
            ? "one_sided_neighbors"
            : "non_neighbors";
      return new Response(
        JSON.stringify({
          error: "shuttle_limit_exceeded",
          active_shuttles: (destActiveRows[0] as any)?.count ?? 0,
          limit: destShuttleLimit,
          relationship,
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    await doExec(
      TRAFFIC_CONTROL,
      `INSERT OR IGNORE INTO travel_plans (id, ship_id, origin_url, destination_url, start_timestamp, end_timestamp, status, signatures)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plan.id,
        plan.ship_id,
        plan.origin_url,
        plan.destination_url,
        plan.start_timestamp,
        plan.end_timestamp,
        plan.status,
        JSON.stringify(plan.signatures),
      ],
    );

    const fmt = (n: number) => n.toFixed(1);
    const originCoordsFormatted = `${fmt(originCoords.x)}:${fmt(originCoords.y)}:${fmt(originCoords.z)}`;
    await broadcastEvent(TRAFFIC_CONTROL, {
      type: "INCOMING_REGISTERED",
      planet: localPlanet.name,
      ship_id: plan.ship_id,
      plan_id: plan.id,
      plan,
      origin_coords_formatted: originCoordsFormatted,
    });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

async function handleCommit(
  request: Request,
  TRAFFIC_CONTROL: DurableObjectNamespace,
  localPlanet: any,
) {
  const incomingPlan = TravelPlanSchema.parse(await request.json());
  const existing =
    (await ConsensusEngine.getPlanState(TRAFFIC_CONTROL, incomingPlan.id)) ||
    incomingPlan;

  console.log(
    `[${localPlanet.name}] Committing travel plan ${incomingPlan.id} (Existing signatures: ${Object.keys(existing.signatures).length}, New signatures: ${Object.keys(incomingPlan.signatures).length})`,
  );

  existing.signatures = { ...existing.signatures, ...incomingPlan.signatures };
  await ConsensusEngine.savePlanState(TRAFFIC_CONTROL, existing);

  if (ConsensusEngine.hasQuorum(existing) && existing.status === "PREPARING") {
    // Check if we already archived it to prevent race condition across TCs
    const alreadyArchived = await doQuery(
      TRAFFIC_CONTROL,
      `SELECT id FROM travel_plans WHERE id = ?`,
      [existing.id],
    );

    if (alreadyArchived.length === 0) {
      console.log(
        `[${localPlanet.name}] Quorum reached for plan ${existing.id}. Registering with destination.`,
      );

      existing.status = "PLAN_ACCEPTED";
      await ConsensusEngine.savePlanState(TRAFFIC_CONTROL, existing);

      // Register with destination synchronously — must succeed before committing locally
      const destManifest = await discoverSpacePort(
        existing.destination_url,
        TRAFFIC_CONTROL,
      );
      if (!destManifest?.space_port) {
        return new Response(
          JSON.stringify({ error: "Destination space port not found" }),
          { status: 502 },
        );
      }

      const registerResp = await fetch(
        `${destManifest.space_port}?action=register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Planet-Origin": localPlanet.landing_site,
          },
          body: JSON.stringify(existing),
        },
      );

      if (!registerResp.ok) {
        const body = await registerResp.text().catch(() => "");
        console.warn(
          `[${localPlanet.name}] Destination rejected plan registration: ${registerResp.status} ${body}`,
        );
        return new Response(
          JSON.stringify({
            error: "Destination rejected plan",
            status: registerResp.status,
          }),
          { status: 502 },
        );
      }

      await doExec(
        TRAFFIC_CONTROL,
        `INSERT OR IGNORE INTO travel_plans (id, ship_id, origin_url, destination_url, start_timestamp, end_timestamp, status, signatures)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          existing.id,
          existing.ship_id,
          existing.origin_url,
          existing.destination_url,
          existing.start_timestamp,
          existing.end_timestamp,
          existing.status,
          JSON.stringify(existing.signatures),
        ],
      );

      await broadcastEvent(TRAFFIC_CONTROL, {
        type: "QUORUM_REACHED",
        planet: localPlanet.name,
        ship_id: existing.ship_id,
        plan_id: existing.id,
      });
    }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
