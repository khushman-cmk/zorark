# Building a live cab-fare comparison system for India (Uber · Ola · Rapido)

**Audience:** an AI agent implementing this system on an existing frontend.
**Status of this document:** every endpoint, header, payload shape and workaround
below was verified against production on 2026-09-09 by driving the real sites and
capturing traffic. Where something is unverified it says so explicitly.

The single most important thing to understand before writing code: **the obvious
endpoints are the wrong ones on two of the three platforms.** Uber's documented
API is dead, and Ola's plausible-looking `web-api/products` returns
`401 IDENTITY_MISSING` even for a fully logged-in session. Both are described in
detail below so you don't rediscover them the hard way.

---

## 1. What the system does

- **Public side:** a visitor enters pickup + drop; the system returns live fares
  from all three platforms, streamed in as each resolves.
- **Admin side:** an operator connects Uber and Ola once by logging in with a
  real phone + OTP. Those sessions are stored encrypted server-side and reused to
  serve every visitor's query. Rapido needs no login at all.
- **Payload console:** every raw provider response is retained and inspectable,
  because these are undocumented APIs that change without notice.

### The economic model and its consequences

One shared account answers everyone's queries. That has three consequences you
must design for, not discover later:

1. **Fares are that account's prices.** Loyalty tiers, promos and passes change
   quoted fares. Uber exposes this per-fare and you can correct for it (§4.1).
2. **A single account issuing hundreds of estimates per day is a detectable
   anomaly.** The rate-limiting layer (§5.3) is a core component, not a nicety.
3. **Sessions die unpredictably.** Plan for stale-but-labelled data and a
   reconnect path (§5.1, §6).

---

## 2. Reverse-engineering results

### 2.1 Summary

| Platform | Real fare source | Anonymous? | Transport |
|---|---|---|---|
| **Uber** | `Products` GraphQL, triggered from the PWA page | Catalogue yes, **prices no** | Browser page + response interception |
| **Ola** | `data-api/category-fare/p2p` + `category-availability/p2p` | No | Plain HTTP with session cookies |
| **Rapido** | Public SEO fare page | **Yes — fully anonymous** | Browser page + DOM scrape |

### 2.2 Geocoding — unauthenticated, serves all three

Rapido exposes two open endpoints. They return Google place IDs and coordinates,
and are the geocoder for the entire system. No key, no login.

```http
POST https://m.rapido.bike/pwa/api/unup/autocomplete/location
Content-Type: application/json
Origin: https://m.rapido.bike
Referer: https://m.rapido.bike/

{"searchWord":"Indiranagar","latitude":12.9716,"longitude":77.5946}
```
```jsonc
{"info":{"status":"success"},"data":[
  {"placeId":"ChIJkQN3GKQWrjsRNhBQJrhGD7U",
   "description":"Indiranagar, Bengaluru, Karnataka, India",
   "name":"Indiranagar"}]}
```

```http
POST https://m.rapido.bike/pwa/api/unup/location/geocode/placeId
{"placeId":"ChIJkQN3GKQWrjsRNhBQJrhGD7U"}
```
```jsonc
{"info":{"status":"success"},
 "data":{"lat":12.9783692,"lng":77.6408356,
         "address":"Indiranagar, Bengaluru, Karnataka, India"}}
```

`latitude`/`longitude` in the autocomplete body are optional and bias results
toward a point. The parameter is `searchWord` — `query`, `text` and `q` all fail
with a validation error.

**Keep the `name` field.** Rapido's fare URL (§4.3) needs the short locality
name, not the full formatted address, and it is not recoverable afterwards.

### 2.3 Uber

**Dead ends, all tested — do not retry these:**

| Path | Result |
|---|---|
| `api.uber.com/v1.2/estimates/price` | `401`, needs approved OAuth 2.0; the `server_token` model is gone |
| `api.uber.com/v1/estimates/price` | `404`, removed |
| `m.uber.com/api/getProductSelectionV2` | `ERR_MISSING_HANDLER`, replaced by GraphQL |
| `uber.com/global/en/price-estimate/` | Marketing page, no fare API |
| GraphQL introspection | Disabled on both gateways |
| `POST /go/graphql` from curl with correct body + `x-csrf-token: x` | `{"extensions":{"code":"unauthorized"}}` |

**The critical finding:** the `Products` GraphQL operation *only succeeds from
the PWA's own page context*. An HTTP client sending a byte-identical body with
the same CSRF header is rejected. The underlying RTAPI
(`cn-geo1.uber.com/rt/riders/products`) explains why — it requires an
`x-uber-token` header the page supplies internally.

**Therefore: navigate the real screen and intercept the response.** Encode both
endpoints in the URL:

```
https://m.uber.com/go/product-selection
  ?pickup=<urlencoded JSON>
  &drop[0]=<urlencoded JSON>
```

`drop[0]` is a literal array index (multi-stop support). Each point:

```jsonc
{"latitude":12.9783692,"longitude":77.6408356,
 "addressLine1":"Indiranagar, Bengaluru, Karnataka, India","addressLine2":"",
 "source":"SEARCH","provider":"google_places"}
```

