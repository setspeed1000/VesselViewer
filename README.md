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

**The API key is never stored in plain text in this repository or in the built site.** Keys you paste in are kept in the browser, for the current tab only unless you tick **Remember on this device**.

### Encrypted key (unlock with a passphrase)

You can build an encrypted copy of your key into the site so that you, or people you trust, only need a passphrase:

1. Open the site, click **Data source**, and expand **Build an encrypted key into this site**.
2. Enter your key and a passphrase of at least 12 characters, then click **Encrypt**. This runs in your browser; nothing is sent anywhere.
3. Copy the result. In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add a repository variable named `VITE_ENCRYPTED_API_KEY` with that value.
4. Re-run the **Deploy to GitHub Pages** workflow. The site now asks visitors for the passphrase. Anyone without it gets the simulator.

The encryption is AES-256-GCM with a PBKDF2-SHA256 key (600,000 iterations). The encrypted text is public, so a short or guessable passphrase can be brute-forced offline; use a long one. Once someone unlocks the key, their browser uses it, so they can read it. **To give the public live data without revealing the key at all, use the relay.** No browser-side scheme can hide a key that the browser itself must send.

## GitHub Pages deployment

1. In the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. With "Deploy from a branch" Pages serves the unbuilt source and the page stays on "Loading VesselViewer…".
2. The `Deploy to GitHub Pages` workflow runs tests on every push and deploys from the repository's default branch. Run it once from the **Actions** tab (**Run workflow**) after changing the setting. The site appears at `https://<user>.github.io/VesselViewer/`.
3. Open the site, click **Data source**, choose **aisstream.io (direct)** and paste your key, or set up an encrypted key (below).

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

### Advanced models: Royal Caribbean, Carnival and Norwegian fleets

With **Advanced models** on (Filters & display), every ship these three lines have in service (79 ships, October 2026) gets a detailed model of its class instead of the generic hull. The details panel shows the line and class, e.g. "Carnival · Vista class".

**Royal Caribbean (30 ships)**

| Class | Ships | Signature features modelled |
| --- | --- | --- |
| Icon | Icon, Star, Legend of the Seas | AquaDome, Thrill Island slides, Pressure Drop, Royal Bay pool |
| Oasis | Oasis, Allure, Harmony, Symphony, Wonder, Utopia of the Seas | Split cabin towers, Central Park with trees, Boardwalk with carousel, AquaTheater, Ultimate Abyss, zip line, FlowRiders, twin funnels |
| Quantum | Quantum, Anthem, Ovation, Spectrum, Odyssey of the Seas | North Star arm and capsule, RipCord by iFly, SeaPlex, Two70 stern glass, Solarium |
| Freedom | Freedom, Liberty, Independence of the Seas | Funnel climbing wall, FlowRider, Viking Crown Lounge, Solarium |
| Voyager | Voyager, Explorer, Adventure, Navigator, Mariner of the Seas | As Freedom, at Voyager length and deck count |
| Radiance | Radiance, Brilliance, Serenade, Jewel of the Seas | Glass top tier, Centrum glass walls, outward-facing glass lifts |
| Vision | Vision, Rhapsody, Grandeur, Enchantment of the Seas | Viking Crown Lounge ringing the funnel, Centrum glass walls |

**Carnival (29 ships)**: all with the winged red, white and blue "whale tail" funnel except the Grand class

| Class | Ships | Signature features modelled |
| --- | --- | --- |
| Excel | Mardi Gras, Carnival Celebration, Carnival Jubilee | Blue hull livery, BOLT roller coaster around the funnel |
| Vista | Carnival Vista, Horizon, Panorama | SkyRide elevated track, Kaleid-o-Slide, Twister |
| Venice (Vista subclass) | Carnival Venezia, Firenze | Glass-roofed lido, no SkyRide |
| Dream | Carnival Dream, Magic, Breeze | WaterWorks slides, mini-golf |
| Splendor | Carnival Splendor | Retractable glass roof over the midships pool |
| Conquest | Carnival Conquest, Glory, Valor, Liberty, Freedom | WaterWorks slides |
| Sunshine | Carnival Sunshine, Sunrise, Radiance | Twister, side-by-side racer slides, SkyCourse ropes course |
| Spirit | Carnival Spirit, Pride, Legend, Miracle, Luminosa | Glass-walled top tier, terraced stern |
| Fantasy | Carnival Elation, Paradise | Funnel far aft, Twister slide |
| Grand (ex-P&O Australia) | Carnival Adventure, Encounter | Tall terraced stern, conventional funnel in Carnival colours |

**Norwegian (20 ships)**: all with bow hull art (a stylised mural per class)

| Class | Ships | Signature features modelled |
| --- | --- | --- |
| Prima | Norwegian Prima, Viva | Three-level Prima Speedway, The Drop slide down the side, Infinity Beach |
| Prima Plus | Norwegian Aqua, Luna | Aqua Slidecoaster looping the funnel, The Drop |
| Breakaway Plus | Norwegian Escape, Joy, Bliss, Encore | Two-level go-kart track (Escape: ropes course instead), slide loops over the side |
| Breakaway | Norwegian Breakaway, Getaway | Free-fall slides, ropes course |
| Epic | Norwegian Epic | Blunt, upright front; Epic Plunge bowl slide |
| Jewel | Norwegian Jewel, Jade, Pearl, Gem | Spinnaker observation lounge, aft slide |
| Dawn | Norwegian Star, Dawn | Spinnaker observation lounge, aft slide |
| Sun | Norwegian Sun | Spinnaker observation lounge (Norwegian Sky left the fleet in August 2026) |
| Leo | Norwegian Spirit | Terraced stern, Spinnaker lounge |
| Pride of America | Pride of America | Stars-and-stripes hull art |

Every model also has a lofted hull with a raked, flared bow, rows of portholes, balcony decks with dividers, terraced fronts, lifeboats, bridge wings, a mast with radomes, a funnel in the line's livery, pools with teak surrounds, hot tubs and sun loungers.

The models are procedural (`src/render/models/`): generated in code from each class's real length, beam and deck count. They are stylised reconstructions, not shipyard CAD data. NCL's hull art differs on every ship, but each model shows one mural per class. Ships are matched by AIS name, including names cut to AIS's 20-character limit. A reported ship type or length that contradicts the class rejects the match, and non-distinctive names ("MARDI GRAS", "PRIDE OF AMERICA") also need matching dimensions (`shared/fleet.ts`). The simulator includes one `SIM` ship of each class so the models can be viewed without live data. Select one and press **View in 3D**.

### 3D models

`src/render/shipMesh.ts` defines the model convention: bow toward +Y, starboard toward +X, up +Z, unit size. Each instance is scaled to the vessel's real beam, length and freeboard. To use detailed models, export glTF files that follow the same convention (or apply a fixed rotation). Then swap the `SimpleMeshLayer`s in `src/render/layers.ts` for deck.gl `ScenegraphLayer`s, one per category, reusing `getPosition`, `getOrientation`, `getScale` and `getTranslation`.

## Notes

- AIS is broadcast by the ships themselves. Positions, names and dimensions can be wrong, missing or delayed. Do not use this for navigation.
- Coverage depends on aisstream.io's receiver network, which is strongest near coasts.
- Base map © OpenMapTiles, data © OpenStreetMap contributors.
