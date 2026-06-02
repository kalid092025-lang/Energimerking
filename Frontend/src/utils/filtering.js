function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKey(key) {
  return String(key)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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

  const sourceKeys = new Map(
    Object.keys(source).map((key) => [normalizeKey(key), key])
  );

  for (const key of keys) {
    const sourceKey = sourceKeys.get(normalizeKey(key));
    if (
      sourceKey &&
      source[sourceKey] !== null &&
      source[sourceKey] !== undefined &&
      source[sourceKey] !== ''
    ) {
      return source[sourceKey];
    }
  }

  return fallback;
}

function hasAnyKey(source, keys) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return false;
  }

  return keys.some((key) => firstValue(source, [key], undefined) !== undefined);
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return asArray(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (value && typeof value === 'object') {
    const objectLooksLikeUnit = hasAnyKey(value, [
      'bruksenhetsNr',
      'brukenhetsnummer',
      'adresse',
      'attestListe',
      'attestliste',
      'attestListeRaw'
    ]);

    if (objectLooksLikeUnit) {
      return [value];
    }

    return Object.values(value).filter((item) => item && typeof item === 'object');
  }

  return [];
}

function firstObject(value) {
  return asArray(value).find((item) => item && typeof item === 'object') || {};
}

function firstNestedValue(sources, keys, fallback = '') {
  for (const source of sources) {
    const value = firstValue(source, keys, undefined);
    if (value !== undefined) {
      return value;
    }
  }

  return fallback;
}

const UNIT_NUMBER_KEYS = [
  'bruksenhetsNr',
  'BruksenhetsNr',
  'brukenhetsnummer',
  'Brukenhetsnummer',
  'brukenhetsNR',
  'BrukenhetsNR',
  'bruksenhetsnummer',
  'Bruksenhetsnummer'
];

function firstUnitNumber(sources, eiendommer) {
  const directValue = firstNestedValue(sources, UNIT_NUMBER_KEYS);
  if (directValue) {
    return directValue;
  }

  for (const eiendom of eiendommer) {
    const value = firstValue(eiendom, UNIT_NUMBER_KEYS);
    if (value) {
      return value;
    }
  }

  return '';
}

function normalizeAttest(normalized, attest) {
  if (!attest) return;

  if (typeof attest === 'object') {
    normalized.attestnummer ||= firstValue(attest, ['attestnummer', 'Attestnummer', 'attestNr', 'AttestNr']);
    normalized.utstedelsesdato ||= firstValue(attest, ['utstedelsesdato', 'Utstedelsesdato', 'utstedelsesDato', 'UtstedelsesDato']);
    normalized.energikarakter ||= firstValue(attest, ['energikarakter', 'Energikarakter']);
    normalized.oppvarmingskarakter ||= firstValue(attest, ['oppvarmingskarakter', 'Oppvarmingskarakter']);
    normalized.materialvalg ||= firstValue(attest, ['materialvalg', 'Materialvalg', 'matierialvalg', 'Matierialvalg']);

    if (!normalized.energibruk_kwh_m2 || normalized.energibruk_kwh_m2 === 0) {
      normalized.energibruk_kwh_m2 = toNumber(
        firstValue(attest, [
          'energibruk_kwh_m2',
          'EnergibrukKwhM2',
          'beregnetLevertEnergiTotaltkWhm2',
          'BeregnetLevertEnergiTotaltkWhm2'
        ], null),
        normalized.energibruk_kwh_m2
      );
      normalized.beregnetLevertEnergiTotaltkWhm2 = normalized.energibruk_kwh_m2;
    }

    if (!normalized.byggeaar) {
      normalized.byggeaar = toNumber(
        firstValue(attest, ['byggeaar', 'Byggeaar', 'byggeår', 'Byggeår'], null),
        normalized.byggeaar
      );
    }

    return;
  }

  if (typeof attest !== 'string') return;

  const energyMatch = attest.match(/beregnetLevertEnergiTotaltkWhm2=([0-9]+(?:\.[0-9]+)?)/i);
  if (energyMatch && (!normalized.energibruk_kwh_m2 || normalized.energibruk_kwh_m2 === 0)) {
    normalized.energibruk_kwh_m2 = toNumber(energyMatch[1], normalized.energibruk_kwh_m2 || 0);
    normalized.beregnetLevertEnergiTotaltkWhm2 = normalized.energibruk_kwh_m2;
  }

  const gradeMatch = attest.match(/energikarakter=([A-G])/i);
  if (gradeMatch && !normalized.energikarakter) {
    normalized.energikarakter = gradeMatch[1];
  }

  const yearMatch =
    attest.match(/bygge\W*ar=?(\d{3,4})/i) ||
    attest.match(/byggeaar=?(\d{3,4})/i) ||
    attest.match(/byggeår=?(\d{3,4})/i);
  if (yearMatch && !normalized.byggeaar) {
    normalized.byggeaar = toNumber(yearMatch[1], normalized.byggeaar);
  }
}

