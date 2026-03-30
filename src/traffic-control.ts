export default class TrafficControl {
  private sessions: Set<WebSocket> = new Set();
  private events: any[] = [];

  constructor(state: any, env: any) {
    console.log("[TrafficControl] Initialized");
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

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // @ts-ignore
      server.accept();
      this.sessions.add(server);
      
      server.send(JSON.stringify({ type: 'history', data: this.events }));
      
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response(JSON.stringify(this.events), {
      headers: { "Content-Type": "application/json" }
    });
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
