# Planet Advanced Reference Implementation (Astro)

This repository serves as an **advanced reference implementation** for a planetary landing site in the [Federated Planets](https://github.com/Federated-Planets/federated-planets) universe, built with [Astro](https://astro.build) and optimized for [Cloudflare Pages](https://pages.cloudflare.com/).

In addition to the standard 3D Star Map, this implementation includes a functional **Space Port UI** template for tracking live traffic and mission archives, following the [Space Travel Protocol](https://github.com/Federated-Planets/federated-planets/blob/main/TRAVEL.md).

For detailed information on how the Federated Planets world works, please refer to the [official specification](https://github.com/Federated-Planets/federated-planets).

## Project Structure

This project uses Astro to dynamically generate the landing site and calculate deterministic coordinates at build-time.

- **`src/pages/index.astro`**: The main **Landing Site** template. Coordinate calculations are performed in the Astro frontmatter.
- **`public/planet.css` & `public/map.js`**: Client-side styles and 3D ThreeJS interactivity.
- **`public/manifest.json`**: The metadata file for your planet.
- **`astro.config.mjs`**: Configuration for Astro and the `@astrojs/cloudflare` adapter.

## Space Port UI

The Space Port section in `index.astro` is designed to be updated via API or local state to show:
- **Live Traffic:** Ships preparing, departing, or arriving.
- **Mission Archive:** A historical log of recent arrivals and departures.
- **3D Coordinates:** All locations in the UI use the standard federation `XXX.XX:YYY.YY:ZZZ.ZZ` format, calculated automatically from domain names.

## Development and Build

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Local Development:**
    ```bash
    npm run dev
    ```
3.  **Build for Production:**
    ```bash
    npm run build
    ```
4.  **Local Preview (Wrangler):**
    ```bash
    npm run preview
    ```

## Deployment

This project is configured for **Cloudflare Pages**. 

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Environment Variables:** Ensure you use **Node.js 20+** in your build environment.
