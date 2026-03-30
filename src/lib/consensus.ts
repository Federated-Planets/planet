import { CryptoCore } from './crypto';
import type { PlanetManifest } from './travel';
import { env as cloudflareEnv } from 'cloudflare:workers';

// Robust helper to get simulation variables from any available environment source
const getSimVar = (name: string): string | undefined => {
    // 1. Check Cloudflare env object (for wrangler dev --var)
    const env = cloudflareEnv as any;
    if (env && env[name]) return env[name];
    
    // 2. Check process.env (traditional node/dev env)
    if (typeof process !== 'undefined' && process.env && (process.env as any)[name]) return (process.env as any)[name];
    
    // 3. Check import.meta.env (build-time or astro-provided)
    if (import.meta.env && (import.meta.env as any)[name]) return (import.meta.env as any)[name];
    
    return undefined;
};

export interface TravelPlan {
  id: string;
  ship_id: string;
  origin_url: string;
  destination_url: string;
  start_timestamp: number;
  end_timestamp: number;
  status: 'PREPARING' | 'TRANSIT' | 'ARRIVED';
  traffic_controllers: string[]; // List of landing site URLs elected
  signatures: Record<string, string>; // planet_url -> signature
}

export class ConsensusEngine {
  /**
   * Broadcasts a message to all elected Traffic Controllers
   */
  static async broadcast(
    plan: TravelPlan,
    action: 'prepare' | 'commit',
    controllers: PlanetManifest[]
  ) {
    const localName = getSimVar('PUBLIC_SIM_PLANET_NAME') || "Local Planet";
    console.log(`[${localName}] Broadcasting ${action} for plan ${plan.id} to ${controllers.length} controllers`);

    const promises = controllers.map(async (tc) => {
      if (!tc.space_port) {
          console.warn(`[${localName}] Skipping broadcast to ${tc.landing_site}: No space_port found in manifest`);
          return;
      }
      try {
        const localUrl = getSimVar('PUBLIC_SIM_LANDING_SITE') || "http://unknown";
        console.log(`[${localName}] Sending ${action} to ${tc.space_port}...`);
        const res = await fetch(`${tc.space_port}?action=${action}`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'X-Planet-Origin': localUrl
          },
          body: JSON.stringify(plan)
        });
        if (!res.ok) {
            console.error(`[${localName}] Broadcast ${action} to ${tc.landing_site} failed: ${res.status} ${await res.text()}`);
        } else {
            console.log(`[${localName}] Broadcast ${action} to ${tc.landing_site} succeeded`);
        }
      } catch (e: any) {
        console.error(`[${localName}] Failed to broadcast ${action} to ${tc.landing_site}:`, e.message);
      }
    });
    return Promise.all(promises);
  }

  /**
   * Checks if we have enough signatures for consensus
   * N = 3f + 1, we need 2f + 1 signatures
   */
  static hasQuorum(plan: TravelPlan): boolean {
    const localName = getSimVar('PUBLIC_SIM_PLANET_NAME') || "Local Planet";
    const n = plan.traffic_controllers.length;
    const f = Math.floor((n - 1) / 3);
    const required = 2 * f + 1;
    const current = Object.keys(plan.signatures).length;
    
    console.log(`[${localName}] Quorum check for plan ${plan.id}: ${current}/${required} signatures (N=${n}, f=${f})`);
    return current >= required;
  }

  /**
   * Saves plan state to KV for active consensus tracking
   */
  static async savePlanState(KV: KVNamespace, plan: TravelPlan) {
    await KV.put(`consensus_plan_${plan.id}`, JSON.stringify(plan), { expirationTtl: 3600 });
  }

  /**
   * Retrieves plan state from KV
   */
  static async getPlanState(KV: KVNamespace, planId: string): Promise<TravelPlan | null> {
    const data = await KV.get(`consensus_plan_${planId}`);
    return data ? JSON.parse(data) : null;
  }
}
