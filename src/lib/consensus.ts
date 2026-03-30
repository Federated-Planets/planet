import { CryptoCore } from './crypto';
import type { PlanetManifest } from './travel';

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
    const localName = import.meta.env.PUBLIC_SIM_PLANET_NAME || "Local Planet";
    console.log(`[${localName}] Broadcasting ${action} for plan ${plan.id} to ${controllers.length} controllers`);

    const promises = controllers.map(async (tc) => {
      if (!tc.space_port) return;
      try {
        await fetch(`${tc.space_port}?action=${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plan)
        });
      } catch (e) {
        console.error(`Failed to broadcast ${action} to ${tc.landing_site}:`, e);
      }
    });
    return Promise.all(promises);
  }

  /**
   * Checks if we have enough signatures for consensus
   * N = 3f + 1, we need 2f + 1 signatures
   */
  static hasQuorum(plan: TravelPlan): boolean {
    const n = plan.traffic_controllers.length;
    const f = Math.floor((n - 1) / 3);
    const required = 2 * f + 1;
    return Object.keys(plan.signatures).length >= required;
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
