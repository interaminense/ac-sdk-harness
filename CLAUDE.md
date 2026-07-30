# ac-sdk-harness — project guide

This repository is an interactive, in-browser **test harness** for Liferay's
Analytics Cloud client SDK (`analytics-client-js`). It is a set of static HTML
pages published to GitHub Pages; there is no build step. Each page loads the
live SDK, drives it, and shows which analytics events fire.

## What lives here

| File | Role |
| --- | --- |
| `index.html` | Landing page linking the harness pages. |
| `all-events.html` | Fires and verifies **all 29 events** (click "Run all"). |
| `events-on-load.html` | View/impression events that fire on page load. |
| `reveal-scenarios.html` | Every plugin's view/impression asset hidden by an ancestor, revealed via a toggle. |
| `page-unloaded.html` | Which lifecycle event reports `pageUnloaded`, plus the back/forward cache cases (LPD-100223). |
| `page-unloaded-away.html` | Navigation target for the round trip in `page-unloaded.html`; carries no SDK on purpose. |
| `style.css` | Shared styles for `events-on-load.html`. |
| `README.md` | Human-facing overview. |

There is **no vendored SDK bundle** in this repo. Every page loads the SDK from
the dev CDN at runtime. `page-unloaded.html` additionally accepts
`?sdk=<url>`, with `?sdk=local` resolving to `./local/analytics-all-min.js` —
a gitignored drop point for a bundle built out of the module.

## How the SDK is embedded

Mirrors the liferay.com embed: a `<script>` points at the CDN root, then
`Analytics.create(config)` runs on load. `pageViewed` has no plugin, so each
page sends it by hand after `create` (as the portal does).

```js
const SDK_URL = 'https://analytics-js-dev-cdn.liferay.com';
const CONFIG = {
	channelId: '831904237734003774',
	dataSourceId: '820802606605225785',
	endpointUrl: 'https://osbasahpublisher-ac-internal.lfr.cloud',
	projectId: 'asah59dbaa580b264c578bb15c878dd363f0',
};
// after the script loads:
window.__ac = Analytics.create(CONFIG);
window.__ac.send('pageViewed', 'Page', {externalReferenceCode: '...'});
```

Events are real — they are queued and flushed to `endpointUrl`. The live
checklist/log on each page polls the SDK's queue via `window.__ac.getEvents()`.
`all-events.html` and `page-unloaded.html` additionally mirror `send()` by
shadowing it on the instance, because polling alone loses whatever the flush
loop drains between ticks — usually the last event a run fires. When mirroring,
normalize the properties the way `track()` does (default to `{}`, strip
`assetType`) or the log's dedupe key will not match the polled one.
Each page clears its `ac_*` `localStorage` keys on load for a clean slate.

## Where the SDK source lives

The SDK is the `analytics-client-js` OSGi module in the `liferay-portal`
monorepo:

```
liferay-portal/modules/apps/analytics/analytics-client-js
```

Key source paths inside that module:

- `src/plugins/*.ts` — one plugin per asset/behavior type; each registers
  listeners and calls `analytics.send(EventId, ApplicationId, payload)`.
- `src/utils/trackVisibleElements.ts` — shared "fire once visible" helper
  (IntersectionObserver geometry + `Element.checkVisibility` CSS gating +
  ancestor-reveal listeners). This is where the LPD-99067 visibility fix lives.
- `src/utils/scroll.ts`, `src/utils/read.ts` — scroll-depth and read tracking.
- `src/types.ts` — the `EventId`, `ApplicationId`, and `ElementType` enums, and
  the `data-analytics-*` dataset keys assets must carry to be trackable.
- `test/**` — Jest + jsdom unit tests (`yarn test`).
- `build/analytics-all-min.js` — local esbuild bundle (gitignored; the CDN
  serves the deployed equivalent).

## Event catalog (event → emitting plugin)

| Event | Plugin (`src/plugins/…`) |
| --- | --- |
| `blogViewed`, `blogImpressionMade`, `blogClicked`, `blogDepthReached` | `blogs.ts` |
| `webContentViewed`, `webContentImpressionMade`, `webContentClicked` | `web-contents.ts` |
| `assetViewed`, `assetClicked`, `assetDownloaded`, `assetDepthReached`, `assetSubmitted` | `custom.ts` |
| `documentPreviewed`, `documentDownloaded` | `documents.ts` |
| `documentImpressionMade`, `documentDownloaded` | `documents-fragment.ts` |
| `formViewed`, `formSubmitted`, `fieldFocused`, `fieldBlurred` | `forms.ts` |
| `objectEntryViewed`, `objectEntryImpressionMade`, `objectEntryDownloaded` | `object-entry.ts` |
| `pageDepthReached` | `scrolling.ts` |
| `pageLoaded`, `pageUnloaded` | `timing.ts` (also `dxp.ts`) |
| `tabBlurred`, `tabFocused` | `visibility.ts` |
| `pageRead` | `read.ts` |
| `pageViewed` | none — sent manually by the portal / harness embed |

View and impression events (the ones `reveal-scenarios.html` targets):
`blogViewed`, `blogImpressionMade`, `webContentViewed`,
`webContentImpressionMade`, `assetViewed`, `documentPreviewed`,
`documentImpressionMade`, `formViewed`, `objectEntryViewed`,
`objectEntryImpressionMade`.

## The visibility fix and the dev CDN

LPD-99067 makes view/impression events fire only when a CSS-hidden asset is
actually visible, including when an ancestor (a closed menu, `opacity:0`,
`visibility:hidden`) later reveals it. Until that fix is deployed to the dev
CDN, the deployed build fires those events on **load** (geometry only), so
`reveal-scenarios.html` shows a banner to that effect. No repo change is needed
once the CDN build includes the fix.

## The unload deprecation and the dev CDN

LPD-100223 moves `pageUnloaded` off `unload` — the event Chrome is retiring —
and onto `pagehide`, and resets the view-duration mark and the visibility
plugin's tab-event flag on a persisted `pageshow`, since dropping the `unload`
listener is what lets a page reach the back/forward cache in the first place.

`page-unloaded.html` reports whichever listener the loaded build registered
rather than asserting one, so it is correct on both sides of the release: today
it reports `unload` against the dev CDN and `pagehide` against a local build,
and it flips on its own once the fix ships to the CDN. Nothing here needs
changing when that happens.

`all-events.html` is affected too, and less obviously: its `fireUnload()`
trigger dispatches **both** `pagehide` and `unload`, so the `pageUnloaded` row
goes green whichever event the loaded build listens for. Any page that drives a
lifecycle event by hand has to cover both while builds on either side of the fix
are still in circulation.

Two details worth keeping if the page is edited:

- It mirrors every `send()` into its own `localStorage` log by shadowing the
  instance method, instead of reading `getEvents()`. The SDK queue is drained by
  the flush loop and does not survive the navigation, so the departure event
  would be missed.
- Probe 3 falls back to a synthetic persisted `pageshow` when probe 2 did not
  produce a real back/forward cache restore, and labels which one it used. Many
  browsers — automation ones especially — will not restore, and without the
  fallback the probe would never produce a signal.

## Conventions for editing the harness pages

- Keep pages self-contained static HTML — no bundler, no external deps beyond
  the CDN SDK script.
- To add an asset, give it the `data-analytics-*` attributes its plugin
  requires (see `src/types.ts` in the SDK) and it will be tracked automatically.
- When adding an event to a checklist, use a `data-eid="<eventId>"` node so the
  shared polling loop marks it.