Match the response by the POST body's `operationName === "Products"`, with a
loose `url().includes('graphql')` filter — the gateway host has moved before.

**Logged out you get a real catalogue with every price blanked.** For
Indiranagar→Koramangala: 36 products across 3 tiers (`Popular`, `Economy`,
`Premium`), `cityID: "130"`, and on every fare:

```jsonc
{"fare":"","fareAmountE5":null,"currencyCode":"",
 "meta":"{\"originalArgs\":{…,\"targetProductType\":\"ANONYMOUS\"}}"}
```

Detect this exact state and refuse to emit prices — never treat blank as zero.

**Priced response shape** (`data.products.tiers[].products[]`):

```jsonc
{"displayName":"Uber Go AC","detailedDescription":"Affordable compact AC rides",
 "currencyCode":"INR","etaStringShort":"5 min","etaInMin":5,
 "estimatedTripTime":2160,
 "fares":[{"fare":"₹249.13","fareAmountE5":24913000,"capacity":4,
           "hasPromo":false,"hasRidePass":false,
           "preAdjustmentValue":"","discountPrimary":"","meta":"{…}"}]}
```

- **Money:** `fareAmountE5 / 1e5`. Fall back to parsing `fare` (strip commas,
  take the first `[\d.]+`) when `fareAmountE5` is null.
- **Duration:** `estimatedTripTime` is seconds.
- **`Products` can fire twice** — an optimistic blank pass then a priced one. If
  you resolve on the first match you can capture blank fares despite a valid
  session. Keep listening briefly and prefer a response where some
  `fareAmountE5` is a number.
- **Filter parcel services.** The list includes `Parcel Bike`, `Parcel Scooter`,
  `Parcel Mini 3W` — package delivery, not rides. They are cheap and would
  wrongly win a "cheapest" comparison. Match on name/description against
  `/\bparcel\b|send packages|send parcels|courier|delivery/i`.
- The full GraphQL query with all 11 fragments is ~4 KB; capture it once from the
  page and store it verbatim rather than hand-writing it.

### 2.4 Ola — the endpoint everyone gets wrong

`https://book.olacabs.com/web-api/products?pickup_lat=…&drop_lat=…` looks
correct, appears in the JS bundle, and is what most write-ups name. **It returns
`401 {"code":"IDENTITY_MISSING","status":3001}` even with a fully valid logged-in
session.** Verified three ways: bare HTTP client, Playwright request context, and
`fetch()` executed inside the logged-in page itself. All three fail identically.

Confirm the session is genuinely live before blaming the session:

```http
GET https://book.olacabs.com/pwa-api/profile
→ 200 {"data":{"personalDetails":{"name":"…","phoneNumber":"+91-…"}}}
→ 200 {"error":{"code":"NOT_LOGGED_IN","status":601}}  when not
```

**The real fare source is two `data-api` endpoints**, discovered by loading the
booking site with both endpoints in the URL and watching XHR:

```
https://book.olacabs.com/?pickup_name=Indiranagar&lat=12.9783692&lng=77.6408356
  &drop_name=Koramangala&drop_lat=12.9352403&drop_lng=77.624532
```

```http
GET /data-api/category-fare/p2p
    ?pickupLat=&pickupLng=&pickupMode=NOW&leadSource=mobile_website
    &dropLat=&dropLng=&silent=false&suggestPickup=true
```
```jsonc
{"data":{"p2p":{"categories":{
  "auto": {"price":"₹130","fareId":"1e621d65-…"},
  "mini": {"price":"₹142","fareId":"1e621d65-…"},
  "prime":{"price":"₹156","fareId":"1e621d65-…"},
  "suv":  {"price":"₹266","fareId":"1e621d65-…"}}}},"error":null}
```

```http
GET /data-api/category-availability/p2p?<same params, no suggestPickup>
```
```jsonc
{"data":{"nextCallAfter":30,"p2p":{"categories":[
  {"id":"auto","displayName":"Auto","canRideNow":true,
   "eta":{"value":-1,"unit":"min"}},
  {"id":"mini","displayName":"Mini","canRideNow":true,
   "eta":{"value":4,"unit":"min"}}]}}}
```

Join on category id: fare gives price, availability gives display name and ETA.

**Session cookies alone are sufficient.** No identity header, no signature. The
page sends `x-fingerprint-id` and `x-requested-with: XMLHttpRequest`; both were
tested as unnecessary. Send `x-requested-with` anyway — it costs nothing and
matches the real client.

**`eta.value === -1` means "unknown".** Rendering it naively produces "-1 min".

`nextCallAfter: 30` is Ola's own polling hint — a reasonable floor for cache TTL.

### 2.5 Rapido — no login required

This is the one that looks closed and isn't.

**The closed path** (a red herring): `POST /pwa/api/pricing/getFareEstimate`
returns `401 Unauthorized`. So do nine siblings —
`pricing/getFare`, `pricing/estimate`, `pricing/getFareEstimateV2`,
`pricing/fareEstimate`, `order/fareEstimate`, `order/getFareEstimate`,
`fare/estimate`, `fareEstimate`, `pricing/getPrice`, `pricing/getEstimate`.
Testing only these leads to the wrong conclusion that Rapido needs an account.

