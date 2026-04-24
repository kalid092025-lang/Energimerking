import { useQuery } from '@tanstack/react-query'
import { useMapStore } from '../store/useMapStore'
import { useEffect } from 'react'

const API_BASE = '/api/bygg'

/**
 * Fetches the full building GeoJSON from the backend.
 *
 * Strategy: fetch once on mount, cache indefinitely in React Query.
 * 8000 features is ~2-4MB JSON — acceptable for a single fetch that
 * powers all downstream filters client-side, avoiding per-filter
 * API round-trips.
 *
 * Why client-side filtering (not per-request API filtering)?
 *  - Filters change frequently (slider drag → many events)
 *  - Network latency would degrade the interactive experience
 *  - 8000 features fit comfortably in browser memory (~5MB)
 *  - Filter computation over 8000 objects is <1ms in modern V8
 */
export function useBuildings() {
  const setAllFeatures = useMapStore(s => s.setAllFeatures)

  const query = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/geojson?limit=8000`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.features ?? []
    },
    staleTime: Infinity,    // treat as static during session
    gcTime:    Infinity,
    retry: 2,
  })

  // Hydrate the Zustand store when data arrives
  useEffect(() => {
    if (query.data) {
      setAllFeatures(query.data)
    }
  }, [query.data, setAllFeatures])

  return query
}

/**
 * Fetch nearby buildings.
 * Called imperatively from MapView on map click when nearbyActive.
 */
export async function fetchNearby({ latitude, longitude, radiusInMeters }) {
  const params = new URLSearchParams({
    latitude:       String(latitude),
    longitude:      String(longitude),
    radiusInMeters: String(radiusInMeters),
  })
  const res = await fetch(`${API_BASE}/nearby?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Nominatim geocoding for the search bar.
 * Restricted to Norway (countrycodes=no).
 * User-Agent is required by OSM policy.
 */
export async function geocodeAddress(query) {
  if (!query || query.trim().length < 1) return []
  const params = new URLSearchParams({
    q:              query.trim(),
    format:         'json',
    countrycodes:   'no',
    limit:          '6',
    addressdetails: '1',
  })
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          'Accept-Language': 'no,en',
          'User-Agent': 'EnergiKart/1.0',
        },
      }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
