# Zippi — Project Report

Zippi is a travel app for Indian cities. Riders compare live cab fares across Uber, Ola and Rapido, check fuel prices, and get **Safe Directions**: a route planner that shows the *safest* way between two points, not just the fastest. Operators run the service from a separate admin console.

This report covers every part of the project, the technology behind each, and how the Safe Directions feature works.

---

## 1. At a glance

| | |
|---|---|
| **Customer app** | Dashboard, live fare comparison, Safe Directions, fuel prices, profile, plus placeholder screens for travel, trips and wallet |
| **Admin console** | Customers, users, fuel prices, trips, tolls, ride providers, provider connections, raw payload archive, audit logs, settings |
| **Coverage** | Fare comparison: anywhere the providers serve. Safe Directions: Delhi NCR (Delhi, Noida, Greater Noida, Ghaziabad, Gurugram, Faridabad) |
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · PostgreSQL + Drizzle ORM · NextAuth · Playwright · GraphHopper 11 (Java 21) · Python 3.13 analysis pipeline · MapLibre GL + OpenFreeMap |
| **AI / paid APIs** | None. Safety analysis is a deterministic algorithm on open map data. No paid map, routing or AI service is used |

---

## 2. Technology stack

| Layer | Technology | Used for |
|---|---|---|
| Web framework | **Next.js 16.3** (App Router, Turbopack), **React 19.2**, TypeScript 5 | Pages, server components, API route handlers |
| Styling | **Tailwind CSS v4**, custom `--zp-*` design tokens, `next-themes` | Light/dark themes, responsive layout |
| UI | Radix UI (Dialog, Tabs), lucide-react icons, Framer Motion, Recharts, TanStack Table | Dialogs, admin tables, charts, animation |
| Auth | **NextAuth v4** (credentials provider, JWT sessions), bcryptjs, zod | Login, signup, mobile OTP, password reset, admin role |
| Database | **PostgreSQL** via `pg`, **Drizzle ORM** + Drizzle Kit | Users, sessions, fares, tolls, fuel prices, pothole reports |
| Browser automation | **Playwright** (runtime + test runner) | Fetching Uber/Ola fares through a real browser; end-to-end tests |
| Routing engine | **GraphHopper 11.1** on **Java 21** (Temurin), localhost:8989 | Fastest and safest routes, turn-by-turn instructions |
| Safety analysis | **Python 3.13** via **uv**; pyosmium, NumPy, SciPy, Shapely | Map analysis that scores every road in Delhi NCR |
| Maps | **MapLibre GL JS** with **OpenFreeMap** vector tiles (no API key) | Interactive map, route lines, risk heatmap |
| Map data | **OpenStreetMap** via Geofabrik regional extracts | Roads, water bodies, land use, place names |
| Testing | Playwright (4 viewports, axe accessibility checks), pytest | UI, API, accessibility, analysis maths |

---

## 3. System architecture

```
                         ┌──────────────────────────────────────────────┐
  Browser                │  Next.js 16 server (Node runtime)            │
  ───────                │                                              │
  /home (customer app) ──┼─► Server components + route handlers         │
  /admin (console)       │     ├─ /api/auth/*      NextAuth, OTP        │
                         │     ├─ /api/fares/*     geocode, SSE stream ─┼─► Uber / Ola / Rapido
  MapLibre map ◄─────────┼─────├─ /api/directions  fastest vs safest ───┼─► GraphHopper :8989
  OpenFreeMap tiles      │     ├─ /api/potholes    crowd reports        │      (car_fast, car_safe)
                         │     ├─ /api/safety/*    engine status        │
                         │     └─ /api/admin/*     operator tools       │
                         │                 │                            │
                         │                 ▼                            │
                         │           PostgreSQL (Drizzle)               │
                         └──────────────────────────────────────────────┘

  Offline (one command, ~2 min after the first download)
  ───────────────────────────────────────────────────────
  Geofabrik OSM extracts ─► Python pipeline ─► risk-tagged OSM file ─► GraphHopper import
                                            ├► 100 m analysis grid  (data/safety/grid.bin)
                                            ├► heatmap overlay      (public/safety/overlay.geojson)
                                            └► calibration report   (data/safety/report.json)
```

---

## 4. Features

### 4.1 Accounts and authentication

- **Email + password** signup and login. Passwords are hashed with bcrypt; every request body is validated with zod.
- **Mobile OTP** flow. It checks whether the number already has an account, sends existing users to the dashboard, and collects details from new users.
- **Forgot password** via mobile and OTP.
- **Sessions:** NextAuth issues JWTs. Each login also writes a `user_sessions` row, and every request checks that row, so a revoked session stops working immediately.
- **Account security:** login history, backup codes, and 2FA fields on the user record.
- **Roles:** `user` and `admin`. A `proxy.ts` guard protects `/admin` and `/api/admin`, and each admin route checks again with `requireAdmin()`.