**The open path:** Rapido publishes fares on SEO route pages. Any route works:

```
https://m.rapido.bike/unup-home/seo/<Locality>,<city>/<Locality>,<city>?version=v3
```

e.g. `…/seo/Indiranagar,bangalore/Koramangala,bangalore?version=v3`. Both
`bangalore` and `bengaluru` spellings resolve. Verified live in Bengaluru,
Mumbai, Delhi and Hyderabad.

That page calls:

```http
POST https://m.rapido.bike/pwa/api/unup/scc/fareEstimate
authorization: Bearer          ← no token: genuinely anonymous
appid: 2
appversion: 214
channel-entity: customer
channel-name: pwa
channel-host: browser
version: 1.0
x-m:     <base64 signature>
x-pm:    <base64 signature>
x-km:    <base64 signature>
x-ekref: <base64 signature>

{"pickupLocation":{"lat":…,"lng":…,"displayName":"…","address":"…"},
 "dropLocation":{…},"deviceId":"seo-route-pages"}
```

**Why you cannot call it directly:** the four `x-*` headers are a signature
computed over the request body. Calling without them returns
`{"code":"INVALID_SIGNATURE","errorCode":7}`. Intercepting the page's request and
rewriting the coordinates returns `401` — **the signature covers the body**.

**Two consequences:**
1. You must let the page issue its own request, which means the route is
   determined by the URL, not by coordinates you choose.
2. Since the page must render anyway, **read the rendered DOM** rather than
   decoding the response. This is simpler and sturdier.

**Response format, if you ever need it:** `application/octet-stream` whose body is
a *JSON array of byte values* (`[10,18,10,7,115,…]`), which decodes to protobuf.
Structure: `2.2` = pickup lat/lng, `2.3` = drop lat/lng, `2.4[]` = services with
`.1`/`.2` = service ObjectIds, `.3` = fare low, `.4` = fare high. Map service ids
to names via `POST /pwa/api/unup/location/services` `{"lat":…,"lng":…}`
(unauthenticated), which returns `_id`, `name`, `displayName`, `serviceType`,
plus tariff fields (`baseFare`, `pricePerKm`, `minimumFare`, `priceWithKm`).
**Prefer the DOM.** The protobuf path is documented only as a fallback.

**DOM contract:** `.fare-estimate-wrapper .card-wrap`, one per service, text like
`Auto ₹ 104 - ₹ 125`. Fares are **ranges**, unlike the other two.

---

## 3. Architecture

```
Public request
   → geocode (Rapido open endpoints)
   → cache read (fresh? serve, no provider contact)
   → single-flight (N users, one route ⇒ one fetch)
   → per-provider queue (gap, bucket, budget, breaker)
   → provider adapter
        Uber   : browser page + GraphQL interception
        Ola    : HTTP + session cookies
        Rapido : browser page + DOM scrape (anonymous)
   → normalizer (pure function, JSON → FareOption[])
   → cache write + payload archive
   → SSE event
```

**Three transport strategies, one interface.** Do not try to force all three
providers onto one transport; they genuinely differ. The abstraction belongs at
`Provider.fetchFares(pickup, drop) → FareOption[]`, not below it.

### 3.1 The provider contract

```ts
export type FareOption = {
  name: string
  category: string | null
  price: number            // representative price, promo-corrected
  accountPrice?: number | null   // what the connected account is quoted, if different
  discountNote?: string | null   // why they differ
  priceNote?: string | null      // e.g. Rapido's "₹104–₹125 range"
  currency: string
  etaText: string | null
  durationMin: number | null
  capacity: number | null
}

export type Provider = {
  id: 'uber' | 'ola' | 'rapido'
  label: string
  requiresSession?: boolean       // false for Rapido
  fetchFares(pickup: Coord, drop: Coord): Promise<FareOption[]>
}

export class SessionError extends Error {
  constructor(msg: string, readonly code: 'NO_SESSION' | 'AUTH_EXPIRED',
              readonly provider: ProviderId) { super(msg) }
}
export class NoRidesError extends Error {}   // provider answered, nothing bookable
```

Distinguishing `SessionError` from `NoRidesError` matters: the first is an admin
problem, the second is a legitimate answer.

### 3.2 One device profile, defined once

Define the browser identity in exactly one module and import it into the login
browser, the page-fetch path and the HTTP path. Divergence here causes
session invalidation that is very hard to diagnose.

```ts
export const DEVICE_PROFILE_ID = 'pixel7-chrome-v1'
export const CONTEXT_OPTIONS = Object.freeze({
  ...devices['Pixel 7'],
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  geolocation: { latitude: 12.9784, longitude: 77.6408 },
  permissions: ['geolocation'],
})
export const LAUNCH_ARGS = Object.freeze([
  '--disable-blink-features=AutomationControlled',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion',
])
```

