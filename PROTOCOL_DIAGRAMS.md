# Space Travel Protocol: Sequence Diagram

The following diagram illustrates the lifecycle of a travel transaction using the **Elected Traffic Controllers (ETC)** consensus protocol.

```mermaid
sequenceDiagram
    participant Traveler as 🚀 Ship Browser
    participant DO as TrafficControl DO
    participant Origin as 🌍 Origin Space Port
    participant Dest as 🌍 Destination Space Port
    participant KV as KV Store
    participant D1 as D1 Database
    participant TCs as 🌐 Elected Traffic Controllers (3f+1)

    Note over Traveler, Dest: PHASE 1: INITIATION & SORTITION
    Traveler->>Origin: POST /initiate (Destination, ShipID)
    par Parallel discovery
        Origin->>D1: Lookup cached manifests for origin neighbors
        D1-->>Origin: Origin neighbor manifests
        opt Cache miss
            Origin->>Dest: Fetch space-manifest link + manifest JSON
            Dest-->>Origin: PlanetManifest (name, landing_site, space_port)
            Origin->>D1: Store manifest in traffic_controllers cache
        end
    and
        Origin->>Dest: GET ?action=neighbors
        Dest-->>Origin: Dest neighbor manifests
    end
    Origin->>Origin: Calculate 3D Coordinates & Travel Time
    Note over Origin: Mandatory TCs: Origin + Destination
    Note over Origin: Elected TCs: half from origin neighbors, half from dest neighbors
    Origin->>Origin: Elect TCs (seed-based sortition, dedup)
    Origin->>KV: Read Ed25519 identity keys (identity_public/private)
    KV-->>Origin: Key pair
    Origin->>Origin: Sign Plan (Ed25519)
    Origin->>KV: Save consensus plan state (consensus_plan_{id})
    par Fire-and-forget
        Origin-->>DO: INITIATE_TRAVEL event
    and Parallel POST ×N
        Origin->>TCs: PRE-PREPARE (Signed Plan)
    end

    Note over TCs, KV: PHASE 2: CONSENSUS (PBFT)
    loop Each Traffic Controller
        TCs->>TCs: Verify Plan integrity (coordinates & travel time)
        TCs->>KV: Read own identity keys
        TCs->>TCs: Sign Plan
        TCs->>KV: Merge signatures into consensus plan state
        par Fire-and-forget
            TCs-->>DO: PREPARE_PLAN event
        and Parallel POST ×N
            TCs->>TCs: COMMIT (Signed Plan)
        end
    end

    Note over Origin, D1: PHASE 3: RECORDING & TRANSIT
    Origin->>KV: Read accumulated signatures (consensus_plan_{id})
    Origin->>Origin: Check quorum (2f+1 signatures reached)
    Origin->>Dest: POST ?action=register (Approved Plan)
    Dest->>Dest: Verify destination URL
    Dest->>Dest: Verify travel time math
    Dest->>Dest: Verify end_timestamp not expired (anti-cheat)
    Dest->>Dest: Verify quorum (2f+1 signatures)
    Dest->>D1: Store plan (incoming traffic)
    Dest-->>Origin: 200 OK
    Origin->>D1: Persist Approved Plan (travel_plans, status=PLAN_ACCEPTED)
    Origin->>DO: Broadcast QUORUM_REACHED event
    DO-->>Traveler: WebSocket push (status updates to live UI)
    Origin-->>Traveler: 200 OK (Travel Authorized)

    Note over Origin, Traveler: Ship Status: PREPARING

    rect rgb(20, 25, 35)
        Note right of Origin: Wait for Start_Timestamp
    end

    Note over Origin, Traveler: Ship Status: DEPARTING / IN TRANSIT (UI label)
    Note over Traveler: Ship Status: INCOMING (ETA displayed)

    rect rgb(20, 25, 35)
        Note right of Origin: Wait for End_Timestamp
    end

    Note over Traveler: Ship Status: ARRIVED (client-side only)
```

## Protocol Summary