### 4.2 Customer app (`/home`)

- A **dashboard** with greeting, search, quick actions, fuel promo, popular destinations, nearby fuel prices, recent ride and wallet card.
- A responsive **shell**: sticky sidebar on desktop, slide-in drawer on mobile, notifications and user menu in the top bar.
- **Light and dark themes** driven by design tokens, including a system-preference mode.
- Placeholder screens for Travel, My Trips, Wallet, Book Travel and My Vehicle, which hold their spots in the navigation.

### 4.3 Live ride fare comparison (`/home/ride`)

- **Place search:** autocomplete and place resolution through the server, so the browser never talks to the vendor directly.
- **Live fares from Uber, Ola and Rapido**, **streamed to the page over Server-Sent Events** so each provider's results appear as soon as they arrive:
  - **Uber:** prices captured from its web app inside a real Chromium page.
  - **Ola:** its fare APIs, called with a stored session.
  - **Rapido:** read from its public route pages.
- **Built to protect provider accounts and stay reliable:**
  - Three cache freshness bands on a ~111 m coordinate grid.
  - Identical in-flight requests share one provider call.
  - Rate limits: a gap between requests, a token bucket, a daily budget and a circuit breaker.
  - Stale-but-labelled results are served instead of errors when a provider is unhealthy.
- **Provider sessions** are encrypted with AES-256-GCM. A background health check watches them, and a session can be refreshed from the admin console through a **remote OTP login** that streams the provider's login page.
- **Data archive:** every provider response is kept in a capped archive and broken out into per-ride price rows, which gives price history and early warning when a provider changes its format.

### 4.4 Safe Directions (`/home/directions`)

Map apps optimise for time. Safe Directions finds the **safest** route. It avoids roads likely to be potholed or poorly maintained:
- lanes through unplanned urban villages and colonies,
- roads beside ponds, rivers, canals and open drains, which waterlog in the monsoon,
- roads across open rural land,
- unpaved or badly surfaced roads,
- spots riders have reported as potholes.

It shows the fastest and the safest route side by side and explains every risky stretch.

#### What the rider sees

- **From / To** search, reusing the ride-booking place search, or tap the map to drop a pin.
- **Fastest vs Safest comparison cards:** travel time, distance, a 0–100 safety score, risky distance, and the time cost of the safer route.
- **Route lines on the map:** the fastest route in grey, the safest coloured green → amber → red by risk along its length.
- **"Why this route" panel:** every risky stretch with plain-language reasons, for example:
  - *"Narrow lanes through an unplanned area near Gejha (irregular street pattern, 31% of junctions are dead ends)"*
  - *"Runs right beside an open drain (~10 m) — prone to waterlogging"*
  - *"2 pothole reports from riders on this stretch"*

  Tapping a stretch zooms the map to it. Stretches that sit at the start or end and that both routes share are labelled *unavoidable*.
- **Risk heatmap overlay:** unplanned areas in red, water-adjacent zones in blue, rural land in amber, drawn as smoothed areas, so riders can see what the algorithm sees.
- **Report a pothole:** a signed-in rider taps the road and picks a severity (minor, bad, dangerous). The pin is snapped to the nearest road. A report within 20 m of an existing one confirms it, and confirmations raise its severity. The very next route request avoids it.

#### How the safety analysis works

The analysis is a fixed algorithm run on OpenStreetMap data, not an AI model, and it doesn't look at screenshots. It mirrors how a person reads a map. Planned sectors show long, straight roads on a grid, while urban villages show short, tangled lanes and dead ends. The algorithm measures that directly.

1. **Snapshots of the street network.** Every 100 m across NCR, it measures the street pattern within a 250 m radius (509,270 cells in all):
   - **Street orientation order:** how concentrated street directions are. This is an urban-planning metric based on orientation entropy (Boeing, 2019). A grid scores 1, a tangle of lanes scores near 0. It is rotation-invariant, so Noida's tilted sector grids still score as grids.
   - **Dead-end share:** the share of junctions that are dead ends.
   - **4-way junction share** and **footpath-lane share.** Many village *galis* are mapped as footpaths.

   These combine into an **unplanned score U** from 0 to 1. The street pattern measured excludes arterial roads, because the main road skirting a village is usually the safe alternative. It also leaves out parking aisles, pavements, gated-society service roads, and footpaths inside parks and campuses.
2. **Water.** It measures each road's distance to 5,774 water features: lakes, ponds, reservoirs and wetlands, plus rivers, canals and drains widened to their typical width. Bridges are exempt.
3. **Rural land.** It measures the share of farmland, scrub, orchard and forest around each road. City parks and lawns don't count.
4. **A risk level for every road.** Each of 314,510 drivable roads is sampled every 20 m. Its unplanned, water and rural bands combine into a **risk level from 0 to 6**.

