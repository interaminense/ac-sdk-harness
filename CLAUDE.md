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
| `flush.html` | `Analytics.flush()` and the request-timeout behavior around it (LPD-103258). |
| `set-identity-fields.html` | The optional `fields` array on `setIdentity()` and the identity dedup that hangs off it (LPD-103257). |
| `page-unloaded.html` | Which lifecycle event reports `pageUnloaded`, plus the back/forward cache cases (LPD-100223). |
| `page-unloaded-away.html` | Navigation target for the round trip in `page-unloaded.html`; carries no SDK on purpose. |
| `style.css` | Shared styles for `events-on-load.html`. |
| `README.md` | Human-facing overview. |

There is **no vendored SDK bundle** in this repo. Every page loads the SDK from
the dev CDN at runtime. `page-unloaded.html`, `set-identity-fields.html` and
`flush.html` additionally accept `?sdk=<url>`, with `?sdk=local` resolving to
`./local/analytics-all-min.js` — a gitignored drop point for a bundle built out
of the module.

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

## setIdentity fields and the dev CDN

LPD-103257 adds an optional generic `fields: [{name, value}]` array to
`setIdentity()`, carried in the `/identity` payload alongside
`emailAddressHashed`.

`set-identity-fields.html` shadows `window.fetch` rather than polling
`getEvents()` — identity requests are not events, and the body is the thing
being asserted on. It detects support instead of assuming it (does the captured
body have a `fields` key?), so it is correct on both sides of the release: today
it reports "build has no fields support" against the dev CDN and goes green
against a local build, and it flips on its own once the fix ships.

Three SDK behaviors drive the probes, and all three are easy to get wrong when
editing the page:

- `fields` live **inside** the object that `_getIdentityHash` hashes, so they
  take part in the dedup guard in `_sendIdentity`. Probe 4 exists because
  leaving them out would silently swallow a resubmit.
- `_getNormalizedFields` sorts by `name` before hashing, since the SDK's
  `hash()` sorts object keys but preserves array order. Probe 3 asserts that
  reordering is a no-op on the wire.
- `email` is optional and, when omitted, `emailAddressHashed` goes out as `''`.
  Probe 5 pins that down, because it is the case the backend has to treat as
  anonymous.

**Clear requests** empties the captured log only; it deliberately does not touch
`ac_*` `localStorage`, so the SDK keeps the identity it already has and the dedup
guard still applies to the next call (**Reset SDK state** is the button that
wipes both, via a reload). It is disabled while the probes run: they track the
log by index, so clearing it mid-run would make `waitForRequests` miss every
request that follows and report failures that are really bookkeeping. `setBusy`
owns both buttons for that reason — do not re-enable them separately.

The legacy probe clears `ac_client_identity` before it runs. On a build without
fields support the first probe already put that exact body on the wire, so the
dedup guard would swallow the legacy call and the probe would report a failure
that is really the SDK working as designed.

Probes that assert **nothing** was sent have to outwait the identity queue,
which flushes every 2s — hence `WAIT_MS = 3 * FLUSH_INTERVAL` and a full run
taking about half a minute. Shortening that wait turns those probes into false
passes.

## flush() and the dev CDN

LPD-103258 makes `Analytics.flush()` public. `flush.html` detects it rather than
assuming it (`typeof __ac.flush === 'function'`), so it is correct on both sides
of the release.

Three things about the page are load-bearing:

- It sets `flushInterval` to **600000**. With the default interval the flush
  loop would send the queued messages on its own and no probe could attribute a
  request to `flush()`. Lower it and several probes become meaningless rather
  than failing, which is worse.
- It shadows `fetch` for two reasons: to log what left the page, and so a
  `stalling` flag can hang the endpoint. Hanging the endpoint from the harness
  is what lets the request-timeout path be observed without touching the SDK.
- `queueIdentity()` uses a fresh `Date.now()` email every call. Reusing one
  would produce the same identity hash, the SDK would deduplicate it, and the
  probe would measure an empty flush while looking like it measured a real one.

**The sequential-queue ceiling.** `QueueFlushService` reduces over its four
queues with `previousPromise.then(...)`, so `REQUEST_TIMEOUT` bounds each queue,
not the flush. The **Measure the ceiling** button demonstrates it: with items in
more than one queue and the endpoint stalled, `flush()` settles at a multiple of
5s. This is a real gap against the parent story's NFR, which reads as though the
bound were global. Closing it would mean adding a timeout mechanism, which
LPD-103258 explicitly rules out, so the page measures it rather than asserting
on it.

## Conventions for editing the harness pages

- Keep pages self-contained static HTML — no bundler, no external deps beyond
  the CDN SDK script.
- To add an asset, give it the `data-analytics-*` attributes its plugin
  requires (see `src/types.ts` in the SDK) and it will be tracked automatically.
- When adding an event to a checklist, use a `data-eid="<eventId>"` node so the
  shared polling loop marks it.
