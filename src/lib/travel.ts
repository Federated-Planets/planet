/**
 * Travel Logic for Federated Planets
 * Handles distance, time, and controller election.
 */
import md5 from "md5";

export interface Coordinates {
  x: number;
  y: number;
  z: number;
}

export interface PlanetManifest {
  name: string;
  landing_site: string;
  space_port?: string;
}

export class TravelCalculator {
  /**
   * Calculates 3D coordinates from a URL deterministically
   */
  static calculateCoordinates(url: string): Coordinates {
    const domain = new URL(url).hostname.toLowerCase();
    const hash = md5(domain);

    const xHex = hash.slice(0, 6);
    const yHex = hash.slice(6, 12);
    const zHex = hash.slice(12, 18);

    const x = (parseInt(xHex, 16) % 100000) / 100;
    const y = (parseInt(yHex, 16) % 100000) / 100;
    const z = (parseInt(zHex, 16) % 100000) / 100;

    return { x, y, z };
  }

  /**
   * Calculates 3D Euclidean distance between two points
   */
  static calculateDistance(p1: Coordinates, p2: Coordinates): number {
    return Math.sqrt(
      Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2) +
        Math.pow(p2.z - p1.z, 2),
    );
  }

  /**
   * Calculates travel time in Earth hours (Flight-Years)
   * 1 FY per 100 sparsecs.
   */
  static calculateTravelTime(distance: number): number {
    return distance / 100;
  }

  /**
   * Elects Traffic Controllers based on proximity sortition
   */
  static electControllers(
    seed: string,
    eligibleNeighbors: PlanetManifest[],
    n: number = 4, // Default 3f + 1 where f=1
  ): PlanetManifest[] {
    const scored = eligibleNeighbors.map((neighbor) => {
      const score = md5(seed + neighbor.landing_site);
      return { neighbor, score };
    });

    // Deterministic sort by score
    scored.sort((a, b) => a.score.localeCompare(b.score));

    return scored.slice(0, n).map((s) => s.neighbor);
  }
}
