import { create } from 'zustand'

const ALL_RATINGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

const DEFAULT_FILTERS = {
  yearRange: [1800, 2024],
  energyRange: [0, 3000],
  ratings: [...ALL_RATINGS],
  category: 'all',
}

/**
 * Core application state.
 *
 * Data flow:
 *  1. useBuildings hook fetches from /api/bygg/geojson
 *  2. setAllFeatures() stores the raw FeatureCollection
 *  3. applyFilters() computes filteredFeatures and exposes stats
 *  4. MapView watches filteredFeatures and calls map.getSource().setData()
 */
export const useMapStore = create((set, get) => ({
  // ── Raw data ────────────────────────────────────────────────────────
  allFeatures: [],
  categories: [],

  // ── Filtered working set ────────────────────────────────────────────
  filteredFeatures: [],
  stats: { count: 0, avgEnergy: 0 },

  // ── Filters ─────────────────────────────────────────────────────────
  filters: { ...DEFAULT_FILTERS },

  // ── UI state ─────────────────────────────────────────────────────────
  selectedBuilding: null,   // opens BuildingPanel
  searchResult:     null,   // GeoJSON Feature from search bar → map popup
  currentZoom: 5,
  zoomMode: 'heatmap',      // 'heatmap' | 'cluster' | 'point'

  // ── Nearby search ─────────────────────────────────────────────────
  nearbyActive: false,
  nearbyRadius: 500,          // metres
  nearbyResults: [],
  nearbyCircle: null,         // GeoJSON polygon

  // ────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ────────────────────────────────────────────────────────────────────

  setAllFeatures: (features) => {
    // Derive unique categories for the dropdown
    const catSet = new Set(
      features
        .map(f => f.properties?.bygningskategori)
        .filter(Boolean)
    )
    set({ allFeatures: features, categories: ['all', ...Array.from(catSet).sort()] })
    get().applyFilters()
  },

  setFilters: (partial) => {
    set(state => ({ filters: { ...state.filters, ...partial } }))
    get().applyFilters()
  },

  resetFilters: () => {
    set({ filters: { ...DEFAULT_FILTERS } })
    get().applyFilters()
  },

  /**
   * Re-computes filteredFeatures from allFeatures + current filters.
   * Called whenever filters change. O(n) scan over ~8000 features —
   * fast enough to run synchronously with 150ms debounce in UI.
   */
  applyFilters: () => {
    const { allFeatures, filters } = get()
    const { yearRange, energyRange, ratings, category } = filters

    const filtered = allFeatures.filter(f => {
      const p = f.properties
      if (!p) return false

      // All field names match the .NET backend exactly:
      // byggeaar, energibruk_kwh_m2, energikarakter, bygningskategori
      const year   = p.byggeaar
      const energy = p.energibruk_kwh_m2  ?? 0
      const rating = p.energikarakter     ?? ''
      const cat    = p.bygningskategori   ?? ''

      if (year != null && (year < yearRange[0] || year > yearRange[1])) return false
      if (energy < energyRange[0] || energy > energyRange[1]) return false
      if (ratings.length < 7 && !ratings.includes(rating))   return false
      if (category !== 'all' && cat !== category)             return false

      return true
    })

    const avgEnergy = filtered.length
      ? Math.round(
          filtered.reduce((s, f) => s + (f.properties?.energibruk_kwh_m2 ?? 0), 0) / filtered.length
        )
      : 0

    set({
      filteredFeatures: filtered,
      stats: { count: filtered.length, avgEnergy }
    })
  },

  // ── Building selection ───────────────────────────────────────────────
  selectedBuilding: null,   // opens the BuildingPanel slide-in
  searchResult:     null,   // full GeoJSON Feature from search → triggers map popup

  selectBuilding:    (properties) => set({ selectedBuilding: properties }),
  clearSelection:    ()           => set({ selectedBuilding: null }),
  setSearchResult:   (feature)    => set({ searchResult: feature }),
  clearSearchResult: ()           => set({ searchResult: null }),

  // ── Zoom tracking ────────────────────────────────────────────────────
  setZoom: (zoom) => {
    let zoomMode = 'heatmap'
    if (zoom >= 11 && zoom < 14) zoomMode = 'cluster'
    if (zoom >= 14)               zoomMode = 'point'
    set({ currentZoom: zoom, zoomMode })
  },

  // ── Nearby search ────────────────────────────────────────────────────
  setNearbyActive: (v)       => set({ nearbyActive: v }),
  setNearbyRadius: (r)       => set({ nearbyRadius: r }),
  setNearbyCircle: (circle)  => set({ nearbyCircle: circle }),
  setNearbyResults: (results) => set({ nearbyResults: results }),
  clearNearby: () => set({
    nearbyActive: false,
    nearbyResults: [],
    nearbyCircle: null,
  }),
}))