1.  **Initiation:** The origin discovers its own neighbors and the destination's neighbors, then elects TCs: origin and destination are mandatory participants; remaining slots filled half from each neighbor pool.
2.  **Consensus:** All elected TCs (including origin and destination) validate and sign the plan. Quorum requires $2f+1$ signatures; since origin and destination are both mandatory TCs, both must contribute.
3.  **Recording:** Once quorum is reached, origin synchronously registers the plan with the destination (which verifies and stores it). Only after the destination confirms does origin persist the plan locally, broadcast the WebSocket event, and return 200 OK to the traveler.
4.  **Transit:** Time is enforced by the federation; arrival status is tracked client-side via ETA timestamps.

## Data Storage

| Store              | Purpose                                                   | Durability                        |
| ------------------ | --------------------------------------------------------- | --------------------------------- |
| **D1**             | `travel_plans`, `traffic_controllers` cache               | Persistent                        |
| **KV**             | Ed25519 identity key pair, in-flight consensus plan state | Persistent (keys), TTL 1h (plans) |
| **Durable Object** | WebSocket sessions, last-50 event ring buffer             | In-memory only (volatile)         |

## Plan Data State Diagram

Server-side status stored in `travel_plans.status` (D1) and the in-flight KV plan:

```mermaid
stateDiagram-v2
    [*] --> PREPARING : Origin creates plan (handleInitiate)
    PREPARING --> PLAN_ACCEPTED : Quorum reached (2f+1 sigs) (handleCommit → D1 insert)
    PLAN_ACCEPTED --> [*] : end_timestamp passes (no server transition — record kept forever)

    note right of PREPARING
        Stored in KV only
        (consensus_plan_{id})
    end note

    note right of PLAN_ACCEPTED
        Persisted to D1 travel_plans
        Registered at destination (fire-and-forget)
        KV entry expires after TTL
    end note
```

## Plan UI Labels State Diagram

Client-side display labels derived from server status + timestamps:

```mermaid
stateDiagram-v2
    [*] --> SCHEDULED : status=PLAN_ACCEPTED start_timestamp in future (outgoing row at origin)
    [*] --> INCOMING : status=PLAN_ACCEPTED (incoming row at destination)
    SCHEDULED --> IN_TRANSIT : start_timestamp reached
    INCOMING --> IN_TRANSIT : start_timestamp reached
    IN_TRANSIT --> ARRIVED : end_timestamp reached
    ARRIVED --> [*] : 5 s linger then row moves to archive section

    note right of SCHEDULED
        CSS: status-scheduled
        Label: "SCHEDULED"
    end note
    note right of INCOMING
        CSS: status-transit
        Label: "IN TRANSIT"
    end note
    note right of IN_TRANSIT
        CSS: status-transit
        Label: "IN TRANSIT"
    end note
    note right of ARRIVED
        CSS: status-arrived
        Label: "ARRIVED"
        (client-side only — no DB write)
    end note
```

## Entity-Relationship Diagram

```mermaid
erDiagram
    TRAVEL_PLANS {
        TEXT id PK
        TEXT ship_id
        TEXT origin_url
        TEXT destination_url
        INTEGER start_timestamp
        INTEGER end_timestamp
        TEXT status "PREPARING | PLAN_ACCEPTED"
        TEXT signatures "JSON: planet_url→Ed25519 sig"
    }

    TRAFFIC_CONTROLLERS {
        TEXT planet_url PK
        TEXT name
        TEXT space_port_url
        INTEGER last_manifest_fetch "Unix ms, TTL 1h"
    }

    KV_IDENTITY {
        TEXT identity_public "Ed25519 public key (Base64)"
        TEXT identity_private "Ed25519 private key (Base64)"
    }

    KV_CONSENSUS {
        TEXT consensus_plan_id PK "consensus_plan_{uuid}"
        TEXT plan_json "TravelPlan with accumulated sigs"
    }

    DO_TRAFFIC_CONTROL {
        SET sessions "Active WebSocket connections"
        ARRAY events "Ring buffer: last 50 API events"
    }

    TRAVEL_PLANS ||--o{ KV_CONSENSUS : "built during PBFT"
    TRAVEL_PLANS }o--o{ TRAFFIC_CONTROLLERS : "controllers elected from"
```
