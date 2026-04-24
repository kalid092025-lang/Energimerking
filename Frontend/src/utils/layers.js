/**
 * MapLibre GL JS layer configurations.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * HOW THE HEATMAP ACHIEVES TRUE AREA-BASED AGGREGATION
 * ═══════════════════════════════════════════════════════════════════════
 *
 * MapLibre's heatmap uses Gaussian Kernel Density Estimation (KDE).
 * Each point emits a "blob" of color that spreads outward with a
 * Gaussian falloff over `heatmap-radius` pixels.
 *
 * The resulting `heatmap-density` at any pixel is the sum of all
 * overlapping kernels, weighted by `heatmap-weight`.
 *
 * Why this represents aggregated area energy and NOT individual spikes:
 *
 *  1. CLAMPED WEIGHT — energibruk_kwh_m2 is clamped to [0, 400].
 *     An outlier building at 1200 kWh/m² gets the same weight as one
 *     at 400 kWh/m², preventing individual spikes from dominating.
 *
 *  2. OVERLAPPING KERNELS — at zoom 5-10, radius is 20-50px.
 *     A densely built neighbourhood of many high-energy buildings
 *     accumulates overlapping kernels → strong signal.
 *     A single outlier in the countryside → weak isolated blob.
 *
 *  3. AREA AVERAGING — where buildings cluster, the peak heatmap-density
 *     reflects the weighted average energy of the cluster, not any
 *     single building. This naturally surfaces neighbourhood-level
 *     patterns.
 *
 *  4. ZOOM-ADAPTIVE RADIUS — as you zoom in, radius shrinks, so the
 *     "area" each kernel covers stays roughly constant in ground
 *     distance, maintaining spatial meaning across scales.
 *
 * The result: high-energy neighbourhoods glow red; low-energy ones stay
 * green; isolated outliers produce only a faint local signal.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── Source configuration ────────────────────────────────────────────────────

/**
 * SOURCE_CONFIG defines a single GeoJSON source that drives all three
 * visualization layers (heatmap, clusters, points).
 *
 * Clustering is handled by MapLibre natively. When cluster=true:
 *  - Points within clusterRadius merge into cluster features
 *  - Cluster features carry `point_count` and aggregated properties
 *  - Filter ['has','point_count'] / ['!',['has','point_count']] splits them
 */
export const SOURCE_CONFIG = {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  cluster: true,
  clusterMaxZoom: 13,       // stop clustering at zoom 13
  clusterRadius: 45,        // cluster radius in pixels
  clusterProperties: {
    // Sum energy for clusters — divide by point_count in popup for avg
    total_energy: ['+', ['coalesce', ['get', 'energibruk_kwh_m2'], 0]],
  },
  generateId: true,
}

// ─── Heatmap layer (zoom 0 → 12) ─────────────────────────────────────────────

export const HEATMAP_LAYER = {
  id: 'buildings-heatmap',
  type: 'heatmap',
  source: 'heatmap-buildings',
  // Only use non-clustered points as kernel origins — clustered points
  // would produce incorrect weights since they represent many buildings.
  maxzoom: 18,
  paint: {
    /**
     * heatmap-weight: per-point contribution to the KDE.
     *
     * We interpolate linearly from energibruk_kwh_m2:
     *   0 kWh/m²  → weight 0   (unheated / unknown)
     *   150       → weight 0.25 (typical well-insulated modern)
     *   250       → weight 0.55 (average older building)
     *   400       → weight 1.0  (hard cap — prevents outlier spikes)
     *
     * Buildings above 400 kWh/m² are normalised to 1.0.
     * This ensures a single energy-inefficient outlier does not dominate
     * an entire neighbourhood's heatmap signal.
     */
    'heatmap-weight': [
      'interpolate', ['linear'],
      ['coalesce', ['get', 'heatmap_weight'], 0],
      0,   0,
      0.25, 0.25,
      0.55, 0.55,
      1,    1,
    ],

    /**
     * heatmap-radius: Gaussian kernel size in pixels.
     *
     * Grows with zoom so the physical ground area each kernel covers
     * stays approximately constant (≈ 300-500m at city scale).
     * This maintains area-aggregation semantics at all zoom levels.
     */
    'heatmap-radius': [
      'interpolate', ['linear'], ['zoom'],
      4,  12,
      6,  20,
      8,  30,
      10, 45,
      12, 65,
    ],

    /**
     * heatmap-intensity: global multiplier on heatmap-density.
     *
     * Increases with zoom to compensate for fewer overlapping kernels
     * as the radius shrinks relative to building density.
     */
    'heatmap-intensity': [
      'interpolate', ['linear'], ['zoom'],
      4,  0.2,
      7,  0.4,
      9,  0.6,
      11, 0.85,
      12, 1.0,
      13, 1.15,
      14, 1.3,
      15, 1.45,
      16, 1.6,
      17, 1.8,
      18, 2.0,
    ],

    /**
     * heatmap-color: maps heatmap-density [0,1] → RGBA color.
     *
     * Color ramp reads: low usage (green) → medium (amber) → high (red).
     * Near-zero density is fully transparent — keeps basemap visible.
     */
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0,    'rgba(0,0,0,0)',
      0.03, 'rgba(34,197,94,0.1)',
      0.08, 'rgba(132,204,22,0.28)',
      0.14, 'rgba(250,204,21,0.5)',
      0.22, 'rgba(251,146,60,0.72)',
      0.34, 'rgba(249,115,22,0.86)',
      0.46, 'rgba(239,68,68,0.94)',
      0.62, 'rgba(220,38,38,0.98)',
      1.3,  'rgba(220,38,38,0.98)',
      1.8,  'rgba(185,28,28,1)',
      2.4,  'rgba(127,29,29,1)',
    ],

    /**
     * heatmap-opacity: fade out heatmap as individual points appear.
     * This creates a smooth perceptual handoff at zoom 10-12.
     */
    'heatmap-opacity': [
      'interpolate', ['linear'], ['zoom'],
      9,  0.95,
      11, 0.7,
      12, 0.6,
      13, 0.5,
      14, 0.4,
      15, 0.3,
      16, 0.2,
      17, 0.1,
      18, 0,
    ],
  },
}

