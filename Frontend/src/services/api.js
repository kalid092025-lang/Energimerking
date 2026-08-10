const API_BASE_URL = '/api';

function buildUrl(path, params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;
}

async function getJson(path, params, options = {}) {
  const response = await fetch(buildUrl(path, params), {
    signal: options.signal,
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }

  return payload;
}

const DEFAULT_BUILDING_QUERY = {
  latitude: 59.917330,
  longitude: 10.844128,
  radiusInMeters: 3000,
  amount: 20000,
  onlyNew: false
};

export async function fetchBuildingsGeoJson(params = {}, options = {}) {
  return getJson('/bygg/GetNearbyDeNormGeoJson', {
    ...DEFAULT_BUILDING_QUERY,
    ...params
  }, options);
}

export async function fetchBuildingsBoundsGeoJson(params = {}, options = {}) {
  return getJson('/bygg/GetBoundsDeNormGeoJson', params, options);
}

export async function fetchNearbyBuildingsGeoJson({
  latitude,
  longitude,
  radiusInMeters = 5000,
  amount = 2000,
  onlyNew = false
}) {
  return getJson('/bygg/GetNearbyDeNormGeoJson', {
    latitude,
    longitude,
    radiusInMeters,
    amount,
    onlyNew
  });
}

export async function fetchBydelStats(bydelId) {
  return getJson(`/bydel-stats/${encodeURIComponent(bydelId)}`);
}