The score was **calibrated against 70 labelled places** across NCR: 35 urban villages, old-city and unauthorised-colony areas (e.g. Gejha, Bhangel, Tughlakabad, Mehrauli, Chandni Chowk, Shahpur Jat, Munirka) and 35 planned sectors and colonies (e.g. Noida Sectors 62/92/93B/108, Dwarka, Rohini, Chanakyapuri, Lodhi Colony, DLF Phases).

| Calibration result | Value |
|---|---|
| Separation of the two groups (ROC AUC; 0.5 = chance, 1.0 = perfect) | **0.967** |
| Gap between the groups' median scores | 0.316 |
| Known unplanned areas flagged | 69% |
| Planned areas wrongly flagged | **0%** |
| Minor-road length at risk level ≥ 4 | 19.6% |

Calibration runs on every build and **fails the build** if separation regresses.

#### How routing works

- **GraphHopper 11.1** runs locally with two car profiles on one road graph:
  - `car_fast` — what a typical navigation app would choose, tuned to minimise time.
  - `car_safe` — the same car model plus the risk model.
- **Risk is built into the road graph at import time.** The pipeline writes each road's risk into three OSM tags that GraphHopper already parses and that car routing otherwise ignores:

  | OSM tag | GraphHopper value | Carries |
  |---|---|---|
  | `mtb:scale` | `mtb_rating` | risk level |
  | `sac_scale` | `hike_rating` | water band |
  | `horse_scale` | `horse_rating` | unplanned band |

  No plugin or code fork is needed. GraphHopper's precomputed "contraction hierarchies" (CH) bake the risk in, so each route query takes milliseconds.
- **Road class softens risk.** A lane inside a high-risk village keeps only 30% of its routing priority. An arterial skirting the same village keeps about 90%, so the router naturally finds the nearest clean alternative.
- **Surface evidence** from OSM (unpaved, bad smoothness, dirt tracks) lowers priority further.
- **Pothole reports are applied per request.** Potholes only ever make roads more expensive. So the server first takes the precomputed safest route, and only if a reported pothole lies on it does it re-route with the potholes penalised, using GraphHopper's landmark (LM) algorithm.
- **One source of truth.** The level → priority mapping lives in a single TypeScript module. It generates GraphHopper's safety model *and* scores routes for the explanation panel, so what the router avoided and what the panel reports always agree.

### 4.5 Admin console (`/admin`)

| Section | What it does |
|---|---|
| Dashboard | Key counts and activity |
| Customers | Searchable customer list; detail page with profile, notes and tags |
| Users | Account management, suspension, roles |
| Fuel Prices | CRUD by state/city/fuel type, plus **CSV bulk import** |
| Trips | Trip records with origin, destination, distance, tolls |
| Tolls | Toll plaza management |
| Providers | Travel provider catalogue |
| Connections | Provider session health, encrypted session import, **remote OTP login** via a live screencast of the provider's login page |
| Payloads | Archive of raw provider responses, for diagnosing breakages |
| Audit Logs | Every admin action, recorded |
| Profile / Settings / Sessions | Admin profile, password change, deactivation, active sessions |

---

## 5. Data model (PostgreSQL)

| Area | Tables |
|---|---|
| Identity | `users`, `user_sessions`, `login_history`, `backup_codes`, `otp_verifications` |
| Customers | `customer_notes`, `customer_tags` |
| Travel data | `fuel_prices`, `travel_providers`, `trips`, `toll_plazas` |
| Operations | `admin_logs` |
| Fare comparison | `provider_session` (encrypted), `fare_cache`, `rate_ledger`, `raw_payload`, `ride_observation` |
| Safe Directions | `pothole_report` (raw and road-snapped location, severity, confirmations, status), `pothole_confirmation` (one row per rider per report; also enforces the daily report limit) |

Schema lives in `src/lib/schema.ts` with Drizzle migrations under `drizzle/`. `ensureDatabaseSetup()` creates the tables idempotently at runtime.

---

## 6. Safe Directions API

| Endpoint | Purpose |
|---|---|
| `POST /api/directions` | `{from:{lat,lng}, to:{lat,lng}}` → fastest and safest routes: geometry, time, distance, per-segment risk, safety score, risky stretches with reasons, turn-by-turn instructions, nearby potholes |
| `GET /api/potholes?bbox=` | Active pothole reports in a map area |
| `POST /api/potholes` | Report or confirm a pothole. Requires sign-in; snapped to the nearest road (rejected if more than 40 m away); de-duplicated within 20 m; limit 20 per rider per day |
| `GET /api/safety/status` | Routing engine up? Analysis grid loaded? Data built with the current model? |

