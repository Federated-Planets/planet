# Planet Advanced Reference Implementation

This repository serves as an **advanced reference implementation** for a planetary landing site in the [Federated Planets](https://github.com/Federated-Planets/federated-planets) universe. 

In addition to the standard 3D Star Map, this implementation includes a functional **Space Port UI** template for tracking live traffic and mission archives.

For detailed information on how the Federated Planets world works, please refer to the [official specification](https://github.com/Federated-Planets/federated-planets).

## Reference Structure

To serve as an advanced planet, this project includes:

- **`public/index.html`**: The source **Landing Site** with integrated Space Port UI.
- **`public/planet.css` & `public/map.js`**: Centralized styles and 3D ThreeJS interactivity.
- **`public/manifest.json`**: The metadata file for your planet.
- **`scripts/update-map.js`**: The build script that generates deterministic 3D coordinates.

## Space Port UI

The Space Port section in `index.html` is designed to be updated via API or local state to show:
- **Live Traffic:** Ships preparing, departing, or arriving.
- **Mission Archive:** A historical log of recent arrivals and departures.
- **3D Coordinates:** All locations in the UI use the standard federation `XXX.XX:YYY.YY:ZZZ.ZZ` format.

## Development and Build

1.  **Customize your planet:** Edit `public/index.html` and `public/manifest.json`.
2.  **Update coordinates:** Every time you add or change links in the Warp Ring, run:
    ```bash
    npm install  # First time only
    npm run build
    ```
3.  **Local Preview:** Use `npm start` to serve the `dist/` folder.
