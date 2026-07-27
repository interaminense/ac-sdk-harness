# ac-sdk-harness

Interactive, in-browser test harness for Liferay's Analytics Cloud client SDK
(`analytics-client-js`). Each page loads a real build of the SDK, stubs the
network so nothing leaves the browser, and shows — live — which analytics
events the SDK emits as you drive the page.

**Live:** https://interaminense.github.io/ac-sdk-harness/all-events.html

## Pages

| Page | Purpose |
| --- | --- |
| [`all-events.html`](all-events.html) | Smoke test for **all 28 triggerable events**. Click **Run all** and watch the checklist go green — views, impressions, clicks, downloads, submits, field focus/blur, scroll depth, read, and the lifecycle events (load, tab blur/focus, unload). |
| [`events-on-load.html`](events-on-load.html) | Verifies the view/impression events that fire as assets enter the viewport on page load. |
| [`reveal-scenarios.html`](reveal-scenarios.html) | Reproduces the CSS-visibility bug: an asset that is in the viewport but hidden by an **ancestor** (a closed menu, `opacity:0`, `visibility:hidden`) must emit its view event **only when it is actually revealed**, not on load. |

## How it works

- The SDK bundle (`analytics-all-min.js`) is vendored into this repo and loaded
  with a relative path, so the pages are fully self-contained.
- `window.fetch` and `navigator.sendBeacon` are stubbed, so the SDK queues
  events locally instead of sending them anywhere.
- The live checklist / log polls the SDK's own queue via `getEvents()`.
- Each page clears its `ac_*` `localStorage` keys on load so every run starts
  from a clean slate.

## Regenerating the SDK bundle

`analytics-all-min.js` is a build artifact of the `analytics-client-js` module
in `liferay-portal`. To refresh it, rebuild that module and copy
`build/analytics-all-min.js` over the copy in this repo.
