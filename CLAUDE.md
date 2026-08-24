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
| `flush-away.html` | Navigation target for `flush.html`'s round trips; carries no SDK on purpose. |
| `marketo-form.html` | The Marketo integration script (LPD-103259) against a stand-in for the liferay.com demo form. |
| `marketo-integration.js` | Committed copy of the script published on the Confluence guide, so the harness has something to load. |
| `flush.html` | `Analytics.flush()` and the request-timeout behavior around it (LPD-103258). |
| `set-identity-fields.html` | The optional `fields` array on `setIdentity()` and the identity dedup that hangs off it (LPD-103257). |
| `page-unloaded.html` | Which lifecycle event reports `pageUnloaded`, plus the back/forward cache cases (LPD-100223). |
| `page-unloaded-away.html` | Navigation target for the round trip in `page-unloaded.html`; carries no SDK on purpose. |
| `style.css` | Shared styles for `events-on-load.html`. |
| `README.md` | Human-facing overview. |

There is **no vendored SDK bundle** in this repo. Every page loads the SDK from
the dev CDN at runtime. **Every** page accepts `?sdk=<url>`, with `?sdk=local` resolving to
`./local/analytics-all-min.js` — a gitignored drop point for a bundle built out
of the module. Keep it that way: a page that hardcodes the CDN cannot be used to
regression-test an unreleased build, which is most of what these pages are for.

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

**Probes that claim "one queue" or "nothing queued" must call `resetQueues()`
first.** This is not tidiness — it is the difference between measuring the SDK
and measuring the tester. `visibility.ts` fires `tabBlurred` on any tab switch,
which lands an event in the events queue; probe 5 also leaves its stalled item
behind. Either one gives the timeout probe a second queue to walk, and since the
queues are sequential it then settles at ~2 × `REQUEST_TIMEOUT` and reports a
failure that is really the SDK working as designed. This was a real bug in the
page: it passed in automation, where the tab never loses focus, and failed for a
human who switched tabs mid-run. The timeout probe now resets first, asserts on
the queue count as well as the elapsed time, and names the occupied queues in
its detail so the next anomaly diagnoses itself.

**The two integration modes.** The **Integration modes** section drives the two
ways the LPD-103259 script can be wired, each through a real navigation to
`flush-away.html` (no SDK there on purpose):

- *Leave without flushing* queues an identity and navigates immediately. The
  claim under test is that the queue survives in `localStorage` and the SDK
  sends it on its own once a page loads again. Measured: sent ~2.2s after the
  return, which is one flush interval.
- *Flush before leaving* waits on `flush()` first, so the request is already
  gone and the queue is empty on departure — the option to use when the submit
  sends the visitor off the origin, where no later page load would drain it.

Three things make that section work, and each breaks it silently if changed:

- A `harness_flush_trip` marker in `localStorage` is set before leaving. Its
  presence suppresses the `ac_*` wipe on load — the queue is the thing under
  test — and switches `flushInterval` from 600000 to 2000, because option 1 is
  precisely the claim that the SDK's own loop sends the message.
- The return leg goes through `location.href`, not `history.back()`. Going back
  can be served from the back/forward cache, which restores the page instead of
  loading it, and a fresh load is the whole point.
- `tripAwayURL()` carries the current query string into the return URL. Without
  it a run driving a local build with `?sdk=` comes back on the CDN and reports
  a failure that is really a lost parameter.

Returning from a trip disables the probes button: the live interval would make
the "nothing sent while queued" probe meaningless. Reset reloads clean.

**The sequential-queue ceiling.** `QueueFlushService` reduces over its four
queues with `previousPromise.then(...)`, so `REQUEST_TIMEOUT` bounds each queue,
not the flush. The **Measure the ceiling** button demonstrates it: with items in
more than one queue and the endpoint stalled, `flush()` settles at a multiple of
5s. This is a real gap against the parent story's NFR, which reads as though the
bound were global. Closing it would mean adding a timeout mechanism, which
LPD-103258 explicitly rules out, so the page measures it rather than asserting
on it.

## The Marketo integration script

The script itself is **committed** at `marketo-integration.js`, not dropped into
`local/`. That directory is gitignored, which is fine for the SDK bundle because
`?sdk=` falls back to the CDN — but the integration script has no CDN to fall
back to, so a gitignored copy 404s on GitHub Pages and the page loads broken.

It is a verbatim copy of the code block on
[the Confluence guide](https://liferay.atlassian.net/wiki/spaces/ENGAC/pages/5290819624).
The page is the source of truth; edit it there first, then re-copy. The file
carries a header saying so.

`marketo-form.html` drives the LPD-103259 script. Two things about it are
deliberate:

- It loads the script with a **plain `<script>` tag**, after the client, which
  is how a site owner would. The script carries no `export` statement for that
  reason — a module cannot be loaded that way — and reaches the page through a
  `window.trackMarketoForm` assignment.
- The stand-in form submits the **real** value set of Marketo form 1086, hidden
  campaign fields (`Last_Campaign__c`, `Last_Source__c`, …) and `Phone`
  included. The mapping probe asserts on the count precisely so that dropping
  the unmapped ones is proven rather than assumed: 5 fields out of 13 submitted
  values.

Navigation is intercepted rather than performed, which is what lets the page
report *when* the redirect would have happened relative to the request. That
ordering is the point of the whole script, so it is asserted on directly rather
than inferred from a screenshot.

**The four scenarios.** Two of them vary where the submit sends the visitor
(same origin, or off to `liferay.com` — a genuinely different origin where the
queue can never be drained), and two vary who the visitor already is (never
identified, or signed in first under another address). The known-visitor one is
the interesting one: it asserts the `userId` **rotates**, which is what keeps
two different people from being merged onto one Individual.

The off-site scenario runs in an **embedded copy of the page** (`?frame=1`).
The embedded copy is the browsing context that leaves for another origin, so the
outer one survives and shows the result immediately. Do not "simplify" this back
into a top-level navigation: the visitor would have to press Back, and a browser
that restores the page from the back/forward cache never re-runs the script, so
the report silently never appears. That is exactly how it was reported broken.

Each scenario clears the four queue keys before submitting. `create()` queues an
anonymous identity of its own at load, and the known-visitor setup queues
another; without the reset the flush sends them alongside the form's and the
report describes whichever fetch happened to land last. That was a real bug
here — the first run reported an empty `fields` array and the SDK was innocent.

The script URL comes from `?script=`, defaulting to
`./local/liferay-analytics-marketo.js` — the same gitignored drop point pattern
as the SDK bundle.

## Conventions for editing the harness pages

- Keep pages self-contained static HTML — no bundler, no external deps beyond
  the CDN SDK script.
- To add an asset, give it the `data-analytics-*` attributes its plugin
  requires (see `src/types.ts` in the SDK) and it will be tracked automatically.
- When adding an event to a checklist, use a `data-eid="<eventId>"` node so the
  shared polling loop marks it.
