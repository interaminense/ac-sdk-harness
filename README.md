# ac-sdk-harness

Interactive, in-browser test harness for Liferay's Analytics Cloud client SDK
(`analytics-client-js`). Each page loads the live SDK from the dev CDN and shows
— live — which analytics events it emits as you drive the page. Events are
**real**: they are queued and flushed to the Analytics Cloud dev backend.

**Live:** https://interaminense.github.io/ac-sdk-harness/

## Pages

| Page | Purpose |
| --- | --- |
| [`index.html`](index.html) | Landing page linking every harness page. |
| [`all-events.html`](all-events.html) | Smoke test for **all 29 events**. Click **Run all** and watch the checklist go green — page view, asset views/impressions, clicks, downloads, submits, field focus/blur, scroll depth, read, and the lifecycle events (load, tab blur/focus, unload). |
| [`events-on-load.html`](events-on-load.html) | The view/impression events that fire as assets enter the viewport on load, across all six application types. |
| [`reveal-scenarios.html`](reveal-scenarios.html) | Every plugin's **view and impression** assets, each hidden by an **ancestor** (`opacity:0` / `visibility:hidden`, the mega-menu case) and revealed via a toggle. |
| [`flush.html`](flush.html) | `Analytics.flush()` (LPD-103258). Sends the queue on demand and times how long the Promise takes to settle, including against a deliberately stalled endpoint. |
| [`set-identity-fields.html`](set-identity-fields.html) | The optional `fields` array on `setIdentity()` (LPD-103257). Shows the exact `/identity` request body on the wire and probes the normalization and dedup rules that hang off it. |
| [`page-unloaded.html`](page-unloaded.html) | Which lifecycle event the build uses to report `pageUnloaded` (`unload` or `pagehide`), plus the back/forward cache cases the move to `pagehide` opens up. |

## How the SDK is loaded

Following the pattern liferay.com uses, a `<script>` points at the CDN root and
`Analytics.create(config)` runs once it loads. `pageViewed` has no plugin, so —
like the portal — each page sends it by hand after `create`.

```js
const SDK_URL = 'https://analytics-js-dev-cdn.liferay.com';
const CONFIG = {
	channelId: '831904237734003774',
	dataSourceId: '820802606605225785',
	endpointUrl: 'https://osbasahpublisher-ac-internal.lfr.cloud',
	projectId: 'asah59dbaa580b264c578bb15c878dd363f0',
};
```

Every page loads the SDK from `SDK_URL` — the currently deployed dev build.

### Driving a locally built SDK

`page-unloaded.html`, `set-identity-fields.html` and `flush.html` accept
`?sdk=<url>` so a build straight out of the module can be driven before it
reaches the CDN. `?sdk=local` resolves to
`./local/analytics-all-min.js`, which is gitignored:

```bash
# in liferay-portal
cd modules/apps/analytics/analytics-client-js
yarn build

# in this repo
cp <liferay-portal>/modules/apps/analytics/analytics-client-js/build/analytics-all-min.js local/
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/page-unloaded.html?sdk=local`. Serve the page
over `http` rather than opening the file directly, so the SDK and the page share
an origin and `localStorage` behaves.

## setIdentity fields and the dev CDN

`set-identity-fields.html` covers LPD-103257, which adds an optional generic
`fields: [{name, value}]` array to `setIdentity()` so a form submitter's
contact details can reach the Identity Service.

The page detects support rather than assuming it: it calls `setIdentity()` with
fields and checks whether the captured `/identity` body carries a `fields` key.
Against a build that predates the change the array is silently dropped, the page
says so, and the probes that depend on it are marked not applicable — only the
legacy probe stays meaningful. No repo change is needed once the CDN build
includes the fix.

Three behaviors are worth knowing when reading the probes:

- The fields go **inside** the hashed identity object, so they participate in
  the dedup guard. That is deliberate: leave them out and a resubmit with the
  same email but different data would be swallowed by the client and never reach
  the backend.
- They are sorted by `name` before hashing, because the SDK's `hash()` preserves
  array order — the same data in a different order would otherwise produce a
  different hash and a redundant request.
- `email` is optional. Omitting it sends an empty `emailAddressHashed`, which
  the backend treats as anonymous. The integration script therefore has to send
  the email **both** top level (it becomes `emailAddressHashed`, the individual
  anchor) and inside `fields` as `emailAddress` (the hash is one way, so the
  plaintext is what populates the Individual's column).

## flush() and the sequential-queue ceiling

`flush.html` covers LPD-103258, which makes `Analytics.flush()` public: it sends
everything queued now instead of waiting for the flush loop, and returns a
Promise that settles once the in-flight requests settle.

The page sets a **10 minute** `flushInterval` on purpose. The loop then never
fires, so every request it captures can only have come from an explicit
`flush()` — otherwise the probes could not tell the two apart.

One thing the page measures is worth knowing before reading the numbers.
`QueueFlushService` walks its four queues **sequentially**, so
`REQUEST_TIMEOUT` (5000ms) bounds each queue rather than the flush as a whole.
Against a stalled endpoint a single queue settles at ~5s, but the
**Measure the ceiling** button — which puts items in more than one queue first —
reports multiples of that. Empty queues cost nothing, so the realistic
trial-form path (one identity message) is unaffected.

## The unload deprecation and the dev CDN

`page-unloaded.html` covers LPD-100223, which moves `pageUnloaded` off the
`unload` event Chrome is retiring and onto `pagehide`. The page reports whichever
listener the loaded build registered, so it stays useful on both sides of the
release: against today's dev CDN it reports `unload — build predates
LPD-100223`, and it flips to `pagehide — LPD-100223 is in this build` on its own
once the fix ships. No repo change is needed.

## The visibility fix and the dev CDN

`reveal-scenarios.html` exercises the ancestor-reveal visibility fix
(LPD-99067): a view should fire only when a CSS-hidden asset is actually
revealed. That fix is only meaningful once it is deployed to the dev CDN. Until
then, the deployed build fires the view/impression events on **load** (geometry
only); the page shows a banner saying so. Once the CDN build includes the fix,
the events fire only on reveal — no change to this repo is needed.

## How the live checklist works

- The checklist / log polls the SDK's own queue via `getEvents()`, and on
  `all-events.html` and `page-unloaded.html` also mirrors `send()` directly, so
  an event the flush loop drains between polls is still recorded.
- `set-identity-fields.html` shadows `fetch` instead, because what it asserts on
  is the request body rather than the queued event.
- Each page clears its `ac_*` `localStorage` keys on load, so every run starts
  from a clean slate.

See [`CLAUDE.md`](CLAUDE.md) for where the SDK source lives and how the events
map to plugins.
