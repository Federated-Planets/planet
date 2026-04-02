import { DurableObject } from "cloudflare:workers";

export default class TrafficControl extends DurableObject {
  private sessions: Set<WebSocket> = new Set();
  private events: any[] = [];

  constructor(state: any, env: any) {
    super(state, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS travel_plans (
        id TEXT PRIMARY KEY,
        ship_id TEXT NOT NULL,
        origin_url TEXT NOT NULL,
        destination_url TEXT NOT NULL,
        start_timestamp INTEGER NOT NULL,
        end_timestamp INTEGER NOT NULL,
        status TEXT CHECK(status IN ('PREPARING', 'PLAN_ACCEPTED')) NOT NULL DEFAULT 'PREPARING',
        signatures TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_travel_plans_active ON travel_plans (end_timestamp, origin_url, destination_url);

      CREATE TABLE IF NOT EXISTS traffic_controllers (
        planet_url TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        space_port_url TEXT NOT NULL,
        last_manifest_fetch INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS identity (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS consensus_plans (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
    console.log("[TrafficControl] Initialized with SQLite storage");
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/events" && request.method === "POST") {
      const event = await request.json();
      this.events.push({ ...event, timestamp: Date.now() });
      if (this.events.length > 50) this.events.shift();
      this.broadcast(JSON.stringify(event));
      return new Response("OK");
    }

    if (url.pathname === "/storage" && request.method === "POST") {
      return this.handleStorage(request);
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // @ts-ignore
      server.accept();
      this.sessions.add(server);

      server.send(JSON.stringify({ type: "history", data: this.events }));

      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response(JSON.stringify(this.events), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleStorage(request: Request): Promise<Response> {
    const body: any = await request.json();
    const { action } = body;

    switch (action) {
      case "getIdentity": {
        const pub = this.ctx.storage.sql
          .exec("SELECT value FROM identity WHERE key = 'identity_public'")
          .toArray();
        const priv = this.ctx.storage.sql
          .exec("SELECT value FROM identity WHERE key = 'identity_private'")
          .toArray();
        return Response.json({
          public: pub.length > 0 ? (pub[0] as any).value : null,
          private: priv.length > 0 ? (priv[0] as any).value : null,
        });
      }

      case "setIdentity": {
        this.ctx.storage.sql.exec(
          "INSERT OR REPLACE INTO identity (key, value) VALUES ('identity_public', ?), ('identity_private', ?)",
          body.publicKey,
          body.privateKey,
        );
        return Response.json({ success: true });
      }

      case "savePlan": {
        const expiresAt = Date.now() + 3600 * 1000;
        this.ctx.storage.sql.exec(
          "INSERT OR REPLACE INTO consensus_plans (id, data, expires_at) VALUES (?, ?, ?)",
          body.planId,
          body.data,
          expiresAt,
        );
        return Response.json({ success: true });
      }

      case "getPlan": {
        const rows = this.ctx.storage.sql
          .exec(
            "SELECT data FROM consensus_plans WHERE id = ? AND expires_at > ?",
            body.planId,
            Date.now(),
          )
          .toArray();
        return Response.json({
          data: rows.length > 0 ? (rows[0] as any).data : null,
        });
      }

      case "query": {
        const results = this.ctx.storage.sql
          .exec(body.sql, ...(body.params || []))
          .toArray();
        return Response.json({ results });
      }

      case "exec": {
        this.ctx.storage.sql.exec(body.sql, ...(body.params || []));
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  }

  broadcast(message: string) {
    for (const ws of this.sessions) {
      try {
        ws.send(message);
      } catch (e) {
        this.sessions.delete(ws);
      }
    }
  }
}