// ─── Cluster circle layer (zoom 11 → 14) ─────────────────────────────────────

export const CLUSTER_LAYER = {
  id: 'buildings-clusters',
  type: 'circle',
  source: 'buildings',
  filter: ['has', 'point_count'],
  minzoom: 11,
  maxzoom: 15,
  paint: {
    /**
     * Circle size steps with cluster population.
     * Colour encodes relative cluster size (orange → red).
     */
    'circle-color': [
      'step', ['get', 'point_count'],
      '#22c55e',  // < 10 buildings
      10, '#fde047',  // 10–49
      50, '#b91c1c',  // 50+
    ],
    'circle-radius': [
      'step', ['get', 'point_count'],
      14,
      10,  20,
      50,  28,
      200, 36,
    ],
    'circle-opacity': 0.88,
    'circle-stroke-color': 'rgba(255,255,255,0.15)',
    'circle-stroke-width': 1.5,
  },
}

export const CLUSTER_COUNT_LAYER = {
  id: 'buildings-cluster-count',
  type: 'symbol',
  source: 'buildings',
  filter: ['has', 'point_count'],
  minzoom: 11,
  maxzoom: 15,
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
    'text-size': 12,
    'text-allow-overlap': true,
  },
  paint: {
    'text-color': '#ffffff',
  },
}

// ─── Individual building points (zoom 14+) ───────────────────────────────────

export const POINT_LAYER = {
  id: 'buildings-point',
  type: 'circle',
  source: 'buildings',
  filter: ['!', ['has', 'point_count']],
  minzoom: 14,
  paint: {
    /**
     * Color by energikarakter (A–G) energy rating.
     * Green = efficient, Red = inefficient.
     */
    'circle-color': [
      'match', ['coalesce', ['get', 'energikarakter'], 'X'],
      'A', '#22c55e',
      'B', '#4ade80',
      'C', '#fde047',
      'D', '#fb923c',
      'E', '#f97316',
      'F', '#ef4444',
      'G', '#b91c1c',
      '#4a5875',   // fallback — unknown rating
    ],
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      14, 4,
      16, 6,
      18, 10,
      20, 16,
    ],
    'circle-stroke-color': 'rgba(11,14,23,0.6)',
    'circle-stroke-width': 1,
    'circle-opacity': [
      'interpolate', ['linear'], ['zoom'],
      13, 0,
      14, 0.9,
    ],
  },
}

// Highlight ring for selected building
export const POINT_HIGHLIGHT_LAYER = {
  id: 'buildings-point-highlight',
  type: 'circle',
  source: 'buildings',
  filter: ['==', ['id'], -1], // initially matches nothing
  minzoom: 14,
  paint: {
    'circle-color': 'transparent',
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      14, 8,
      18, 18,
    ],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
    'circle-opacity': 1,
  },
}

// ─── Nearby circle + result highlights ───────────────────────────────────────

export const NEARBY_CIRCLE_LAYER = {
  id: 'nearby-circle-fill',
  type: 'fill',
  source: 'nearby-circle',
  paint: {
    'fill-color': '#ff8c42',
    'fill-opacity': 0.07,
  },
}

export const NEARBY_CIRCLE_STROKE_LAYER = {
  id: 'nearby-circle-stroke',
  type: 'line',
  source: 'nearby-circle',
  paint: {
    'line-color': '#ff8c42',
    'line-width': 1.5,
    'line-dasharray': [4, 3],
    'line-opacity': 0.8,
  },
}

export const NEARBY_RESULTS_LAYER = {
  id: 'nearby-results',
  type: 'circle',
  source: 'nearby-results',
  paint: {
    /**
     * Color nearby results by energy rating (A–G), same as the point layer.
     * This gives instant visual insight into the energy quality of nearby buildings.
     */
    'circle-color': [
      'match', ['coalesce', ['get', 'energikarakter'], 'X'],
      'A', '#22c55e',
      'B', '#4ade80',
      'C', '#fde047',
      'D', '#fb923c',
      'E', '#f97316',
      'F', '#ef4444',
      'G', '#b91c1c',
      '#4a5875',  // unknown rating
    ],
    'circle-radius': 8,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
    'circle-opacity': 1,
  },
}

export const SEARCH_RESULT_LAYER = {
  id: 'search-result-point',
  type: 'circle',
  source: 'search-result',
  paint: {
    'circle-color': '#f8fafc',
    'circle-radius': 9,
    'circle-stroke-color': '#ff8c42',
    'circle-stroke-width': 3,
    'circle-opacity': 1,
  },
}

/**
 * Ordered list of layer IDs to add (determines draw order, last = on top).
 */
export const LAYER_ORDER = [
  'buildings-heatmap',
  'buildings-clusters',
  'buildings-cluster-count',
  'buildings-point',
  'buildings-point-highlight',
  'nearby-circle-fill',
  'nearby-circle-stroke',
  'nearby-results',
  'search-result-point',
]
