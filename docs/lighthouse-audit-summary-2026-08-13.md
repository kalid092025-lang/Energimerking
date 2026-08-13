# Lighthouse Audit Summary - 2026-08-13

## Files

- Production Lighthouse HTML: `docs/lighthouse-production-preview-2026-08-13.report.report.html`
- Production Lighthouse JSON: `docs/lighthouse-production-preview-2026-08-13.report.report.json`
- Dev-server Lighthouse HTML: `docs/lighthouse-localhost-5173-2026-08-13.report.report.html`
- Dev-server Lighthouse JSON: `docs/lighthouse-localhost-5173-2026-08-13.report.report.json`

## Result

The original pasted Lighthouse report was invalid because Lighthouse hit `NO_FCP` and all 155 audits errored. A fresh official Lighthouse 13.2.0 run succeeded with no runtime error.

Primary baseline should be the production preview run, not the Vite dev-server run.

| Category | Production preview | Vite dev server |
| --- | ---: | ---: |
| Performance | 37 | 25 |
| Accessibility | 96 | 96 |
| Best Practices | 100 | 100 |
| SEO | 91 | 91 |

Production audit coverage:

| Status | Count |
| --- | ---: |
| Passed | 54 |
| Failed | 18 |
| Not applicable | 50 |
| Manual | 11 |
| Informative | 22 |
| Error | 0 |

## Production Metrics

| Metric | Value |
| --- | ---: |
| First Contentful Paint | 4.8 s |
| Largest Contentful Paint | 5.0 s |
| Speed Index | 6.0 s |
| Total Blocking Time | 22,390 ms |
| Time to Interactive | 30.7 s |
| Cumulative Layout Shift | 0.006 |
| Root document response time | 20 ms |
| Total network payload | 16,268 KiB |

## Failed Audits

| Area | Lighthouse finding | Evidence |
| --- | --- | --- |
| Performance | First Contentful Paint is slow | 4.8 s |
| Performance | Largest Contentful Paint is slow | 5.0 s |
| Performance | Speed Index is slow | 6.0 s |
| Performance | Total Blocking Time is very high | 22,390 ms |
| Performance | Time to Interactive is slow | 30.7 s |
| Performance | Main-thread work is excessive | 50.6 s total, mostly script evaluation |
| Performance | JavaScript bootup time is excessive | 37.0 s, mostly `assets/index-B_agDATL.js` |
| Performance | Network payload is too large | 16,268 KiB total |
| Performance | Unused JavaScript | 189 KiB estimated savings |
| Performance | Unused CSS | 17 KiB estimated savings |
| Performance | Render-blocking requests | Google Fonts CSS and main CSS, 1,360 ms estimated savings |
| Performance | Network dependency chain is long | App JS triggers large API data, map style, tiles, and map fonts |
| Performance | Forced reflow detected | Small attributed reflow plus unattributed reflow time |
| Best Practices | Missing source maps for large first-party JS | `assets/index-B_agDATL.js` |
| Accessibility | Low color contrast | Sidebar labels and muted controls around `#77728c` on light backgrounds |
| Accessibility | Visible label does not match accessible name | Radius button shows `RADIUS Off`, but `aria-label` omits that visible text |
| SEO | `robots.txt` is invalid | `/robots.txt` falls through to app HTML |

## Main Causes

1. The app loads too much data on startup. The initial API call to `/api/bygg/GetNearbyDeNormGeoJson?...amount=20000...` transfers about 14.8 MB by itself.
2. The first JavaScript bundle is large and expensive. Production serves one main JS file at about 528 KiB transferred and 1.95 MB uncompressed, with about 37 s of CPU bootup time under Lighthouse throttling.
3. The map stack is on the initial critical path. App JS immediately initializes MapLibre, fetches remote Carto styles, vector tiles, and map fonts.
4. Some visual design tokens are just under WCAG contrast thresholds.
5. SEO is mostly healthy, but `/robots.txt` needs a real static file.

## Recommended Fix Order

1. Reduce initial data volume. Load a smaller first viewport dataset, use tile or bounds-based loading by default, paginate or cap `amount`, and defer non-visible statistics until after first paint.
2. Split the map path. Lazy-load `MapView`, MapLibre, and heavy map utilities behind a visible shell or skeleton so the sidebar/search UI can paint immediately.
3. Move expensive data normalization/filtering off the first render path. Memoize carefully, pre-aggregate where possible, or process large GeoJSON in a worker.
4. Fix render blocking. Self-host or defer Google Fonts, keep `font-display=swap`, and consider inlining only minimal critical CSS for the app shell.
5. Fix accessibility issues. Darken muted sidebar text and update the Radius button accessible name so it includes the visible `Radius` and state text.
6. Add `Frontend/public/robots.txt` with valid directives.
7. Decide whether production source maps should be emitted. If yes, enable build sourcemaps for deployed builds. If not, accept this audit as an intentional tradeoff.

## Passed Highlights

- No browser console errors were logged.
- Best Practices scored 100.
- CLS is good at 0.006.
- The root document response time is short.
- The page has a title, viewport meta tag, meta description, valid language, and crawlable content checks mostly pass.

## Notes

- The Vite dev-server audit is useful only for development diagnostics. It includes dev-only files such as `@vite/client`, React Refresh, and unminified dependency chunks, so it exaggerates JavaScript and minification issues.
- The production preview audit is the correct baseline for fixes.
