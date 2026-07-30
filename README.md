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

`page-unloaded.html` accepts `?sdk=<url>` so a build straight out of the module
can be driven before it reaches the CDN. `?sdk=local` resolves to
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

- The checklist / log polls the SDK's own queue via `getEvents()`.
- Each page clears its `ac_*` `localStorage` keys on load, so every run starts
  from a clean slate.

See [`CLAUDE.md`](CLAUDE.md) for where the SDK source lives and how the events
map to plugins.