**Use an Android Chrome profile, not iPhone Safari.** A Safari UA over a Chromium
engine is a fingerprint contradiction bot detection checks directly: no
`window.chrome`, wrong `navigator.plugins`, ANGLE/SwiftShader WebGL renderer
strings, and Chrome-shaped TLS. `Pixel 7` makes UA, client hints, JS surface and
TLS agree.

Store `DEVICE_PROFILE_ID` **inside the session blob**. If the profile changes
later, detect the mismatch and mark the session degraded rather than silently
replaying it under a different fingerprint.

The last three launch args matter only for headful mode: Chromium throttles or
halts screencast on an unfocused/occluded window, which freezes the remote-login
stream (§7).

---

## 4. Provider implementations

### 4.1 Uber — page interception

```ts
const json = await captureResponse<UberProductsResponse>(
  'uber',
  productSelectionUrl(pickup, drop),
  (res) => res.url().includes('graphql') &&
           res.request().postDataJSON()?.operationName === 'Products',
  { prefer: (j) => hasPricedFare(j) },   // survive the double-fire
)
```

`captureResponse` must:
- attach the `response` listener **before** `goto`
- treat `goto` rejection as non-fatal (navigation can abort while the XHR we
  want is still in flight)
- detach the listener and clear both timers in a `finally`
- when `prefer` is supplied, keep the first match as a fallback but continue
  listening for a short settle window (~4 s) for a better one

**Promo correction.** Because one account serves everyone, its perks would
silently discount every visitor's quote. Uber exposes this per fare:

```ts
const quoted = fare.fareAmountE5 != null ? fare.fareAmountE5 / 1e5 : money(fare.fare)
const undiscounted = money(fare.preAdjustmentValue)
const perked = Boolean(fare.hasPromo || fare.hasRidePass)
const headline = perked && undiscounted != null ? undiscounted : quoted
// headline → price ; quoted → accountPrice ; reason → discountNote
```

Also keep the reference account clean: burner number, no loyalty subscription, no
promos, no payment instrument attached.

### 4.2 Ola — HTTP with cookies

Fetch both endpoints concurrently, then join:

```ts
const [fareRes, availRes] = await Promise.all([
  ctx.get(`${BASE}/category-fare/p2p?${qs}&suggestPickup=true`),
  ctx.get(`${BASE}/category-availability/p2p?${qs}`),
])
```

- Treat `401` **or** a body matching `/IDENTITY_MISSING|NOT_LOGGED_IN/` as
  `AUTH_EXPIRED`; Ola sometimes returns `200` with an error envelope.
- Availability is decorative — never fail a fare because it failed. Fall back to
  title-casing the category id (`prime` → `Prime`).
- Parse `"₹1,130"` by stripping commas then matching `[\d.]+`.

### 4.3 Rapido — public page scrape

Build the URL from locality + city, which means the geocoder must preserve the
short `name`:

```ts
function localityAndCity(c: Coord) {
  const parts = (c.address ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length < 3) return null
  return { city: parts[parts.length - 3],       // drop country + state
           locality: c.name?.trim() || parts[0] }
}
```

Then load anonymously and read the DOM:

```ts
const cards = await scrapePage('rapido', url,
  () => [...document.querySelectorAll('.fare-estimate-wrapper .card-wrap')]
          .map(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
  { waitForSelector: '.fare-estimate-wrapper .card-wrap' })
```

Parse `"Auto ₹ 104 - ₹ 125"` with
`/^(.*?)\s*₹\s*([\d,]+)(?:\s*-\s*₹\s*([\d,]+))?/`. Quote the **low end** as
`price` and keep the range in `priceNote` — quoting the high end makes Rapido
look uncompetitive; quoting a midpoint invents a number the platform never said.

`waitForSelector` is essential: the page renders its shell before the fare call
returns, so an unconditional scrape yields an empty list.

---

## 5. Fare orchestration

### 5.1 Cache — three bands

Key on a **quantised coordinate grid** so nearby pickups share a row:

```ts
CACHE_GRID_DEG = 0.001                      // ≈111 m
key = `${q(pLat)},${q(pLng)}|${q(dLat)},${q(dLng)}`   // q = round to grid, 4 dp
```

| Band | Age | Behaviour |
|---|---|---|
| fresh | < 90 s | serve, **no provider contact** |
| stale | 90 s – 30 min | serve marked stale + age, refresh in background |
| old | > 30 min | serve only if the provider is down, heavily marked |

**Never evict while a provider is unhealthy** — that is what makes
"stale-not-error" work for free.

Known limitation to state in the UI or docs: it is a grid, so two points metres
apart either side of a cell edge do not share a row. Coarsening the grid trades
precision for hit rate.

### 5.2 Single-flight

```ts
const p = inflight.get(key) ?? fn().finally(() => inflight.delete(key))
```

Key on `${provider}:${routeKey}`. Twenty users on one route must cost the shared
account exactly one request. Assert this with a call counter in tests.

### 5.3 Rate limiting — four independent brakes

This is the account-safety boundary. Each brake catches a different failure.