Errors use stable codes: `OUT_OF_AREA`, `NO_SNAP`, `NO_ROUTE`, `ENGINE_OFFLINE`, `TIMEOUT`, `UNAUTHENTICATED`, `TOO_FAR_FROM_ROAD`, `RATE_LIMITED`.

---

## 7. Performance

Measured on the development laptop (Intel Core Ultra 5 125H, 16 GB RAM):

| Step | Time |
|---|---|
| Download OSM extracts for NCR (one-time, ~550 MB) | ~2 min |
| Clip and merge the two regions to NCR | ~3.5 min |
| Analysis: street pattern, water, rural, per-road levels | ~47 s |
| Write risk tags into the routing data | ~10 s |
| Export grid and heatmap | ~14 s |
| Calibration | < 1 s |
| Build the routing graph, both profiles (once per model change; 602k junctions, 793k road segments) | ~22 min |

**Directions API.** 200 random trips of 2–15 km across NCR's built-up core (`npm run safety:bench`, development server):

| | p50 | p95 | max |
|---|---|---|---|
| Server time (both routes, scoring, explanations, pothole lookup) | 14 ms | 23 ms | 103 ms |
| End to end, as the browser sees it | 28 ms | 43 ms | 126 ms |

A safest route re-planned around a reported pothole adds about 25–40 ms.

**What safety costs.** On those 200 trips the safest route differs from the fastest in 53% of cases. When it does, it costs a median **+1% travel time** (+6% at the 90th percentile) and cuts a median **22% of the risky road** on the trip.

Analysis outputs are compact: a 5.1 MB grid loaded once by the server, and a 4.9 MB heatmap overlay the browser loads only when the overlay is switched on.

---

## 8. Quality and testing

- **Playwright end-to-end suite** across four viewports (desktop 1600, laptop 1280, tablet 834, mobile 390):
  - Every `/home` page is checked in light and dark mode, with no console errors and **axe accessibility** checks.
  - Fare-comparison journey, orchestration and unit tests.
  - Safe Directions: unit tests (grid indexing, priority maths, stretch merging, scoring), API tests (validation, out-of-area, demo routes, the full pothole flow), and a UI journey (search → compare → explain → overlay → report).
- **Python tests (pytest)** for the analysis maths (orientation order on synthetic grids vs random lanes, the smoothing kernel, weights), plus **shared grid test vectors** that make the Python pipeline and the TypeScript server index the map identically.
- **Calibration gate:** the analysis build fails if the planned-vs-unplanned separation drops below its thresholds.
- **Current status:** all 92 Safe Directions tests, the full dashboard suite and the fare unit tests pass on all four viewports, as do the 9 pipeline tests.

---

## 9. Running the project

```bash
# App
npm install
npm run dev                 # http://localhost:3000

# Safe Directions — one-time setup (Java 21 + uv installed via winget)
npm run safety:setup        # Python environment for the analysis pipeline
npm run safety:build        # download OSM → analyse → tag → export → calibrate
npm run gh:jar              # fetch GraphHopper 11.1 (checksum-verified)
npm run gh:import           # build the routing graph with the risk model

# Safe Directions — every session
npm run gh:start            # routing engine on http://localhost:8989
```

Changing any weight in `config/safety-model.json` takes `npm run safety:build && npm run gh:import`. The app shows a "data out of date" banner until both have run.

---

## 10. Repository layout

```
src/app/home/            customer app (dashboard, ride, directions, fuel, …)
src/app/admin/           admin console
src/app/api/             route handlers (auth, fares, directions, potholes, safety, admin)
src/lib/fares/           fare comparison: providers, orchestrator, sessions, cache
src/lib/safety/          safe routing: config, grid, GraphHopper client, model, scorer, potholes
src/lib/schema.ts        database schema (Drizzle)
config/                  safety model, calibration checkpoints, shared test vectors
scripts/safety/          Python analysis pipeline (zsafety) + tests
scripts/gh/              GraphHopper fetch / import / start scripts
graphhopper/             engine config and custom models (graph cache is generated)
e2e/                     Playwright tests
docs/                    design notes and this report
```

---

## 11. Known limitations

- **OpenStreetMap completeness.** Unmapped lanes can't be scored. Areas with too little data are marked "insufficient data" and never treated as proof of safety.
- **Grid-shaped unauthorised colonies** (e.g. Sangam Vihar) have straight lanes, so street geometry alone doesn't flag them. Building footprints are the planned next signal.
- **Risk is stored per OSM road.** About 8% of minor-road length lies on roads whose risk changes along their length. Splitting those roads is a planned refinement.
- **Potholes** are estimated from street pattern, surface data and rider reports. There is no public pothole dataset for India.
- **ETAs exclude live traffic.**
- **The OpenFreeMap tile service has no uptime guarantee.** The map style URL is configurable for a self-hosted or commercial tile source.
