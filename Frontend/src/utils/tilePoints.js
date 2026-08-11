function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstValue(source, keys, fallback = '') {
  if (!source || typeof source !== 'object') {
    return fallback;
  }

  for (const key of keys) {
    if (source[key] !== null && source[key] !== undefined && source[key] !== '') {
      return source[key];
    }
  }

  return fallback;
}

function municipalityNameFromNumber(value) {
  const normalized = String(value || '').trim().padStart(4, '0');
  return normalized === '0301' ? 'Oslo' : '';
}

function normalizeCursor(cursor) {
  if (!cursor || typeof cursor !== 'object') return null;

  const lat = toNumber(firstValue(cursor, ['lat', 'Lat', 'cursorLat'], null), null);
  const lon = toNumber(firstValue(cursor, ['lon', 'Lon', 'cursorLon'], null), null);
  const id = toNumber(firstValue(cursor, ['id', 'Id', 'cursorId'], null), null);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(id)) {
    return null;
  }

  return { lat, lon, id };
}

function normalizeTileFeature(feature, index) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];
  const longitude = toNumber(coordinates[0], null);
  const latitude = toNumber(coordinates[1], null);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  const id = firstValue(properties, ['id', 'denormId', 'DenormId'], feature?.id ?? `tile-${index}`);
  const energyUse = toNumber(
    firstValue(properties, ['energibruk_kwh_m2', 'beregnetLevertEnergiTotaltkWhm2'], null),
    null
  );
  const buildYear = toNumber(firstValue(properties, ['byggeaar', 'bygge\u00e5r'], null), null);
  const municipalityNumber = firstValue(properties, ['kommunenummer', 'kommuneNr', 'kommune'], '');
  const municipalityName = firstValue(properties, ['kommunenavn'], '') ||
    municipalityNameFromNumber(municipalityNumber);
  const address = firstValue(properties, ['adresse'], '');

  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Point',
      coordinates: [longitude, latitude]
    },
    properties: {
      id,
      denormId: firstValue(properties, ['denormId', 'DenormId'], id),
      adresse: address,
      kommunenummer: municipalityNumber,
      kommunenavn: municipalityName,
      energikarakter: String(firstValue(properties, ['energikarakter'], '')).trim().toUpperCase(),
      oppvarmingskarakter: firstValue(properties, ['oppvarmingskarakter'], ''),
      byggeaar: buildYear,
      energibruk_kwh_m2: energyUse,
      beregnetLevertEnergiTotaltkWhm2: energyUse,
      searchText: [address, municipalityName].join(' ').toLowerCase()
    }
  };
}

export function normalizeTilePointsPayload(payload) {
  const sourceFeatures = Array.isArray(payload?.features) ? payload.features : [];

  return {
    features: sourceFeatures
      .map(normalizeTileFeature)
      .filter(Boolean),
    nextCursor: normalizeCursor(payload?.nextCursor),
    hasMore: Boolean(payload?.hasMore)
  };
}

export function tileCursorParams(cursor) {
  if (!cursor) return {};

  return {
    cursorLat: cursor.lat,
    cursorLon: cursor.lon,
    cursorId: cursor.id
  };
}