1. **Serial execution with an 8 s ± 2 s gap.** The single most important control.
   Humans do not issue two estimates a second, and bursts are the most legible
   bot signal. Make the gap an env var so tests can shrink it.
2. **Token bucket** — 20 requests / 10 minutes per provider, refilled
   continuously.
3. **Daily budget** — 800/day in a `rate_ledger(provider, day, count)` table.
   On exhaustion: cache-only + dashboard warning.
4. **Circuit breaker** — 3 auth failures or 5 errors opens it; cooldown escalates
   `1m → 5m → 15m → 60m`; honour `Retry-After`. **Hammering a dead session with
   401s is exactly what converts "expired" into "banned".**

Plus **admission control**: past a queue depth of ~8, reject and serve stale. A
four-minute backlog is worse than no answer and keeps the account under load.

Two correctness details:
- **Check for a session before entering the queue.** An unconnected provider must
  not consume the daily budget or a queue slot.
- Providers with `requiresSession === false` skip that check entirely.

### 5.4 Streaming — SSE, not per-provider Suspense

Fares take 10–30 s and some arrive instantly from cache. Server-render whatever is
already cached (a pure DB read, zero provider contact), then upgrade over SSE.

```
event: meta      {"straightLineKm":5.11,"routeKey":"…"}
event: provider  {"provider":"uber","state":"cached","ageSec":45,"options":[…]}
event: provider  {"provider":"ola","state":"fetching"}
event: provider  {"provider":"uber","state":"fresh","options":[…]}
event: provider  {"provider":"rapido","state":"stale","ageSec":900,
                  "reason":"Session expired","needsLogin":true,"options":[…]}
event: done      {"elapsedMs":18300}
```

States: `queued | fetching | cached | fresh | stale | unavailable`.

**Enforce monotonicity in the client:** a row that already has prices must never
regress to an error. Key rows by provider and only downgrade when the incoming
event carries data.

Why not React `<Suspense>` per provider: it holds the response open 30 s+, gives
exactly one state transition (so no "queued, 3rd in line"), **cannot push a later
update** — which kills the stale-then-refresh flow the cache produces — and has no
reconnection story.

Implementation notes:
- Put orchestration in an **async generator** so the protocol is testable without
  HTTP.
- Do **not** `await` the producer inside `ReadableStream.start()`; that defers the
  first flush and silently defeats streaming. Fire it and let it run.
- Headers: `text/event-stream`, `Cache-Control: no-cache, no-transform`,
  `X-Accel-Buffering: no`. Send a heartbeat comment every 15 s.
- Tear down on `request.signal.abort` so abandoned tabs don't hold queue slots.
- Behind nginx set `proxy_buffering off`. Do not put SSE paths behind
  orange-cloud Cloudflare.

---

## 6. The admin connection system

### 6.1 Session storage

One encrypted row per provider:

```sql
CREATE TABLE provider_session (
  provider     TEXT PRIMARY KEY,
  iv BLOB NOT NULL, tag BLOB NOT NULL, ciphertext BLOB NOT NULL,
  captured_at  INTEGER NOT NULL,
  refreshed_at INTEGER,
  last_ok_at   INTEGER,
  last_fail_at INTEGER,
  status       TEXT NOT NULL DEFAULT 'disconnected',  -- connected|degraded|expired|disconnected
  fail_streak  INTEGER NOT NULL DEFAULT 0
);
```

AES-256-GCM, **with the provider name as additional authenticated data** so a
blob cannot be moved between providers. Plaintext is
`{ storageState, authHeaders, deviceProfileId }`.

These are third-party account credentials — functionally passwords. Encryption
protects against an exfiltrated database file, not against shell access.

### 6.2 Session write-back — easy to miss, costly

Hydrating from stored cookies and never writing back discards every rolling
refresh cookie the provider issues, shortening session life for no reason. After
a successful fetch, re-read `storageState()` and re-seal, debounced to ~1/minute.

**A request context and a browser context do not share a cookie jar.** Uber (page
path) and Ola (HTTP path) will drift apart unless both write back through the
same store.

### 6.3 Expiry state machine

`connected` → auth failure → `fail_streak++`. At `fail_streak >= 2` → `expired`:
open the breaker, raise the admin banner, serve cache-only marked stale. **One
transient 401 is not enough** to tear down a working login.

Providers with `requiresSession === false` report a distinct `open` status — they
have nothing to connect and must never appear in "needs attention".

### 6.4 Health probing

There is **no cheap probe for Uber**: `Products` over a bare HTTP client returns
`unauthorized` even with a valid session, so it cannot distinguish "dead" from
"not a page". Using it as a probe produces constant false alarms.

| Provider | Cheap probe | Dead signal |
|---|---|---|
| Ola | `GET /pwa-api/profile` | `601 NOT_LOGGED_IN` |
| Rapido | n/a (anonymous) | — |
| Uber | none — must do a real fetch | `targetProductType":"ANONYMOUS"` in `fares[0].meta` |

**Make probes pay for themselves:** run each as a real fare fetch on a rotating
popular canary route and write the result into the cache. It validates the
session *and* the parser *and* pre-warms.

