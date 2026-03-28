# Space Travel Protocol: Elected Traffic Controllers

In the Federated Planets universe, space travel is more than just clicking a link. For a journey to be recognized by the federation, it must be validated by a decentralized set of **Elected Traffic Controllers** to ensure the integrity of the travel logs and prevent "warp-cheating" (teleporting without fuel or proper clearance).

## 1. The Space Port Requirement

Before a planet can participate in the Federated Travel Network (FTN), it must construct a **Space Port**.

- **Definition:** A Space Port is a specialized cryptographic node (or a set of services) hosted on the planet's domain.
- **Function:** It acts as the local gateway for initiating travel plans and serves as a potential **Traffic Controller** for other planets' journeys.
- **Manifest Entry:** A planet with a Space Port must include the `space_port` endpoint in its `manifest.json`:
  ```json
  {
    "name": "Arrakis",
    "coordinates": { "x": 12.345, "y": 67.89 },
    "space_port": "https://arrakis.space/api/v1/port"
  }
  ```

## 2. The Elected Traffic Controllers Protocol

The Elected Traffic Controllers are a Byzantine Fault Tolerant (BFT) subset of nodes chosen to validate a specific travel transaction.

### Selection (Proximity-Based Sortition)

For every travel plan, a subset of **$N = 3f + 1$** nodes is elected specifically from the **direct neighbors** of the Origin and Destination planets.

- **The Pool:** Only planets listed in the `warp-ring` of either the source or destination, which also host an active **Space Port**, are eligible.
- **Seed:** The election seed is `hash(Origin_Coords + Destination_Coords + Departure_Timestamp)`.
- **Deterministic Selection:** Traffic Controllers are selected by hashing the seed against the combined list of neighbors and picking the top $N$ results.
- **Why Neighbors?:** This ensures that consensus is reached by nodes that are "locally" aware of the participants, reducing global network noise and ensuring that only relevant parties validate the travel.

### Consensus Algorithm (PBFT Subset)

Once the Traffic Controllers are elected, they reach consensus on the travel plan using a three-phase process:

1.  **Pre-Prepare:** The Origin Space Port broadcasts the Travel Port to the elected Traffic Controllers. The "Primary" (the first node in the elected list) assigns a sequence number.
2.  **Prepare:** Traffic Controllers verify the plan (checking fuel, ship integrity, and path). If valid, they broadcast a "Prepare" message to all other controllers.
3.  **Commit:** Once a Traffic Controller receives $2f$ matching Prepare messages, they broadcast a "Commit" message. When $2f + 1$ Commit messages are collected, the travel plan is officially "Approved."

## 3. Travel Mechanics: Distance and Time

The Federated Travel Network (FTN) uses the deterministic coordinate system described in the `README.md` to calculate flight duration.

### Distance Calculation

The distance $D$ between two planets $(x_1, y_1)$ and $(x_2, y_2)$ is the Euclidean distance on the **sparsec** grid:
$$D = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$

### Travel Time

Travel is not instantaneous. The travel time ($T$) is proportional to the distance ($D$). The current standard warp speed is **1 flight-year per 100 sparsecs**.
$$T = \frac{D}{100} \text{ flight-years}$$

### Transit Visibility

During the journey, the ship is visible to the public record of both the **Origin** and **Destination** planets:

1.  **Preparation (Origin):** Once the **Elected Traffic Controllers** approve the plan, but before the `Start_Timestamp` is reached, the origin planet displays the ship as **"Preparing for Departure"**.
2.  **Departure (Origin):** As soon as the `Start_Timestamp` is reached, the status changes to **"Departing"** or **"In Transit"**.
3.  **Arrival (Destination):** Simultaneously, the destination planet's Space Port displays the ship as an **"Incoming"** vessel, along with its estimated time of arrival (ETA) based on the `End_Timestamp`.
4.  **Completion:** Once the `End_Timestamp` has passed, the traveler is permitted to complete the landing sequence at the destination.

## 4. The Travel Plan Algorithm

A journey follows these steps:

1.  **Initiation:** The traveler requests a route at the **Origin Space Port**.
2.  **Validation:** The **Elected Traffic Controllers** calculate the distance and duration, ensuring the traveler has the necessary clearance.
3.  **Recording:** The approved plan, including the **Start Timestamp** and **End Timestamp**, is signed by the controllers and stored in the **Distributed Travel Ledger (DTL)**.
4.  **Preparation Phase:** The ship enters a preparation state. It is visible on the origin's traffic log as "Preparing for Departure" until the `Start_Timestamp`.
5.  **Transit:** At the `Start_Timestamp`, the ship officially departs. Both origin and destination planets display the active ship status in their respective "Space Port Traffic" logs.
6.  **Arrival:** Upon reaching the destination at or after the **End Timestamp**, the traveler presents the signed plan. The destination verifies the signatures and timing before clearing the ship for landing.
7.  **Archival:** Once a journey is completed, both the Origin and Destination Space Ports move the record to their **Mission Archive**, keeping a history of the 10 most recent arrivals and departures for public audit.

## 5. Fault Tolerance and Security

- **Byzantine Resistance:** By requiring $3f+1$ nodes, the protocol remains secure even if $f$ Traffic Controllers are offline or malicious.
- **No Latency Constraints:** Since travel takes time in-game, the consensus process has ample time (from minutes to several flight-years) to complete without impacting the player experience.
- **Auditability:** Any planet can verify the signatures on a travel plan to confirm it was validated by the correct, deterministically elected Traffic Controllers.

## 6. Why "Elected Traffic Controllers" for Games?

In a game where **latency is not a primary concern**, the Elected Traffic Controllers model offers several advantages over traditional game servers:

1.  **Trustless Anti-Cheat:** Because the Traffic Controllers are elected from the network (other players), no single player can "hack" their own travel logs. The rules are enforced by the subset of honest nodes.
2.  **Privacy (Fog of War):** By using a subset of nodes, we can keep the full details of a travel plan (like cargo or ship armaments) private from the general public, only revealing them to the elected controllers who are sworn to secrecy by the protocol.
3.  **Cost Efficiency:** Instead of requiring every node in the entire federation to validate every small move, only a small subset ($3f+1$) handles the work, allowing the network to scale to millions of planets.

---

_Document Version: 1.3.0_

_Protocol Status: Draft_
