# Create a Federated Planet

Scaffold a new planet for the [Federated Planets](https://github.com/Federated-Planets/federated-planets) universe — a decentralized space exploration game where every planet is a sovereign website.

## Usage

```bash
npm create planet
```

The interactive setup will ask you for:

- **Output directory** — where to scaffold the project
- **Planet name** — displayed on your landing site and shared with neighboring planets
- **Planet description** — shown to visitors on your landing site
- **Warp links** — URLs of neighboring planets to link to (leave empty for defaults)
- **Cloudflare worker name** — the name of your Worker on Cloudflare

It will then generate a ready-to-deploy `wrangler.jsonc` configured with a Durable Object for storage.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) authenticated with your Cloudflare account (`npx wrangler login`)

## After Scaffolding

```bash
cd my-planet
npm install
npm run dev        # local development
```

To deploy, connect your project to [Cloudflare Workers CI](https://developers.cloudflare.com/workers/ci-cd/) and set:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`

## What Gets Created

```
my-planet/
├── src/
│   ├── pages/          # Astro pages (landing site, space port, manifest)
│   └── lib/            # Protocol logic (consensus, crypto, travel)
├── public/             # CSS, 3D star map (Three.js), static assets
├── scripts/            # Dev utilities (simulate universe, inject DO exports)
├── wrangler.jsonc      # Generated with your worker name and Durable Object config
├── wrangler.dev.jsonc  # Local development config
└── package.json
```

## Learn More

- [Federated Planets specification](https://github.com/Federated-Planets/federated-planets)
- [Space Travel Protocol](https://github.com/Federated-Planets/federated-planets/blob/main/TRAVEL.md)
- [Planet reference implementation](https://github.com/Federated-Planets/planet)