**Passive health first.** Organic fetches update `last_ok_at`/`fail_streak`;
active probes only fire when a provider has had no auth signal for ~10 minutes.
Under real traffic they almost never run.

Scheduling needs three guards, each catching a different failure: a Node-runtime
check, a `globalThis` boot flag (hot reload re-evaluates modules), and a DB
advisory lock (multi-process deploys). Use a **self-rescheduling `setTimeout`,
never `setInterval`** — a Uber probe takes 20 s and intervals will overlap. Add
±20 % jitter and run exactly one process.

### 6.5 Connect paths

Ship the **import path first** — it unblocks everything downstream and remains a
permanent fallback:

```
POST /api/admin/session/:provider/import   { storageState, authHeaders? }
```

Accept either a bare `storageState` or a wrapper. Validate that `cookies` is an
array. On success, invalidate cached contexts for that provider and write an
audit row.

Pair it with a small CLI helper the operator runs on their own machine: it
authenticates to the app, opens a headful browser with **the same device
profile**, waits for the operator to finish the OTP, then POSTs
`context.storageState()`.

Give the helper a password-based login endpoint so the operator never has to copy
a cookie out of devtools:

```
POST /api/admin/login  { password }  → sets the httpOnly admin cookie
```

Throttle it (5 attempts / 5 min) and compare against a scrypt hash — this one
password guards real Uber and Ola accounts.

**The known weakness of the import path:** the session is minted on a residential
IP and replayed from the server. That IP-family switch is exactly what fraud
systems watch. It is the main argument for §7.

### 6.6 Admin auth

- Signed httpOnly cookie (`jose`, HS256, 7 days).
- **The real boundary is a `verifySession()` call in a cached data-access layer**,
  invoked at the top of every admin page, every server action and every admin
  route handler.
- Edge middleware does an *optimistic cookie-presence check only* — no crypto, no
  DB. It runs on prefetches, and server actions bypass its matcher entirely.
- **Never authorize in a layout.** Layouts do not gate whether child segments
  render.
- **Keep the login page outside the authenticated layout group.** If it inherits
  a layout whose auth check redirects to the login page, you get an infinite
  redirect loop. Use a route group so the protected pages share chrome and the
  login page does not.

---

## 7. In-browser remote login (to build)

**Goal:** the operator completes an OTP + reCAPTCHA login in a browser that lives
on the server, driven from their own browser — so the session is minted and used
from the same IP.

### 7.1 Approach: CDP screencast + input relay

Frames down over SSE, input up over POST. Do not add a WebSocket server just for
this.

```
POST /api/admin/session/:provider/start   → mint remote token, launch browser
GET  /api/admin/session/:provider/stream  → SSE, data: <base64 jpeg>
POST /api/admin/session/:provider/input   → {type:'click'|'wheel'|'text'|'key', …}
POST /api/admin/session/:provider/save    → capture storageState, tear down
POST /api/admin/session/:provider/stop
```

An OTP form needs a handful of clicks and ~16 keystrokes, so one HTTP round trip
per event is imperceptible. **Never stream `mousemove`** — it would be the only
chatty event and hover states are irrelevant here.

### 7.2 Mechanics

```ts
const cdp = await ctx.newCDPSession(page)
cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
  push(data)                                   // fan out to SSE subscribers
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast',
  { format: 'jpeg', quality: 60, maxWidth: 420, maxHeight: 880, everyNthFrame: 2 })
```

**Eliminate coordinate math:** fix the viewport to 420×880, cap the screencast at
the same size, and render the frame at exactly 420×880 CSS pixels. Client
`offsetX/offsetY` then map 1:1 — no `pageScaleFactor` or scroll reconciliation.

**Use CDP only for frames; use the automation API for input.** `page.mouse.click`
and `page.keyboard.insertText` handle focus, IME and composition properly, and
`insertText` makes OTP paste trivial.

```ts
switch (e.type) {
  case 'click': await page.mouse.click(e.x, e.y, { button: e.button ?? 'left' }); break
  case 'wheel': await page.mouse.wheel(e.dx, e.dy); break
  case 'text':  await page.keyboard.insertText(e.text); break
  case 'key':   await page.keyboard.press(e.key); break
}
```

**Run headful under a persistent Xvfb**, not headless — headless is markedly more
detectable, and Ola's login carries reCAPTCHA v3 (score-based, so a bot-like
score silently fails) plus Akamai, while Uber sets Cloudflare's `__cf_bm`. Run
`Xvfb :99` as its own long-lived service with `DISPLAY=:99` in the app
environment, so the display survives app restarts and you can attach `x11vnc`
ad hoc to debug with your own eyes.

Bandwidth: 420×880 JPEG q60 is ~15–40 KB/frame, +33 % for base64, at every 2nd
frame. Screencast is change-driven, so an idle form emits almost nothing; peak
while typing ≈ 200 KB/s.

### 7.3 Security — this is an interactive browser on a public box

1. **A separate ephemeral remote token**, 32 random bytes, bound to the admin
   session, 15 min absolute / 5 min idle TTL, required on `/stream` and `/input`.
   The admin cookie gates `/start` only.
