import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { useMapStore } from '../store/useMapStore'
import { fetchNearby } from '../hooks/useBuildings'
import { makeCircleGeoJSON, RATING_COLORS } from '../utils/geoUtils'
import {
  SOURCE_CONFIG,
  HEATMAP_LAYER,
  CLUSTER_LAYER,
  CLUSTER_COUNT_LAYER,
  POINT_LAYER,
  POINT_HIGHLIGHT_LAYER,
  NEARBY_CIRCLE_LAYER,
  NEARBY_CIRCLE_STROKE_LAYER,
  NEARBY_RESULTS_LAYER,
  SEARCH_RESULT_LAYER,
} from '../utils/layers'

/**
 * Converts any building-like object into a valid GeoJSON Feature.
 * Handles proper GeoJSON, flat {latitude,longitude} objects, and mixed shapes.
 */
function normalizeToGeoJSONFeature(item) {
  if (!item) return null

  if (
    item.type === 'Feature' &&
    item.geometry?.type === 'Point' &&
    Array.isArray(item.geometry.coordinates) &&
    item.geometry.coordinates.length >= 2
  ) return item

  const props = item.properties ?? item
  const lng = item.longitude ?? item.lon ?? item.lng ?? props.longitude ?? props.lon ?? props.lng
  const lat = item.latitude ?? item.lat ?? props.latitude ?? props.lat

  if (lng == null || lat == null) return null
  const coords = [parseFloat(lng), parseFloat(lat)]
  if (isNaN(coords[0]) || isNaN(coords[1])) return null

  const mergedProps = { ...props }
  delete mergedProps.geometry
  delete mergedProps.type

  return { type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: mergedProps }
}

/**
 * The /nearby endpoint returns only { coordinateid, latitude, longitude }.
 * We enrich each result by matching its coordinates against the already-loaded
 * allFeatures (full building data with address, energy rating, etc.).
 *
 * Uses a pre-built coordinate lookup Map for O(1) matching.
 * Coordinates are rounded to 5 decimal places (~1m precision) for the key.
 */
function buildCoordLookup(allFeatures) {
  const map = new Map()
  for (const f of allFeatures) {
    if (!f.geometry?.coordinates) continue
    const [lng, lat] = f.geometry.coordinates
    const key = `${parseFloat(lat).toFixed(5)}_${parseFloat(lng).toFixed(5)}`
    map.set(key, f)
  }
  return map
}

function findNearestBuilding(lat, lng, allFeatures, maxDistanceMeters = 15) {
  let nearest = null
  let bestDistanceSq = Infinity

  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)
  if (isNaN(latNum) || isNaN(lngNum)) return null

  const metersPerLatDegree = 111_320
  const metersPerLngDegree = 111_320 * Math.cos((latNum * Math.PI) / 180)

  for (const feature of allFeatures) {
    const coords = feature.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue

    const [featureLng, featureLat] = coords
    const dx = (parseFloat(featureLng) - lngNum) * metersPerLngDegree
    const dy = (parseFloat(featureLat) - latNum) * metersPerLatDegree
    const distanceSq = dx * dx + dy * dy

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq
      nearest = feature
    }
  }

  return bestDistanceSq <= maxDistanceMeters * maxDistanceMeters ? nearest : null
}

function enrichNearbyWithBuildings(nearbyRaw, allFeatures) {
  const lookup = buildCoordLookup(allFeatures)
  return nearbyRaw
    .map(item => {
      const lat = item.latitude ?? item.lat
      const lng = item.longitude ?? item.lon ?? item.lng
      if (lat == null || lng == null) return null

      const key = `${parseFloat(lat).toFixed(5)}_${parseFloat(lng).toFixed(5)}`
      const matched = lookup.get(key) ?? findNearestBuilding(lat, lng, allFeatures)

      return matched ?? {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        properties: { coordinateid: item.coordinateid },
      }
    })
    .filter(Boolean)
}

function lngLatToWebMercatorMeters(lng, lat) {
  const originShift = 20037508.34
  const x = (lng * originShift) / 180
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)
  return {
    x,
    y: (y * originShift) / 180,
  }
}

function webMercatorMetersToLngLat(x, y) {
  const originShift = 20037508.34
  const lng = (x / originShift) * 180
  const lat = (y / originShift) * 180
  return {
    lng,
    lat: (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2),
  }
}

