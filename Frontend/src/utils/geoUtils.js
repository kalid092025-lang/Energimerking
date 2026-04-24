/**
 * Geographic utility functions.
 * No external dependencies — avoids the weight of turf.js for simple ops.
 */

/**
 * Creates a GeoJSON Polygon approximating a circle.
 *
 * Uses the haversine-based offset formula for accurate ground distance.
 * At typical Norwegian latitudes (~60°), the longitude correction factor
 * is significant (~cos(60°) = 0.5) and must be applied.
 *
 * @param {[number, number]} center   [longitude, latitude]
 * @param {number}           radiusM  radius in metres
 * @param {number}           steps    polygon vertex count (default 64)
 * @returns {GeoJSON Feature<Polygon>}
 */
export function makeCircleGeoJSON(center, radiusM, steps = 64) {
  const [lng, lat] = center
  const EARTH_R = 6371000

  const latRad = (lat * Math.PI) / 180
  const coords = []

  for (let i = 0; i <= steps; i++) {
    const angle = ((i * 360) / steps) * (Math.PI / 180)
    const dLat  = (radiusM * Math.cos(angle)) / EARTH_R
    const dLng  = (radiusM * Math.sin(angle)) / (EARTH_R * Math.cos(latRad))

    coords.push([
      lng + (dLng * 180) / Math.PI,
      lat + (dLat * 180) / Math.PI,
    ])
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
    properties: {},
  }
}

/**
 * Haversine distance between two [lng,lat] points in metres.
 */
export function distanceM([lng1, lat1], [lng2, lat2]) {
  const R    = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Returns a bounding box [minLng, minLat, maxLng, maxLat] for a set of features.
 */
export function featuresBBox(features) {
  let minLng =  180, maxLng = -180
  let minLat =   90, maxLat = -90
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Format a kWh/m² value for display.
 */
export function fmtEnergy(val) {
  if (val == null || isNaN(val)) return '—'
  return `${Math.round(val)} kWh/m²`
}

/**
 * Energy rating → CSS color variable name.
 */
export const RATING_COLORS = {
  A: '#22c55e',
  B: '#4ade80',
  C: '#fde047',
  D: '#fb923c',
  E: '#f97316',
  F: '#ef4444',
  G: '#b91c1c',
}

/**
 * Energy rating → human-readable description.
 */
export const RATING_DESC = {
  A: 'Svært god',
  B: 'God',
  C: 'Middels god',
  D: 'Middels',
  E: 'Dårlig',
  F: 'Svært dårlig',
  G: 'Lavest',
}
