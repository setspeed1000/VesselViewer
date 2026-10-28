# VesselViewer

Real-time ship tracking on a live world map, using AIS data from [aisstream.io](https://aisstream.io). Vessels are drawn as heading-aware icons when you are zoomed out. When you zoom in they become true-scale 3D hulls, sized from each ship's own transponder dimensions. The code is laid out so that detailed 3D models and a game mode can be added without reworking it.

It runs as a static site on GitHub Pages. You can add an optional relay server if you want to keep your API key private.

## Features

- Live AIS positions and voyage data: name, type, speed, course, heading, destination, ETA, size, draught, IMO and call sign.
- Colour-coded vessel categories that double as filters.
- Search by name, MMSI, IMO or call sign.
- A trail of the selected vessel's recent track.
- Positions between reports are predicted from speed and course. This can be switched off.
- 3D mode from zoom 12 upwards. Hulls are placed at their real length and beam, offset from the GPS antenna using the AIS A/B/C/D dimensions. Right-drag or two-finger drag to tilt and rotate the view.
- **Follow** keeps the camera on a vessel. **View in 3D** flies to a low, pitched camera behind it.
- A built-in simulator, so the site works with no API key. Simulated ships are always labelled `SIM …` and the page shows a "simulated" banner.

## Data sources

Pick a source from **Data source** in the app.

| Source | API key location | When to use it |
| --- | --- | --- |
| Simulator | none | Demos and development. Not real ships. |
| aisstream.io (direct) | your browser's localStorage only | Quickest way to see live data. The key is sent only to aisstream.io. |
| VesselViewer relay | on your relay server | Keeps the key private, and the browser downloads only what is on screen. Use this if aisstream refuses direct browser connections. |

**The API key is never stored in this repository or in the built site.** A key placed in a GitHub Pages bundle would be readable by anyone, so it is entered at runtime instead.

## GitHub Pages deployment

1. Merge this branch into `main`.
2. In the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The `Deploy to GitHub Pages` workflow tests, builds and publishes on every push to `main`. The site appears at `https://<user>.github.io/VesselViewer/`.
4. Open the site, click **Data source**, choose **aisstream.io (direct)** and paste your key.

Optional: if you run a relay, set a repository variable `VITE_RELAY_URL` (for example `wss://relay.example.com/ws`) under **Settings → Secrets and variables → Actions → Variables**. The relay then becomes the default source for every visitor.

## Relay server (optional)

The relay keeps one connection to aisstream.io, holds the key server-side, and streams each browser only the vessels inside its view. It also persists vessel names across restarts.

```bash
cp .env.example .env
```

Put your key in `.env`, then:

```bash
npm ci
```

```bash
npm run build:relay
```

```bash
npm run relay
```

To deploy it on any Docker host (Render, Fly.io, a VPS):

```bash
docker build -t vesselviewer-relay .
```

```bash
docker run -d -p 8787:8787 -e AISSTREAM_API_KEY=your-key -e ALLOWED_ORIGINS=https://<user>.github.io vesselviewer-relay
```

The relay must be served over `wss://` (put it behind HTTPS) to be reachable from the Pages site. Health check: `GET /health`.

## Development

```bash
npm ci
```

```bash
npm run dev
```

This starts the site on http://localhost:5173 with the simulator. To work against a local relay, run `npm run dev:relay` in a second terminal and choose relay `ws://127.0.0.1:8787/ws`.

```bash
npm test
```

```bash
npm run build
```

`npm test` runs the unit tests plus an end-to-end relay test against a mock aisstream.io server. `npm run build` typechecks and writes the static site to `dist/`.

## Architecture

```
shared/            Runs in both the browser and Node
  aisstream.ts     aisstream.io message parser (drops AIS "not available" values)
  store.ts         Vessel state: merging, ordering, tracks, search, expiry
  geo.ts           Distances, bounding boxes, dead reckoning
  vessel.ts        Vessel model, ship-type categories, labels
  simulator.ts     Synthetic traffic in aisstream format
  protocol.ts      Relay ⇄ browser WebSocket messages
src/               Static site (Vite + TypeScript)
  app.ts           Wires world, source, map, UI and plugins
  core/world.ts    Client state and events: the integration point for game logic
  sources/         Simulator, direct aisstream.io, relay
  render/          deck.gl layers, procedural ship meshes, icons
  map/             MapLibre base map with a deck.gl overlay
  ui/              Panels, search, settings
  plugins/types.ts Plugin interface
server/            Optional relay (Node + ws)
test/              node:test suites
```

Rendering uses [MapLibre GL JS](https://maplibre.org) for the base map ([OpenFreeMap](https://openfreemap.org) tiles, no key needed) and [deck.gl](https://deck.gl) for vessels.

## Extending VesselViewer

### Plugins (game modes, overlays)

A plugin can read the live world, react to events, add deck.gl layers and intercept clicks:

```ts
import { ScatterplotLayer } from '@deck.gl/layers';
import type { AppPlugin } from './plugins/types';

const radar: AppPlugin = {
  id: 'radar',
  setup(app) {
    return app.world.on('selection', (mmsi) => console.log('selected', mmsi));
  },
  layers(ctx) {
    const me = ctx.ships.find((s) => s.vessel.mmsi === ctx.world.selected);
    if (!me) return [];
    return [
      new ScatterplotLayer({
        id: 'radar-range',
        data: [me],
        getPosition: (s) => s.position,
        getRadius: 5556, // 3 nautical miles
        radiusUnits: 'meters',
        stroked: true,
        filled: false,
        getLineColor: [255, 80, 0],
        lineWidthMinPixels: 2,
      }),
    ];
  },
};

app.registerPlugin(radar); // `app` is window.vesselViewer
```

For a multiplayer or scripted game, implement `DataSource` (`src/sources/types.ts`) to feed your own vessels into the same world.

### 3D models

`src/render/shipMesh.ts` defines the model convention: bow toward +Y, starboard toward +X, up +Z, unit size. Each instance is scaled to the vessel's real beam, length and freeboard. To use detailed models, export glTF files that follow the same convention (or apply a fixed rotation). Then swap the `SimpleMeshLayer`s in `src/render/layers.ts` for deck.gl `ScenegraphLayer`s, one per category, reusing `getPosition`, `getOrientation`, `getScale` and `getTranslation`.

## Notes

- AIS is broadcast by the ships themselves. Positions, names and dimensions can be wrong, missing or delayed. Do not use this for navigation.
- Coverage depends on aisstream.io's receiver network, which is strongest near coasts.
- Base map © OpenMapTiles, data © OpenStreetMap contributors.