function toEnergyWeight(avgEnergy) {
  if (avgEnergy == null || Number.isNaN(Number(avgEnergy))) return 0
  const energy = Number(avgEnergy)
  if (energy <= 0) return 0
  if (energy <= 150) return (energy / 150) * 0.25
  if (energy <= 250) return 0.25 + ((energy - 150) / 100) * 0.3
  if (energy <= 300) return 0.55 + ((energy - 250) / 50) * 0.45
  return 1
}

function toBadGradeWeight({ addressCount, badCount, severeCount }) {
  if (!addressCount || badCount <= 0) return 0

  const badShare = badCount / addressCount
  const severeShare = severeCount / addressCount

  // Buildings with many bad addresses should stand out even if nearby
  // averages dilute them. Count + share + severe grades all matter.
  return Math.min(
    1,
    badShare * 0.6 +
    severeShare * 0.5 +
    Math.min(0.35, badCount * 0.1) +
    Math.min(0.25, severeCount * 0.08)
  )
}

function buildPerBuildingAverageFeatures(features) {
  const buildings = new Map()

  for (const feature of features) {
    const coords = feature.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue

    const [lng, lat] = coords
    const energy = feature.properties?.energibruk_kwh_m2
    if (energy == null || Number.isNaN(Number(energy))) continue

    const buildingId = feature.properties?.bygningsnummer
    if (!buildingId) {
      buildings.set(Symbol('building'), {
        lngSum: Number(lng),
        latSum: Number(lat),
        energySum: Number(energy),
        count: 1,
        badCount: ['E', 'F', 'G'].includes(feature.properties?.energikarakter) ? 1 : 0,
        severeCount: ['F', 'G'].includes(feature.properties?.energikarakter) ? 1 : 0,
      })
      continue
    }

    const existing = buildings.get(buildingId) ?? {
      lngSum: 0,
      latSum: 0,
      energySum: 0,
      count: 0,
      badCount: 0,
      severeCount: 0,
    }

    existing.lngSum += Number(lng)
    existing.latSum += Number(lat)
    existing.energySum += Number(energy)
    existing.count += 1
    if (['E', 'F', 'G'].includes(feature.properties?.energikarakter)) existing.badCount += 1
    if (['F', 'G'].includes(feature.properties?.energikarakter)) existing.severeCount += 1
    buildings.set(buildingId, existing)
  }

  return Array.from(buildings.values()).map(building => {
    const avgEnergy = building.energySum / building.count
    const energyWeight = toEnergyWeight(avgEnergy)
    const badGradeWeight = toBadGradeWeight({
      addressCount: building.count,
      badCount: building.badCount,
      severeCount: building.severeCount,
    })

    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [building.lngSum / building.count, building.latSum / building.count],
      },
      properties: {
        avg_energibruk_kwh_m2: avgEnergy,
        address_count: building.count,
        bad_grade_count: building.badCount,
        severe_bad_grade_count: building.severeCount,
        heatmap_weight: Math.max(energyWeight, badGradeWeight),
      },
    }
  })
}

function buildAverageHeatmapFeatures(features, cellSizeMeters = 300) {
  const buildingFeatures = buildPerBuildingAverageFeatures(features)
  const cells = new Map()

  for (const feature of buildingFeatures) {
    const coords = feature.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue

    const [lng, lat] = coords
    const energy = feature.properties?.avg_energibruk_kwh_m2
    const weight = feature.properties?.heatmap_weight ?? 0
    if (energy == null || Number.isNaN(Number(energy))) continue

    const point = lngLatToWebMercatorMeters(Number(lng), Number(lat))
    const cellX = Math.floor(point.x / cellSizeMeters)
    const cellY = Math.floor(point.y / cellSizeMeters)
    const key = `${cellX}:${cellY}`

    const existing = cells.get(key) ?? {
      sumEnergy: 0,
      count: 0,
      maxWeight: 0,
      centerX: (cellX + 0.5) * cellSizeMeters,
      centerY: (cellY + 0.5) * cellSizeMeters,
    }

    existing.sumEnergy += Number(energy)
    existing.count += 1
    existing.maxWeight = Math.max(existing.maxWeight, Number(weight) || 0)
    cells.set(key, existing)
  }

  return Array.from(cells.values()).map(cell => {
    const center = webMercatorMetersToLngLat(cell.centerX, cell.centerY)
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [center.lng, center.lat],
      },
      properties: {
        avg_energibruk_kwh_m2: cell.sumEnergy / cell.count,
        building_count: cell.count,
        heatmap_weight: cell.maxWeight,
      },
    }
  })
}

