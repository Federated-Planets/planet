# Federated Planets

Federated Planets is a decentralized space exploration game where every planet is a sovereign website. There is no central server; the universe is formed by the connections between independent owners.

In this universe, your domain name is your destiny.

- **Deterministic Coordinates:** A planet's location in the 1,000 x 1,000 sparsec grid is deterministically calculated by hashing its domain name. This ensures that every URL has a fixed, unique position in space.
- **Sovereign Hosting:** Each planet is a standalone website hosted by its owner. You control your planet's appearance, atmosphere, and culture.
- **The Warp Ring:** Every planet features a "Warp Ring" (a modern evolution of the classic _web ring_). This area lists neighboring planets and automatically generates a localized star map.

## Calculating Planet Coordinates

To ensure every planet has a unique and fixed position in the 1000x1000 sparsec grid with high precision, we use a simple, deterministic hashing algorithm based on the MD5 hash of your domain name.

1.  **Normalize your domain:** Take your domain name in lowercase, excluding the protocol (e.g., `federatedplanets.com`).
2.  **Generate MD5 Hash:** Compute the MD5 hash of the normalized domain.
3.  **Extract Coordinates:**
    - **X:** Take the first 6 hex characters of the hash and convert them to a decimal integer. Apply modulo 1,000,000, then divide by 1,000 to get a value with 3 decimal points (e.g., `(int_X % 1000000) / 1000.0`).
    - **Y:** Take the next 6 hex characters of the hash and convert them to a decimal integer. Apply modulo 1,000,000, then divide by 1,000 to get a value with 3 decimal points (e.g., `(int_Y % 1000000) / 1000.0`).

## How Navigation Works

Space travel is as simple as clicking a link.

When you visit a planet, its **Warp Ring** displays other known planets in the federation. These links aren't just text; they are coordinates in the grand map. Clicking a link "jumps" your ship (browser) to a new domain, where you arrive at a new world.

## Joining the Federation

To add your planet to the map:

1.  **Host your site:** Deploy your site on any domain.
2.  **Planet Discovery:** Add the following tag to your homepage's `<head>` to link your manifest:
    ```html
    <link rel="space-manifest" href="/manifest.json" />
    ```
3.  **Create Manifest:** Host a `/manifest.json` file containing metadata:
    ```json
    {
      "name": "Your Planet Name",
      "description": "A brief description.",
      "canonical_url": "https://yourdomain.com",
      "coordinates": { "x": 123.456, "y": 789.012 }
    }
    ```
4.  **Add Warp Ring:** Add a "Warp Ring" section to your site, linking to at least one other planet to stay connected to the network.

---

## Reference Implementation

This repository serves as the **official reference implementation** for a planetary landing site.

### Reference Structure

To serve as a standard planet, this project includes:

- **`public/index.html`**: The source **Landing Site** of the planet.
- **`public/planet.css` & `public/map.js`**: Centralized styles and interactivity for the planet and its map.
- **`public/manifest.json`**: The metadata file for your planet.
- **`dist/`**: The generated output directory containing the synchronized site.
- **`scripts/update-map.js`**: The build script that parses the HTML links and generates deterministic coordinates.

### Development and Build

1.  **Customize your planet:** Edit `public/index.html` and `public/manifest.json`.
2.  **Update coordinates:** Every time you add or change links in the Warp Ring, run:
    ```bash
    npm install  # First time only
    npm run build
    ```
3.  **Local Preview:** Use `npm start` to serve the `dist/` folder.