2. **Hard navigation allowlist** — abort any navigation whose hostname is not in
   the provider's allowlist. Nobody drives your server's browser to their page.
3. **Kill on save**, and hard-kill at 10 minutes regardless.
4. Cancel all downloads, use a scratch profile directory, run as an unprivileged
   OS user.
5. Rate-limit `/input` (~50 events/s) and audit every start/save/navigate.

**Rejected alternative:** `chromium.launchServer()` + `connect()` from the
operator's laptop. The browser still runs on the server (no window opens
locally), and the exposed endpoint grants `Runtime.evaluate` and `file://`
navigation — arbitrary local file read. Do not use it.

noVNC has an identical detection profile to screencast-under-Xvfb but adds three
daemons, a second port and a second auth boundary. Keep `x11vnc` as an operator
debug tool, not the product path.

---

## 8. The payload control system

These are undocumented APIs that change without notice. The payload console is
what makes a breakage a five-minute fix instead of a re-investigation.

### 8.1 Baseline

```sql
CREATE TABLE raw_payload (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  route_key TEXT,
  status TEXT,
  parsed_count INTEGER,
  parse_error TEXT,
  body TEXT NOT NULL
);
```

Record **every** response — success and failure — as a capped ring buffer
(~40/provider), trimmed on insert:

```sql
DELETE FROM raw_payload WHERE provider = ? AND id NOT IN (
  SELECT id FROM raw_payload WHERE provider = ? ORDER BY captured_at DESC LIMIT ?)
```

**Recording must never break a fare request** — wrap the whole thing in a
try/catch that swallows.

### 8.2 Schema-less path discovery

The reason parsers can be fixed quickly: walk any payload and surface every
plausible fare-bearing leaf with its JSON path.

```ts
// numeric leaves in [10, 100000]  +  strings matching /₹\s?[\d,]+|(?:INR|Rs\.?)\s?[\d,]+/
discoverFareCandidates(payload) → [{ path, value, kind }]
summarisePaths(candidates)      → [{ shape, count, sample }]
// shape collapses array indices: data.services[3].fare → data.services[].fare
```

Ranking by `count` puts the repeated per-ride field at the top, which is almost
always the fare. This is what turns "find the price field" into seconds.

### 8.3 Enhancements to build

**Filters** — as querystring params so views are shareable and server-filterable:
- provider (multi-select)
- outcome: `all | parsed | failed` (`parse_error IS NULL`)
- HTTP status
- time range (last hour / 24 h / 7 days / custom)
- route key, and a "only this route" affordance from any row
- `parsed_count = 0` — succeeded structurally but produced nothing, the most
  interesting failure class

Index `(provider, captured_at DESC)`; add `(provider, parse_error)` if the
failed-only filter gets slow.

**Search**
- *Key/value search across payloads:* accept a JSON path fragment (`categories.*.price`)
  or a plain substring, and show matching paths with values, not just the row.
- *Full-text over bodies:* SQLite FTS5 external-content table over `body`, kept in
  sync by triggers. Falls back to `LIKE` at this row count, but FTS makes
  "which payload mentioned `surge`" instant.
- *Saved searches* pinned per provider for the checks you repeat.

**Raw outlook** — three tabs over the same record:
1. **Pretty** — collapsible JSON tree, path breadcrumb, click-to-copy path,
   search-within-document with match highlighting and next/prev.
2. **Raw** — unformatted body, byte size, content-type, copy and download.
   Essential for non-JSON: Rapido's protobuf-as-byte-array, HTML error pages,
   truncated bodies.
3. **Normalized** — the `FareOption[]` the parser produced from *this* payload,
   rendered side by side with the raw. Recompute on demand by calling the pure
   normalizer, so you can see the effect of a parser change against historical
   payloads without refetching.

Add a **decoder chain** so non-JSON bodies are legible: detect
`^\[\d+(,\d+)*\]$` → byte array → protobuf → schema-less wire-format tree.

**Per-ride search view** — the highest-value addition. Pivot from
"payloads" to "rides": explode every payload into its ride rows and make *those*
searchable.

```sql
CREATE TABLE ride_observation (
  id INTEGER PRIMARY KEY,
  payload_id INTEGER NOT NULL REFERENCES raw_payload(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  route_key TEXT,
  ride_name TEXT NOT NULL,      -- "Uber Go AC", "Mini", "Bike Direct"
  category TEXT,
  price REAL NOT NULL,
  price_low REAL, price_high REAL,   -- Rapido ranges
  eta_min INTEGER,
  currency TEXT NOT NULL DEFAULT 'INR'
);
CREATE INDEX idx_ride_lookup ON ride_observation(provider, ride_name, observed_at DESC);
CREATE INDEX idx_ride_route  ON ride_observation(route_key, observed_at DESC);
```

Write these rows in the same transaction as the payload. That unlocks:
- **"Show me every Auto fare on this route"** across all three providers over time
- **Price history sparklines** per ride type — surge becomes visible
- **Cross-provider comparison at a timestamp** — what each platform quoted for the
  same route within the same minute