function applyBuildingSelection(map, feature, selectBuilding) {
  if (!feature?.properties) return

  selectBuilding(feature.properties)

  if (feature.source === 'buildings' && feature.id != null) {
    map.setFilter('buildings-point-highlight', ['==', ['id'], feature.id])
    return
  }

  map.setFilter('buildings-point-highlight', ['==', ['id'], -1])
}

function buildSearchPopupHtml(properties) {
  const p = properties ?? {}
  const rating = p.energikarakter
  const color = rating ? RATING_COLORS[rating] : '#4a5875'
  const energy = p.energibruk_kwh_m2 != null ? `${Math.round(p.energibruk_kwh_m2)} kWh/mÂ²` : 'â€”'

  return `
    <div style="font-family:'DM Sans',sans-serif; min-width:200px;">
      <div style="
        display:flex; align-items:center; gap:10px;
        padding-bottom:10px; margin-bottom:10px;
        border-bottom:1px solid #1e2638;
      ">
        ${rating ? `
          <div style="
            width:36px; height:36px; border-radius:6px; flex-shrink:0;
            background:${color}22; border:1px solid ${color};
            display:flex; align-items:center; justify-content:center;
            font-family:'Syne',sans-serif; font-weight:800; font-size:18px; color:${color};
          ">${rating}</div>
        ` : ''}
        <div>
          <div style="font-size:13px; font-weight:600; color:#e4eaf6; line-height:1.3;">
            ${p.adresse ?? p.poststed ?? 'Ukjent adresse'}
          </div>
          <div style="font-size:11px; color:#7a8cad; margin-top:2px;">
            ${[p.poststed, p.kommunenavn].filter(Boolean).join(' Â· ')}
          </div>
        </div>
      </div>

      <div style="display:grid; gap:6px; font-size:11px;">
        <div style="display:flex; justify-content:space-between;">
          <span style="color:#4a5875;">Energibruk</span>
          <span style="color:${color}; font-weight:600;">${energy}</span>
        </div>
        ${p.byggeaar ? `
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#4a5875;">Byggeår</span>
            <span style="color:#e4eaf6;">${p.byggeaar}</span>
          </div>
        ` : ''}
        ${p.bygningskategori ? `
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#4a5875;">Kategori</span>
            <span style="color:#e4eaf6;">${p.bygningskategori}</span>
          </div>
        ` : ''}
        ${p.bygningsnummer ? `
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#4a5875;">Bygningsnr.</span>
            <span style="color:#e4eaf6;">${p.bygningsnummer}</span>
          </div>
        ` : ''}
      </div>

      <button
        onclick="window.__byggSelectBuilding()"
        style="
          margin-top:12px; width:100%; padding:8px;
          background:#ff8c4222; border:1px solid #ff8c42;
          border-radius:6px; color:#ff8c42;
          font-family:'Syne',sans-serif; font-size:11px; font-weight:600;
          letter-spacing:0.08em; text-transform:uppercase; cursor:pointer;
        "
      >
        Vis alle detaljer â†’
      </button>
    </div>
  `
}

function openSearchResultPopup(map, feature, searchPopupRef, selectBuilding, clearSearchResult) {
  if (!feature?.geometry?.coordinates) return

  if (searchPopupRef.current) {
    searchPopupRef.current.remove()
    searchPopupRef.current = null
  }

  const [lng, lat] = feature.geometry.coordinates
  const p = feature.properties ?? {}

  window.__byggSelectBuilding = () => {
    selectBuilding(p)
    if (searchPopupRef.current) {
      searchPopupRef.current.remove()
      searchPopupRef.current = null
    }
    clearSearchResult()
  }

  const popup = new maplibregl.Popup({
    maxWidth: '300px',
    closeButton: true,
    closeOnClick: false,
    className: 'bygg-popup',
  })
    .setLngLat([lng, lat])
    .setHTML(buildSearchPopupHtml(p))
    .addTo(map)

  popup.on('close', () => {
    searchPopupRef.current = null
  })

  searchPopupRef.current = popup
}

