# ByggKart — Energianalyse

A production-grade geospatial analytics frontend for Norwegian building energy data.  
Connects directly to a .NET backend (`/api/bygg`) and visualises ~8 000 buildings with  
three zoom-adaptive visualization modes.

---

## Quick start

```bash
npm install
npm run dev
```

Your .NET backend must be running on `http://localhost:5000`.  
The Vite dev server proxies all `/api` requests to it (configured in `vite.config.js`).

---

## Project structure

```
src/
├── components/
│   ├── MapView.jsx          # MapLibre GL JS map, all layers + interactions
│   ├── Sidebar.jsx          # Left panel shell
│   ├── SearchBar.jsx        # Nominatim geocoding search
│   ├── FilterPanel.jsx      # Year / energy / rating / category filters
│   ├── NearbySearch.jsx     # Radius search via /api/bygg/nearby
│   ├── BuildingPanel.jsx    # Slide-in building detail panel
│   ├── Legend.jsx           # Context-aware map legend
│   └── ZoomModeIndicator.jsx
├── hooks/
│   └── useBuildings.js      # React Query fetch + Nominatim geocode
├── store/
│   └── useMapStore.js       # Zustand global state
├── utils/
│   ├── layers.js            # All MapLibre layer / source definitions
│   └── geoUtils.js          # Circle GeoJSON, haversine, formatters
├── styles/
│   └── globals.css          # Design system (CSS variables + all styles)
├── App.jsx
└── main.jsx
```

---

## Architecture & data flow

```
Backend (/api/bygg/geojson?limit=8000)
    │
    ▼
useBuildings (React Query)       ← fetched once, cached for session
    │
    ▼
useMapStore.setAllFeatures()     ← stores raw features in Zustand
    │
    ▼
useMapStore.applyFilters()       ← CLIENT-SIDE filter over ~8000 features
    │                               (O(n), <1ms, runs on every filter change)
    ▼
filteredFeatures[]
    │
    ▼
MapView useEffect                ← calls map.getSource('buildings').setData()
    │                               MapLibre re-renders all layers instantly
    ▼
MapLibre GL JS (3 layers)
  ├── heatmap     (zoom 0–12)
  ├── clusters    (zoom 11–14)
  └── points      (zoom 14+)
```

**Why client-side filtering?**  
Filter state changes on every slider drag — potentially 30+ events/second.  
Network round-trips would make this laggy and hammer the server.  
8 000 features × linear scan = ~0.3ms in V8. The data fits in ~4MB RAM.

---

## How the heatmap achieves true area-based aggregation

MapLibre's heatmap uses **Gaussian Kernel Density Estimation (KDE)**.  
Each building emits a radial "blob" of energy that spreads outward over  
`heatmap-radius` pixels with a Gaussian falloff.

The value displayed at any pixel is the **sum of all overlapping kernels**,  
weighted by each building's `heatmap-weight`.

### Why this is area-averaged, not per-building:

1. **Clamped weight** — `energibruk_kwh_m2` is clamped to [0, 400].  
   A 1200 kWh/m² outlier gets the same weight as a 400 kWh/m² building.  
   No single building can create a misleading spike.

2. **Overlapping kernels** — at zoom 6, radius = 20px ≈ several city blocks.  
   A dense neighbourhood of high-energy buildings accumulates many overlapping  
   kernels → strong signal. A lone outlier → weak, localised blob.

3. **Natural area averaging** — the peak KDE value in a neighbourhood  
   reflects the weighted average energy of all buildings contributing to it,  
   not any individual outlier.

4. **Zoom-adaptive radius** — radius grows with zoom so the physical ground  
   area each kernel covers stays roughly constant (~400m), maintaining  
   spatial meaning at all zoom levels.

### Heatmap weight mapping:

| energibruk_kwh_m² | weight |
|---|---|
| 0   | 0.00 |
| 150 | 0.25 |
| 250 | 0.55 |
| 400 | 1.00 (hard cap) |

### Color ramp (low → high energy usage):

| density | color |
|---|---|
| 0.0  | transparent |
| 0.15 | green  (`rgba(34,197,94,0.5)`) |
| 0.35 | amber  (`rgba(253,224,71,0.75)`) |
| 0.55 | orange (`rgba(251,146,60,0.88)`) |
| 0.75 | red    (`rgba(239,68,68,0.95)`) |
| 1.0  | deep red (`rgba(185,28,28,1)`) |

---

## Zoom thresholds

| Zoom     | Mode    | Layers active |
|----------|---------|---------------|
| 0 – 11   | Heatmap | `buildings-heatmap` |
| 11 – 14  | Cluster | `buildings-clusters` + `buildings-cluster-count` |
| 14+      | Points  | `buildings-point` + `buildings-point-highlight` |

Heatmap fades out between zoom 11–12. Points fade in at zoom 13–14.  
This creates a smooth perceptual handoff with no jarring layer switches.

---

## Performance notes

- **Single fetch** — all 8 000 features loaded once on startup.
- **No re-renders on zoom** — zoom changes only update Zustand `zoomMode`;  
  MapLibre's own expression engine handles layer visibility natively.
- **rAF debounce on sliders** — `DualRange` uses `requestAnimationFrame`  
  to coalesce rapid slider drag events to one update per frame.
- **`source.setData()`** — direct MapLibre source update, skips React  
  reconciliation entirely. Only the GeoJSON data pointer changes.
- **Zustand slice selectors** — each component subscribes to only the  
  state slices it needs, preventing unnecessary re-renders.

---

## Dependencies

| Package | Purpose |
|---|---|
| `maplibre-gl` | Open-source map rendering (no API key) |
| `@tanstack/react-query` | Data fetching, caching |
| `zustand` | Lightweight global state |
| `react` / `react-dom` | UI framework |

Basemap: CartoDB Dark Matter (free, no API key required).  
Geocoding: OpenStreetMap Nominatim (free, Norway-scoped).