- **Anomaly flags** — a fare that moved >3σ from that ride's trailing median, or a
  ride type that vanished from a provider's catalogue
- **Parser-regression detection** — `parsed_count` dropping to 0 for a provider
  that previously returned rides is the earliest possible warning that an API
  changed

**Further enhancements**
- **Replay** — re-run the current parser against any stored payload and diff old
  vs new output. Makes parser changes verifiable against real historical data.
- **Promote to fixture** — one click writes a payload into the test fixtures
  directory with a generated test skeleton. This is how a production break
  becomes a regression test.
- **Diff two payloads** — same provider, same route, different times; structural
  diff highlights an added/renamed/removed field, which is usually the exact
  cause of a parser failure.
- **Retention policy** — the ring buffer is per provider and blunt. Consider
  keeping all failures, sampling successes, and ageing out ride observations more
  slowly than payload bodies (the rows are small, the bodies are not).
- **Redaction** — payloads can carry account identifiers. Strip or mask known
  personal fields before storage if the console is visible to more than one
  operator.

---

## 9. Failure modes and workarounds

| Symptom | Cause | Fix |
|---|---|---|
| Uber `unauthorized` with a valid session | Called GraphQL from an HTTP client | Trigger it from the PWA page and intercept |
| Uber returns products, all prices blank | Anonymous session | Detect `targetProductType":"ANONYMOUS"`; do not treat blank as 0 |
| Uber prices blank *despite* login | Captured the first of two `Products` responses | Prefer a response where some `fareAmountE5` is a number |
| Cheapest ride is a "Parcel" option | Uber returns delivery products | Filter parcel/courier/delivery |
| Ola `IDENTITY_MISSING` when logged in | Wrong endpoint (`web-api/products`) | Use `data-api/category-fare/p2p` |
| Ola shows "-1 min" | `eta.value === -1` means unknown | Map negative to null |
| Rapido `401` on every pricing path | Only probed authenticated `/pricing/*` | Use the public SEO fare page |
| Rapido `INVALID_SIGNATURE` | Called `scc/fareEstimate` directly | Let the page sign its own request |
| Rapido `401` after rewriting coordinates | Signature covers the body | Drive by URL, not by patched body |
| Rapido scrape returns empty | Scraped before the fare call resolved | `waitForSelector` on the card selector |
| Session dies far sooner than expected | Rolling refresh cookies discarded | Write `storageState` back after successful fetches |
| Sessions behave differently per provider | Request and browser contexts have separate cookie jars | Write back through one store |
| Provider bans / challenges appear | Burst request pattern | Serial execution + 8 s gap + breaker |
| Daily budget drains with no network calls | Unconnected provider still entering the queue | Check for a session before enqueueing |
| Admin login redirect loop | Login page inherits the authenticated layout | Move protected pages into a route group |
| SSE stalls behind a proxy | Response buffering | `X-Accel-Buffering: no`, `proxy_buffering off`, no orange-cloud CDN |
| Screencast freezes when unfocused | Chromium backgrounding | The three `--disable-*backgrounding*` launch args |

---

## 10. Build order

Each phase is independently verifiable. Build the fallback connect path early so
nothing downstream waits on the screencast.

| Phase | Scope | How to verify |
|---|---|---|
| 0 | Geocoding + search UI | Type "Indiranagar" → real suggestions → coordinates. No session dependency. |
| 1 | Admin auth, DB, crypto, session import, CLI helper | Import a captured `storageState`; sealed and unsealed byte-identical |
| 2 | Browser pool, device profile, Uber adapter + normalizer | Offline: normalizer vs an anonymous fixture raises "no session". Live: 36 products / 3 tiers, blank fares — **whole pipeline proven before any login** |
| 3 | Rapido adapter | Works immediately, no login. Verify in ≥2 cities |
| 4 | Cache, single-flight, queue, SSE, results UI | 10 concurrent same-route requests → call counter reads **exactly 1**; calls ≥8 s apart; breaker opens after 3 auth failures |
| 5 | Ola adapter (after first login) | Compare against the Ola app on a phone, same route, same minute |
| 6 | Payload console + ride observations | Force a parser failure; confirm the row, the candidate paths and the ride history |
| 7 | Remote login (screencast) | First against a neutral site — see, click, type. Then a real OTP login |
| 8 | Health probes, alerts, hardening | Delete a session cookie → status flips to expired, banner appears, public page still serves stale-marked prices |

**Testing strategy.** Normalizers are pure functions over JSON — test them against
captured fixtures with no browser and no login. That is the only way to get real
coverage of code paths that otherwise require a live session. Everything in §5
(cache banding, single-flight, queue brakes) is testable against a fake provider
that sleeps.

**Deployment.** The egress IP must be Indian — a foreign IP will likely break Ola
and Rapido outright and give Uber the wrong city. Run exactly one process (there
is a browser singleton and an embedded DB writer). If the host is ARM (common on
free tiers), Google ships no Chrome for linux-arm64, so use bundled Chromium and
make the channel an env var.

---