function openBuildingChoicePopup(map, features, popupRef, selectBuilding) {
  const validFeatures = (features ?? []).filter(f => f?.properties && f?.geometry?.coordinates)
  if (!validFeatures.length) return

  if (popupRef.current) {
    popupRef.current.remove()
    popupRef.current = null
  }

  const [lng, lat] = validFeatures[0].geometry.coordinates
  window.__byggFeatureChoices = validFeatures
  window.__byggPickFeature = (index) => {
    const chosen = window.__byggFeatureChoices?.[index]
    if (!chosen) return
    applyBuildingSelection(map, chosen, selectBuilding)
    if (popupRef.current) {
      popupRef.current.remove()
      popupRef.current = null
    }
  }

  const itemsHtml = validFeatures.map((feature, index) => {
    const p = feature.properties ?? {}
    const title = p.adresse ?? p.poststed ?? `Bygg ${index + 1}`
    const meta = [
      p.bygningsnummer ? `Bygningsnr. ${p.bygningsnummer}` : null,
      p.bygningskategori ?? null,
      p.byggeaar ? String(p.byggeaar) : null,
    ].filter(Boolean).join(' · ')

    return `
      <button
        onclick="window.__byggPickFeature(${index})"
        style="
          display:block; width:100%; text-align:left; cursor:pointer;
          background:#111827; border:1px solid #263041; border-radius:8px;
          padding:10px; margin-top:${index === 0 ? 0 : 8}px;
        "
      >
        <div style="font-size:12px; font-weight:600; color:#e4eaf6;">${title}</div>
        ${meta ? `<div style="font-size:10px; color:#7a8cad; margin-top:3px;">${meta}</div>` : ''}
      </button>
    `
  }).join('')

  const popup = new maplibregl.Popup({
    maxWidth: '320px',
    closeButton: true,
    closeOnClick: false,
    className: 'bygg-popup',
  })
    .setLngLat([lng, lat])
    .setHTML(`
      <div style="font-family:'DM Sans',sans-serif; min-width:220px;">
        <div style="font-size:12px; font-weight:700; color:#e4eaf6; margin-bottom:10px;">
          Velg bygg (${validFeatures.length})
        </div>
        <div style="max-height:260px; overflow-y:auto; padding-right:4px;">
          ${itemsHtml}
        </div>
      </div>
    `)
    .addTo(map)

  popup.on('close', () => {
    popupRef.current = null
  })

  popupRef.current = popup
}

const MAP_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
}
const INITIAL_CENTER = [10.75, 59.91]
const INITIAL_ZOOM = 6