function normalizeProperties(rawProperties = {}, coordinates = []) {
  const eiendommer = asArray(firstValue(rawProperties, ['eiendommer', 'eiendom'], []));
  const firstEiendom = firstObject(eiendommer);
  const firstAttest = firstObject(firstValue(firstEiendom, ['attestListe', 'attestliste', 'attestListeRaw'], []));
  const propertySources = [rawProperties, firstEiendom, firstAttest];
  const unitNumber = firstUnitNumber(propertySources, eiendommer);
  const id = firstValue(
    rawProperties,
    ['id', 'denormId', 'DenormId', 'coordinateid', 'Coordinateid', 'CoordinateId', 'Bygningsnummer', 'bygningsnummer'],
    `${coordinates[0] || 0}-${coordinates[1] || 0}`
  );
  const normalized = {
    id,
    Bygningsnummer: firstNestedValue(propertySources, ['Bygningsnummer', 'bygningsnummer']),
    gard: firstNestedValue(propertySources, ['gard', 'gaard', 'gård', 'Gardsnummer', 'gardsnummer', 'Gårdsnummer', 'gårdsnummer']),
    bruksnummer: firstNestedValue(propertySources, ['bruksnummer', 'Bruksnummer', 'Bruksnummmer', 'bruk', 'Bruk']),
    feste: firstNestedValue(propertySources, ['feste', 'Feste', 'festeNr', 'FesteNr', 'festenummer', 'Festenummer']),
    andel: firstNestedValue(propertySources, ['andel', 'Andel', 'andelsNr', 'AndelsNr', 'andelsnummer', 'Andelsnummer']),
    seksjon: firstNestedValue(propertySources, ['seksjon', 'Seksjon', 'seksjonsNr', 'SeksjonsNr', 'seksjonsnummer', 'Seksjonsnummer']),
    adresse: firstNestedValue(propertySources, ['adresse', 'Adresse']),
    attestnummer: firstNestedValue(propertySources, ['attestnummer', 'Attestnummer', 'attestNr', 'AttestNr']),
    organisasjonsNr: firstNestedValue(propertySources, ['organisasjonsNr', 'OrganisasjonsNr', 'organisasjonsnummer', 'Organisasjonsnummer']),
    utstedelsesdato: firstNestedValue(propertySources, ['utstedelsesdato', 'Utstedelsesdato', 'utstedelsesDato', 'UtstedelsesDato']),
    materialvalg: firstNestedValue(propertySources, ['materialvalg', 'Materialvalg', 'matierialvalg', 'Matierialvalg']),
    poststed: firstNestedValue(propertySources, ['poststed', 'Poststed']),
    postnummer: firstNestedValue(propertySources, ['postnummer', 'Postnummer']),
    kommunenavn: firstNestedValue(propertySources, ['kommunenavn', 'Kommunenavn']),
    kommunenummer: firstNestedValue(propertySources, ['kommunenummer', 'Kommunenummer', 'kommune', 'Kommune', 'kommuneNr', 'KommuneNr']),
    bruksenhetsNr: unitNumber,
    brukenhetsnummer: unitNumber,
    energikarakter: firstNestedValue(propertySources, ['energikarakter', 'Energikarakter']),
    oppvarmingskarakter: firstNestedValue(propertySources, ['oppvarmingskarakter', 'Oppvarmingskarakter']),
    beregnetLevertEnergiTotaltkWhm2: toNumber(
      firstNestedValue(propertySources, [
        'energibruk_kwh_m2',
        'EnergibrukKwhM2',
        'beregnetLevertEnergiTotaltkWhm2',
        'BeregnetLevertEnergiTotaltkWhm2'
      ], null),
      0
    ),
    energibruk_kwh_m2: toNumber(
      firstNestedValue(propertySources, [
        'energibruk_kwh_m2',
        'EnergibrukKwhM2',
        'beregnetLevertEnergiTotaltkWhm2',
        'BeregnetLevertEnergiTotaltkWhm2'
      ], null),
      0
    ),
    byggeaar: toNumber(firstNestedValue(propertySources, ['byggeaar', 'Byggeaar', 'byggeår', 'Byggeår'], null), null)
  };

  try {
    for (const eiendom of eiendommer) {
      const attestListe = asArray(firstValue(eiendom, ['attestListe', 'attestliste', 'attestListeRaw'], []));
      for (const attest of attestListe) {
        normalizeAttest(normalized, attest);
        if (normalized.energibruk_kwh_m2 > 0 && normalized.energikarakter) break;
      }

      if (normalized.energibruk_kwh_m2 > 0 && normalized.energikarakter) break;
    }
  } catch {
    // Nested certificate data is best-effort.
  }

  return normalized;
}

function normalizeUnitFeature(feature, unitProperties, parentId, unitIndex) {
  const coordinates = feature.geometry.coordinates;
  const unitId = firstValue(
    unitProperties,
    ['denormId', 'DenormId', 'id', 'coordinateid', 'Coordinateid', 'CoordinateId'],
    `${parentId}-unit-${unitIndex}`
  );
  const properties = normalizeProperties(
    {
      ...feature.properties,
      ...unitProperties,
      eiendommer: [unitProperties]
    },
    coordinates
  );

  return {
    ...feature,
    id: unitId,
    properties: {
      ...properties,
      id: unitId,
      parentId
    }
  };
}

