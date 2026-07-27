# ac-sdk-harness

Interactive, in-browser test harness for Liferay's Analytics Cloud client SDK
(`analytics-client-js`). Each page loads a real build of the SDK and shows —
live — which analytics events the SDK emits as you drive the page. Events are
**real**: they are queued and flushed to the Analytics Cloud dev backend.

**Live:** https://interaminense.github.io/ac-sdk-harness/

## Pages

| Page | Purpose |
| --- | --- |
| [`index.html`](index.html) | Landing page linking every harness page. |
| [`all-events.html`](all-events.html) | Smoke test for **all 29 events**. Click **Run all** and watch the checklist go green — page view, asset views/impressions, clicks, downloads, submits, field focus/blur, scroll depth, read, and the lifecycle events (load, tab blur/focus, unload). |
| [`events-on-load.html`](events-on-load.html) | The view/impression events that fire as assets enter the viewport on load, across all six application types. |
| [`reveal-scenarios.html`](reveal-scenarios.html) | Reproduces the CSS-visibility fix: an asset in the viewport but hidden by an **ancestor** (a closed menu, `opacity:0`, `visibility:hidden`) must emit its view **only when actually revealed**. |

## How the SDK is loaded

Following the pattern liferay.com uses, a `<script>` points at the CDN root and
`Analytics.create(config)` runs once it loads. `pageViewed` has no plugin, so —
like the portal — each page sends it by hand after `create`.

```js
const SDK_URL = 'https://analytics-js-dev-cdn.liferay.com';
const CONFIG = {
	channelId: '825006858418062047',
	dataSourceId: '820802606605225785',
	endpointUrl: 'https://osbasahpublisher-ac-internal.lfr.cloud',
	projectId: 'asah59dbaa580b264c578bb15c878dd363f0',
};
```

`all-events.html` and `events-on-load.html` load the SDK from `SDK_URL` (the
currently deployed dev build).

**`reveal-scenarios.html` is the exception:** it demonstrates the ancestor-reveal
visibility fix, which is not yet deployed to the dev CDN, so it loads the bundled
`analytics-all-min.js` (a local build that includes the fix) instead of `SDK_URL`.
Once the fix ships to the CDN, that page can load `SDK_URL` like the others and
`analytics-all-min.js` can be removed.

## How the live checklist works

- The checklist / log polls the SDK's own queue via `getEvents()`.
- Each page clears its `ac_*` `localStorage` keys on load, so every run starts
  from a clean slate.

## Regenerating the bundled build

`analytics-all-min.js` is a build artifact of the `analytics-client-js` module
in `liferay-portal`. To refresh it, rebuild that module and copy
`build/analytics-all-min.js` over the copy in this repo.
