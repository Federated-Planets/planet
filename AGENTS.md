# Implementation Plan: Space Travel Protocol

## Development Notes

After any code changes:

1. Run `npm run format` to format all files with Prettier.
2. Run `npm run build` to verify the build succeeds.

This document outlines the technical strategy for implementing the **Elected Traffic Controllers (ETC)** protocol within the Astro-based `planet` implementation.

## 1. Architecture Overview

- **Framework:** Astro (SSR mode)
- **Runtime:** Cloudflare Workers (Note: This is a Worker project, NOT a Pages project)
- **Database:** Cloudflare D1 (Local state, Mission Archive, Traffic Logs)
- **State/Cache:** Cloudflare KV (Cryptographic keys, Distributed Ledger cache)
- **Validation:** Zod
- **Hashing:** MD5 (via `md5` package)
- **Cryptography:** Web Crypto API (Ed25519 signatures)

## 2. Phase 1: Foundation & Data Model

### 2.1 Manifest Update

- Add `space_port` field to `public/manifest.json`.
- Endpoint: `https://<domain>/api/v1/port`

### 2.2 Database Schema (D1)

Create `schema.sql`:

- `travel_plans`: `id`, `ship_id`, `origin_url`, `destination_url`, `start_timestamp`, `end_timestamp`, `status` (PREPARING, TRANSIT, ARRIVED), `signatures` (JSON array).
- `mission_archive`: `id`, `ship_id`, `event` (ARRIVED, DEPARTED), `location_name`, `location_url`, `timestamp`.
- `traffic_controllers`: Cache of known neighbor manifests and their `space_port` status.

### 2.3 Cryptography Utility

- Implement `crypto.ts` to manage the planet's identity.
- Generate and store an Ed25519 KeyPair in KV if it doesn't exist.
- Methods for `sign(data)` and `verify(data, signature, publicKey)`.

## 3. Phase 2: Core Protocol Logic

### 3.1 Travel Calculator

- Implement 3D distance: `sqrt(dx² + dy² + dz²)`.
- Travel time: `distance / 100` hours (Flight-Years).

### 3.2 Proximity-Based Sortition

- Function to fetch neighbors' `manifest.json`.
- Filter for those with active `space_port`.
- Deterministic sort: `sort(neighbors by hash(seed + neighbor_url))`.
- Select top $N = 3f + 1$.

### 3.3 API Endpoints (`src/pages/api/v1/port.ts`)

- `POST /initiate`:
  1. Validate request (Origin must be local).
  2. Calculate travel plan.
  3. Elect Traffic Controllers.
  4. Broadcast `pre-prepare` to TCs.
- `POST /prepare`: Receive and validate a plan from another node. Verify coordinates and timing.
- `POST /commit`: Finalize consensus and sign the plan.

## 4. Phase 3: UI Integration

### 4.1 Dynamic Star Map

- Update `index.astro` to fetch live traffic from D1.
- Pass real coordinates from the database to the ThreeJS map.

### 4.2 Flight Deck

- Create a UI component to initiate travel to a neighbor.
- Show "Consensus in Progress" spinner during the PBFT phases.
- Transition status from "Preparing" to "Departing" based on timestamps.

### 4.3 Mission Archive

- Display the last 10 records from the `mission_archive` table.

## 5. Phase 4: Validation & Simulation

- Create a mock "Neighbor" node (or use a second local dev instance).
- Simulate a full journey:
  1. Click "Jump" on Planet A.
  2. TCs (including Planet B if it's a neighbor) reach consensus.
  3. Planet A shows "Preparing".
  4. Wait for `Start_Timestamp`.
  5. Planet A shows "Departing", Planet B shows "Incoming".
  6. Wait for `End_Timestamp`.
  7. Complete landing at Planet B.
