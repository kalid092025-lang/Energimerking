import { create } from 'zustand';

const defaultBounds = {
  byggeaar: [1900, 2026],
  energibruk_kwh_m2: [0, 2000]
};

export const useStore = create((set) => ({
  theme: 'light',
  sidebarOpen: true,
  isLoading: false,
  error: '',
  viewMode: 'markers',
  nearbySearchEnabled: false,
  radiusInMeters: 5000,
  searchQuery: '',
  allFeatures: [],
  selectedFeature: null,
  nearby: {
    center: null,
    radiusInMeters: 5000,
    results: []
  },
  filterBounds: defaultBounds,
  filters: {
    byggeaar: defaultBounds.byggeaar,
    energibruk_kwh_m2: defaultBounds.energibruk_kwh_m2,
    energikarakter: [],
    oppvarmingskarakter: 'all'
  },
  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === 'light' ? 'dark' : 'light'
    })),
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setAllFeatures: (allFeatures) => set({ allFeatures }),
  setSelectedFeature: (selectedFeature) => set({ selectedFeature }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleNearbySearch: () =>
    set((state) => {
      const nearbySearchEnabled = !state.nearbySearchEnabled;

      return {
        nearbySearchEnabled,
        nearby: nearbySearchEnabled
          ? state.nearby
          : {
              center: null,
              radiusInMeters: state.radiusInMeters,
              results: []
            }
      };
    }),
  setNearbySearchEnabled: (nearbySearchEnabled) => set({ nearbySearchEnabled }),
  setRadiusInMeters: (radiusInMeters) =>
    set(() => ({
      radiusInMeters,
      nearby: {
        center: null,
        radiusInMeters,
        results: []
      }
    })),
  setNearby: (nearby) => set({ nearby }),
  clearNearby: () =>
    set((state) => ({
      nearby: {
        center: null,
        radiusInMeters: state.radiusInMeters,
        results: []
      }
    })),
  initializeFilters: (bounds) =>
    set({
      filterBounds: bounds,
      filters: {
        byggeaar: bounds.byggeaar,
        energibruk_kwh_m2: bounds.energibruk_kwh_m2,
        energikarakter: [],
        oppvarmingskarakter: 'all'
      }
    }),
  updateRange: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value
      }
    })),
  updateSelect: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value
      }
    })),
  resetFilters: () =>
    set((state) => ({
      filters: {
        byggeaar: state.filterBounds.byggeaar,
        energibruk_kwh_m2: state.filterBounds.energibruk_kwh_m2,
        energikarakter: [],
        oppvarmingskarakter: 'all'
      }
    }))
}));