export default function MapView({ mapRef, theme = 'dark' }) {
  const containerRef = useRef(null)
  const _mapRef = useRef(null)
  const searchPopupRef = useRef(null)

  const filteredFeatures = useMapStore(s => s.filteredFeatures)
  const allFeatures = useMapStore(s => s.allFeatures)
  const searchResult = useMapStore(s => s.searchResult)
  const nearbyActive = useMapStore(s => s.nearbyActive)
  const nearbyCircle = useMapStore(s => s.nearbyCircle)
  const nearbyResults = useMapStore(s => s.nearbyResults)
  const setZoom = useMapStore(s => s.setZoom)
  const setNearbyCircle = useMapStore(s => s.setNearbyCircle)
  const setNearbyResults = useMapStore(s => s.setNearbyResults)
  const selectBuilding = useMapStore(s => s.selectBuilding)
  const clearSearchResult = useMapStore(s => s.clearSearchResult)

  useEffect(() => {
    if (_mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[theme] ?? MAP_STYLES.dark,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 4,
      maxZoom: 20,
      antialias: true,
      fadeDuration: 150,
    })

    _mapRef.current = map
    if (mapRef) mapRef.current = map

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')

    map.on('error', (e) => {
      console.error('MapLibre error:', e.error)
    })

    map.on('load', () => {
      map.addSource('buildings', SOURCE_CONFIG)

      map.addSource('heatmap-buildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addSource('nearby-circle', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addSource('nearby-results', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addSource('search-result', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer(HEATMAP_LAYER)
      map.addLayer(CLUSTER_LAYER)
      map.addLayer(CLUSTER_COUNT_LAYER)
      map.addLayer(POINT_LAYER)
      map.addLayer(POINT_HIGHLIGHT_LAYER)
      map.addLayer(NEARBY_CIRCLE_LAYER)
      map.addLayer(NEARBY_CIRCLE_STROKE_LAYER)
      map.addLayer(NEARBY_RESULTS_LAYER)
      map.addLayer(SEARCH_RESULT_LAYER)

      const initialFeatures = useMapStore.getState().filteredFeatures
      const initialData = {
        type: 'FeatureCollection',
        features: initialFeatures,
      }
      const initialHeatmapData = {
        type: 'FeatureCollection',
        features: buildAverageHeatmapFeatures(initialFeatures),
      }

      map.getSource('buildings').setData(initialData)
      map.getSource('heatmap-buildings').setData(initialHeatmapData)

      map.on('zoom', () => setZoom(map.getZoom()))

      map.on('click', 'buildings-clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ['buildings-clusters'],
        })
        if (!features.length) return
        const clusterId = features[0].properties.cluster_id
        map.getSource('buildings').getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return
          map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom + 0.5,
            duration: 400,
          })
        })
      })

      map.on('mouseenter', 'buildings-clusters', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'buildings-clusters', () => {
        map.getCanvas().style.cursor = useMapStore.getState().nearbyActive ? 'crosshair' : ''
      })

      map.on('click', 'buildings-point', (e) => {
        const features = e.features ?? []
        if (!features.length) return
        if (features.length === 1) {
          applyBuildingSelection(map, features[0], selectBuilding)
          return
        }
        openBuildingChoicePopup(map, features, searchPopupRef, selectBuilding)
      })

      map.on('mouseenter', 'buildings-point', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'buildings-point', () => {
        map.getCanvas().style.cursor = useMapStore.getState().nearbyActive ? 'crosshair' : ''
      })

      map.on('click', 'nearby-results', (e) => {
        const features = e.features ?? []
        if (!features.length) return
        if (features.length === 1) {
          applyBuildingSelection(map, features[0], selectBuilding)
          return
        }
        openBuildingChoicePopup(map, features, searchPopupRef, selectBuilding)
      })

      map.on('mouseenter', 'nearby-results', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'nearby-results', () => {
        map.getCanvas().style.cursor = useMapStore.getState().nearbyActive ? 'crosshair' : ''
      })

      map.on('click', 'search-result-point', (e) => {
        const f = e.features?.[0]
        if (!f) return
        openSearchResultPopup(map, f, searchPopupRef, selectBuilding, clearSearchResult)
      })

      map.on('mouseenter', 'search-result-point', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'search-result-point', () => {
        map.getCanvas().style.cursor = useMapStore.getState().nearbyActive ? 'crosshair' : ''
      })

      map.on('click', async (e) => {
        const layerFeatures = map.queryRenderedFeatures(e.point, {
          layers: ['buildings-point', 'buildings-clusters', 'nearby-results', 'search-result-point'],
        })
        if (layerFeatures.length > 0) return

        const storeState = useMapStore.getState()
        if (!storeState.nearbyActive) return

        const { lng, lat } = e.lngLat
        const radius = storeState.nearbyRadius

        const circle = makeCircleGeoJSON([lng, lat], radius)
        map.getSource('nearby-circle').setData({
          type: 'FeatureCollection',
          features: [circle],
        })
        setNearbyCircle(circle)

        try {
          const result = await fetchNearby({
            latitude: lat,
            longitude: lng,
            radiusInMeters: radius,
          })

          const raw = Array.isArray(result) ? result
            : result?.features ? result.features
            : []

          const currentAllFeatures = useMapStore.getState().allFeatures
          const enriched = enrichNearbyWithBuildings(raw, currentAllFeatures)

          setNearbyResults(enriched)

          map.easeTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), 13),
            duration: 600,
          })
        } catch (err) {
          console.error('Nearby fetch failed:', err)
        }
      })
    })

    return () => {
      map.remove()
      _mapRef.current = null
      if (mapRef) mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = _mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const source = map.getSource('buildings')
    const heatmapSource = map.getSource('heatmap-buildings')
    if (!source || !heatmapSource) return

    const data = {
      type: 'FeatureCollection',
      features: filteredFeatures,
    }
    const heatmapData = {
      type: 'FeatureCollection',
      features: buildAverageHeatmapFeatures(filteredFeatures),
    }

    source.setData(data)
    heatmapSource.setData(heatmapData)
  }, [filteredFeatures])

  useEffect(() => {
    const map = _mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = nearbyActive ? 'crosshair' : ''
  }, [nearbyActive])

  useEffect(() => {
    const map = _mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (!nearbyCircle) {
      const src = map.getSource('nearby-circle')
      if (src) src.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [nearbyCircle])

  useEffect(() => {
    const map = _mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const src = map.getSource('nearby-results')
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: nearbyResults,
    })
  }, [nearbyResults])

  useEffect(() => {
    const map = _mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const src = map.getSource('search-result')
    if (!src) return

    if (searchPopupRef.current) {
      searchPopupRef.current.remove()
      searchPopupRef.current = null
    }

    const feature = normalizeToGeoJSONFeature(searchResult)

    src.setData({
      type: 'FeatureCollection',
      features: feature ? [feature] : [],
    })

    if (!feature) return

    const [lng, lat] = feature.geometry.coordinates

    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 700,
      essential: true,
    })
  }, [searchResult])

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}