function normalizeFeature(feature, index) {
  const coordinates = feature.geometry.coordinates;
  const baseProperties = normalizeProperties(feature.properties, coordinates);
  const parentId = baseProperties.id || `feature-${index}`;
  const eiendommer = asArray(firstValue(feature.properties, ['eiendommer', 'eiendom'], []));
  const unitFeatures = eiendommer
    .map((eiendom, unitIndex) => normalizeUnitFeature(feature, eiendom, parentId, unitIndex))
    .filter((unitFeature) => (
      unitFeature.properties.bruksenhetsNr ||
      unitFeature.properties.brukenhetsnummer ||
      unitFeature.properties.attestnummer ||
      unitFeature.properties.energikarakter ||
      unitFeature.properties.energibruk_kwh_m2 > 0
    ));

  if (unitFeatures.length > 1) {
    return unitFeatures;
  }

  return [{
    ...feature,
    id: parentId,
    properties: {
      ...baseProperties,
      id: parentId
    }
  }];
}

export function normalizeGeoJson(payload) {
  const sourceFeatures = Array.isArray(payload?.features)
    ? payload.features
    : Array.isArray(payload)
      ? payload
          .map((item) => {
            const longitude = toNumber(firstValue(item, ['lon', 'Lon', 'longitude', 'Longitude'], null), null);
            const latitude = toNumber(firstValue(item, ['lat', 'Lat', 'latitude', 'Latitude'], null), null);

            return {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [longitude, latitude]
              },
              properties: item
            };
          })
      : [];

  return {
    type: 'FeatureCollection',
    features: sourceFeatures
      .filter((feature) => {
        const coordinates = feature?.geometry?.coordinates;
        return (
          Array.isArray(coordinates) &&
          coordinates.length >= 2 &&
          coordinates[0] !== null &&
          coordinates[1] !== null
        );
      })
      .flatMap((feature, index) => normalizeFeature(feature, index))
      .map((feature, index) => {
        const properties = feature.properties;
        const searchText = [
          properties.adresse,
          properties.poststed,
          properties.kommunenavn
        ]
          .join(' ')
          .toLowerCase();

        return {
          ...feature,
          id: properties.id || `feature-${index}`,
          properties: {
            ...properties,
            id: properties.id || `feature-${index}`,
            searchText
          }
        };
      })
  };
}

export function buildInitialFilterBounds(features) {
  if (features.length === 0) {
    return {
      byggeaar: [1900, 2026],
      energibruk_kwh_m2: [0, 2000]
    };
  }

  const years = features
    .map((feature) => feature.properties.byggeaar)
    .filter((value) => Number.isFinite(value));
  const energyValues = features
    .map((feature) => feature.properties.energibruk_kwh_m2)
    .filter((value) => Number.isFinite(value));

  return {
    byggeaar: [
      years.length ? Math.min(...years) : 1900,
      years.length ? Math.max(...years) : 2026
    ],
    energibruk_kwh_m2: [0, 2000]
  };
}

export function filterFeatures(features, filters) {
  const [yearMin, yearMax] = filters.byggeaar;
  const [energyMin, energyMax] = filters.energibruk_kwh_m2;

  return features.filter((feature) => {
    const props = feature.properties;
    const year = props.byggeaar;
    const energy = props.energibruk_kwh_m2;

    const matchesYear = year === null || (year >= yearMin && year <= yearMax);
    const matchesEnergy = energy >= energyMin && energy <= energyMax;
    const selectedEnergyGrades = Array.isArray(filters.energikarakter)
      ? filters.energikarakter
      : filters.energikarakter === 'all'
        ? []
        : [filters.energikarakter];
    const matchesEnergyGrade =
      selectedEnergyGrades.length === 0 || selectedEnergyGrades.includes(props.energikarakter);
    const matchesHeatingGrade =
      filters.oppvarmingskarakter === 'all' ||
      props.oppvarmingskarakter === filters.oppvarmingskarakter;

    return matchesYear && matchesEnergy && matchesEnergyGrade && matchesHeatingGrade;
  });
}

export function getSearchSuggestions(features, query) {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return [];
  }

  return features
    .filter((feature) => feature.properties.searchText.includes(trimmedQuery))
    .sort((left, right) => {
      const leftAddress = left.properties.adresse || '';
      const rightAddress = right.properties.adresse || '';
      const leftStarts = leftAddress.toLowerCase().startsWith(trimmedQuery) ? 0 : 1;
      const rightStarts = rightAddress.toLowerCase().startsWith(trimmedQuery) ? 0 : 1;

      if (leftStarts !== rightStarts) {
        return leftStarts - rightStarts;
      }

      return leftAddress.localeCompare(rightAddress);
    })
    .slice(0, 10);
}
