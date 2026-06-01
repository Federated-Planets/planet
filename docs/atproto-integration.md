# Integrating the AT Protocol into a Federated Planet

> Research notes & opportunity survey. *Status: exploratory — no code has changed.*

## TL;DR

A Federated Planet is already, structurally, an atproto-shaped thing: a **sovereign,
domain-bound node** with its own **cryptographic identity**, a **published manifest**, a
**federation topology of peers**, **signed records** agreed by consensus, and a **live event
stream**. The [AT Protocol](https://atproto.com) (the tech behind Bluesky) is built from the
same nouns — **DIDs**, **repositories of typed records**, **a sync firehose**, and
**app/feed views**. That overlap means we can adopt atproto primitives incrementally without
throwing away the Space Travel Protocol.

This doc surveys **five opportunities**, ordered by leverage-for-effort, each anchored to the
code that exists today.

---

## 1. Where the two systems rhyme

What a planet has today:

- A **domain-bound identity** with an **Ed25519 keypair**, generated and persisted in the
  Durable Object (`src/lib/identity.ts`, `src/lib/crypto.ts`).
- A **manifest** served at `/manifest.json` — `{ name, description, landing_site, space_port }`
  (`src/pages/manifest.json.ts`) — discovered by peers via `<link rel="space-manifest">` on the
  landing page (`src/pages/index.astro`).
- A **federation topology**: "warp links" / neighbors (`src/lib/config.ts`), discovered over
  HTTP with a 1-hour manifest cache (`src/pages/api/v1/port.ts`).
- **Signed records**: travel plans signed with Ed25519 and agreed via a PBFT-style consensus
  among elected Traffic Controllers (`src/lib/consensus.ts`, `src/traffic-control.ts`),
  persisted in Durable Object SQLite.
- A **live event stream**: protocol events broadcast over a hibernatable WebSocket
  (`src/pages/api/v1/control-ws.ts`), feeding the control center UI (`src/pages/control.astro`).

How those map onto atproto:

| Planet concept | atproto equivalent |
| --- | --- |
| A planet (a domain + keypair) | A **DID** (`did:web` fits — the planet owns its domain) resolving to a DID document |
| `/manifest.json` | A **DID document** at `/.well-known/did.json` advertising the signing key + service endpoints |
| `space_port` / `landing_site` URLs | **Service endpoints** in the DID doc (`#atproto_pds`, plus custom services) |
| Warp links / neighbors | **Follows / a relay's crawl set** — the set of repos a node tracks |
| A travel plan (signed JSON) | A **Lexicon-typed record** in a repository, addressed by AT-URI `at://<did>/<collection>/<rkey>` |
| The planet's SQLite history | A **repository** (a signed Merkle Search Tree of records) |
| WebSocket protocol events | The **firehose** (`com.atproto.sync.subscribeRepos`) / **Jetstream** |
| Control center UI | An **AppView** (an index built by consuming the firehose) |
| Ship / pilot | A **user DID** (with atproto **OAuth**) |

The point isn't that a planet *is* a Bluesky account — it's that atproto is a general data
network, and the planet's federation problems (identity, discovery, signed records, sync) are
exactly the problems atproto already solved.

---

## 2. Opportunities

### (A) Make each planet resolvable as a `did:web` — *foundation, lowest effort*

**Concept.** Give every planet a real atproto identity. Because each planet already owns a
domain, [`did:web`](https://atproto.com/specs/did) is the natural method: serve a DID document
at `/.well-known/did.json` describing the planet's public signing key and service endpoints.
No PLC directory, no external dependency — it's just one more static-ish route in Astro,
exactly like `manifest.json.ts`.

**Maps to existing code.** Reuse the identity already minted in `src/lib/identity.ts`; add a
new route `src/pages/.well-known/did.json.ts` mirroring the pattern in
`src/pages/manifest.json.ts`. The `space_port` and `landing_site` already computed for the
manifest become service endpoints in the DID doc.

**atproto primitives.** DID + DID document; handle resolution (a planet's domain *is* its
handle); verification methods (multikey-encoded public key).

**Wrinkle (see §3).** atproto signing keys must be **secp256k1** or **P-256**, not Ed25519.
The DID doc should advertise a P-256 key (a second key the planet holds), while Ed25519 can
remain the key for the native travel protocol.

**First step.** Add the `did.json` route + generate a P-256 keypair alongside the existing
Ed25519 one in the identity layer. Verify with any atproto DID resolver.

---

### (B) Publish travel plans & mission logs as custom Lexicon records — *highest payoff*

**Concept.** Define a `space.federated.*` [Lexicon](https://atproto.com/specs/lexicon) and
expose each planet's travel history as an atproto **repository** of signed records. A travel
plan becomes `at://<planet-did>/space.federated.travelPlan/<rkey>`; mission outcomes become
`space.federated.missionLog` records. Any generic atproto tool, SDK, or indexer can then read
and verify federation data without implementing the bespoke Space Travel Protocol — atproto
repos can hold *arbitrary* custom record types, with no Bluesky lock-in
([custom lexicons discussion](https://github.com/bluesky-social/atproto/discussions/3116)).

**Maps to existing code.** The `TravelPlan` shape in `src/lib/consensus.ts` and the
`travel_plans` table in `src/traffic-control.ts` are the source data. The PBFT signatures
already collected map onto record-level signing. Start read-only: add
`com.atproto.repo.getRecord` / `listRecords`-style endpoints that project existing SQLite rows
into Lexicon records — no migration required.

**atproto primitives.** Lexicon schemas (reverse-DNS NSIDs); repositories (MST); AT-URIs;
record CIDs.

**First step.** Author the Lexicon JSON schemas under a `lexicons/` dir and ship a read-only
record API over the DO data. (Full MST/commit signing is a later phase.)

---

### (C) Turn the WebSocket event stream into a galaxy-wide firehose / relay — *network effect*

**Concept.** Today, planets learn about each other by point-to-point polling of warp links and
caching manifests for an hour (`src/pages/api/v1/port.ts`). atproto's
[firehose](https://atproto.com/specs/sync) (`com.atproto.sync.subscribeRepos`) and the lighter
JSON [Jetstream](https://docs.bsky.app/blog/jetstream) replace polling with push: a planet
streams its record changes, and a **relay** aggregates many planets into one galaxy-wide view.
The control center stops being a single-planet console and becomes an **AppView** over the
whole federation.

**Maps to existing code.** `src/pages/api/v1/control-ws.ts` already broadcasts typed protocol
events (`INITIATE_TRAVEL`, `QUORUM_REACHED`, `LANDING_AUTHORIZED`, …) with a 50-event ring
buffer. Re-shape those into a Jetstream-style JSON event feed; build a small relay worker that
subscribes to every known planet's feed.

**atproto primitives.** `subscribeRepos` / Jetstream; relay/crawl set; cursors for backfill.

**First step.** Add a Jetstream-shaped JSON endpoint that mirrors the current event payloads,
so an external consumer can tail one planet before building the aggregating relay.

---

### (D) Bridge in-game activity to Bluesky — *social reach, optional*

**Concept.** Give the game a social presence on the existing Bluesky network. Two flavors:
(1) a **bot** that posts mission milestones (departure, quorum reached, arrival) as
`app.bsky.feed.post` records; (2) a **Feed Generator** — a DID-identified service implementing
`app.bsky.feed.getFeedSkeleton` — that offers a "galactic traffic" custom feed of planet
activity ([feeds guide](https://atproto.com/guides/feeds),
[starter kit](https://github.com/bluesky-social/feed-generator)).

**Maps to existing code.** Hook the same protocol events from `control-ws.ts` (esp.
`LANDING_AUTHORIZED`) to fire posts. Per-planet config (`PLANET_NAME` in `src/lib/config.ts`)
gives each planet a distinct voice.

**atproto primitives.** `app.bsky.feed.post`; OAuth or app-password auth; Feed Generator
(`getFeedSkeleton`).

**First step.** A milestone bot that posts on `LANDING_AUTHORIZED`. The custom feed is a
follow-on.

---

### (E) Let real users pilot ships via atproto OAuth — *identity for actors, optional*

**Concept.** Today a `ship_id` is an opaque string. Let a real Bluesky user authenticate with
[atproto OAuth](https://atproto.com/specs/oauth) and pilot a ship, so journeys are attributed
to a **user DID**, and (later) plans can carry a user-level signature in addition to the
planet's.

**Maps to existing code.** The flight-deck UI (`src/pages/index.astro`) and the `initiate`
handler in `src/pages/api/v1/port.ts` are where a `ship_id` is born — that's where a resolved
DID would slot in.

**atproto primitives.** OAuth; handle/DID resolution; user repositories.

**First step.** Add atproto OAuth login to the flight deck and stamp the resolved DID onto new
travel plans.

---

## 3. Reality check

- **Signing-key mismatch is the main gotcha.** atproto repo/identity signing requires
  **secp256k1 (k256)** or **NIST P-256** with low-S signatures
  ([cryptography spec](https://atproto.com/specs/cryptography)); the planet uses **Ed25519**
  (`src/lib/crypto.ts`). On this stack the cleanest path is **P-256**, because the Cloudflare
  Workers Web Crypto API (`crypto.subtle`) supports P-256 but **not** secp256k1. So: keep
  Ed25519 for the native Space Travel Protocol, and **add a P-256 key** for the atproto
  identity/repo layer. Both can live side-by-side in the identity store.
- **Incremental vs. invasive.** (A) and the read-only half of (B)/(C) are additive — new
  routes that project existing data, no schema migration, no change to consensus. Full repo
  commits with a signed MST (the write half of B) and a real relay (C) are larger. (D)/(E) are
  independent social/UX layers.
- **What stays game-specific.** PBFT consensus, Elected Traffic Controllers, 3D coordinates,
  and Flight-Year timing have no atproto equivalent and remain the planet's own protocol.
  atproto is the *substrate* (identity, records, sync, discovery), not a replacement for the
  game logic.
- **No PDS required to start.** A planet can act as its own minimal repo host over the
  existing Durable Object — adopting Lexicons and `did:web` does not force running a full PDS.

---

## 4. Recommended sequencing

1. **(A) `did:web` identity** — the foundation everything else resolves through.
2. **(B) Lexicon records (read-only first)** — makes federation data interoperable.
3. **(C) Firehose/relay** — turns point-to-point polling into a push network + galaxy AppView.
4. **(D) Bluesky bridge** and **(E) pilot OAuth** — optional social and actor-identity layers,
   in either order.

`A → B → C` is the spine; `D` and `E` are independent add-ons.

---

## References

- AT Protocol — [Identity / DIDs](https://atproto.com/specs/did),
  [Repository](https://atproto.com/specs/repository),
  [Lexicon](https://atproto.com/specs/lexicon),
  [Cryptography](https://atproto.com/specs/cryptography),
  [Sync](https://atproto.com/specs/sync),
  [OAuth](https://atproto.com/specs/oauth)
- Bluesky docs — [Feeds guide](https://atproto.com/guides/feeds),
  [Custom Feeds / Feed Generator starter kit](https://github.com/bluesky-social/feed-generator),
  [Jetstream](https://docs.bsky.app/blog/jetstream),
  [The AT Protocol](https://docs.bsky.app/docs/advanced-guides/atproto)
- [Custom Lexicons discussion](https://github.com/bluesky-social/atproto/discussions/3116)
- [Introduction to atproto (mackuba.eu)](https://mackuba.eu/2025/08/20/introduction-to-atproto/)
