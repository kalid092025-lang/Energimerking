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

function municipalityNameFromNumber(value) {
  const normalized = String(value || '').trim().padStart(4, '0');
  return normalized === '0301' ? 'Oslo' : '';
}

const ENOVA_2026_START_TIMESTAMP = Date.UTC(2026, 0, 1);

export const CERTIFICATE_SCHEME_LABELS = {
  all: 'All methods',
  '2026': '2026 method',
  legacy: 'Before 2026',
  unknown: 'Unknown date'
};

const CERTIFICATE_DATE_KEYS = [
  'utstedelsesdato',
  'Utstedelsesdato',
  'utstedelsesDato',
  'UtstedelsesDato',
  'issuedAt',
  'IssuedAt'
];

function parseDateTimestamp(value) {
  if (!value) return null;

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const text = String(value).trim();
  if (!text) return null;

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const norwegianDate = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (norwegianDate) {
    const [, day, month, year] = norwegianDate;
    const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  return null;
}

function dateYear(value) {
  const timestamp = parseDateTimestamp(value);
  return timestamp === null ? null : new Date(timestamp).getUTCFullYear();
}

export function certificateSchemeLabel(scheme) {
  return CERTIFICATE_SCHEME_LABELS[scheme] || CERTIFICATE_SCHEME_LABELS.unknown;
}

export function getCertificateScheme(value) {
  const timestamp = parseDateTimestamp(value);
  if (timestamp === null) return 'unknown';
  return timestamp >= ENOVA_2026_START_TIMESTAMP ? '2026' : 'legacy';
}

function latestObjectByDate(items, dateKeys = CERTIFICATE_DATE_KEYS) {
  const candidates = asArray(items);
  if (candidates.length === 0) return {};

  return [...candidates].sort((left, right) => {
    const leftTimestamp = parseDateTimestamp(firstValue(left, dateKeys, null)) ?? Number.NEGATIVE_INFINITY;
    const rightTimestamp = parseDateTimestamp(firstValue(right, dateKeys, null)) ?? Number.NEGATIVE_INFINITY;
    return rightTimestamp - leftTimestamp;
  })[0] || {};
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

const ENERGY_GRADE_UPGRADE_SCORES = {
  A: 0,
  B: 10,
  C: 25,
  D: 45,
  E: 65,
  F: 85,
  G: 100
};

const HEATING_GRADE_UPGRADE_SCORES = {
  GREEN: 0,
  YELLOW: 35,
  ORANGE: 70,
  RED: 100
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeGrade(value) {
  return String(value || '').trim().toUpperCase();
}

function buildUpgradeScores(properties) {
  const energyGradeScore = ENERGY_GRADE_UPGRADE_SCORES[normalizeGrade(properties.energikarakter)] ?? 50;
  const heatingGradeScore = HEATING_GRADE_UPGRADE_SCORES[normalizeGrade(properties.oppvarmingskarakter)] ?? 50;
  const energyUseScore = clamp((Number(properties.energibruk_kwh_m2) || 0) / 2000 * 100, 0, 100);
  const buildYear = Number(properties.byggeaar);
  const ageScore = Number.isFinite(buildYear) ? clamp((2026 - buildYear) / 126 * 100, 0, 100) : 50;
  const energyUpgradeScore = Math.round((energyGradeScore * 0.45) + (energyUseScore * 0.35) + (ageScore * 0.2));
  const heatingUpgradeScore = Math.round((heatingGradeScore * 0.7) + (energyUseScore * 0.2) + (ageScore * 0.1));
  const upgradeScore = Math.round((energyUpgradeScore * 0.55) + (heatingUpgradeScore * 0.45));

  return {
    energyUpgradeScore,
    heatingUpgradeScore,
    upgradeScore,
    upgradePriority: upgradeScore >= 75 ? 'High' : upgradeScore >= 45 ? 'Medium' : 'Low'
  };
}

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

  const issuedMatch = attest.match(/utstedelsesdato=([^,}\]]+)/i);
  if (issuedMatch && !normalized.utstedelsesdato) {
    normalized.utstedelsesdato = issuedMatch[1].trim();
  }

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
  const latestAttest = latestObjectByDate([
    ...asArray(firstValue(rawProperties, ['attestListe', 'attestliste', 'attestListeRaw'], [])),
    ...asArray(firstValue(firstEiendom, ['attestListe', 'attestliste', 'attestListeRaw'], []))
  ]);
  const propertySources = [rawProperties, firstEiendom, latestAttest];
  const unitNumber = firstUnitNumber(propertySources, eiendommer);
  const id = firstValue(
    rawProperties,
    ['id', 'denormId', 'DenormId', 'coordinateid', 'Coordinateid', 'CoordinateId', 'Bygningsnummer', 'bygningsnummer'],
    `${coordinates[0] || 0}-${coordinates[1] || 0}`
  );
  const issuedDate = firstNestedValue(propertySources, CERTIFICATE_DATE_KEYS);
  const certificateScheme = getCertificateScheme(issuedDate);
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
    utstedelsesdato: issuedDate,
    materialvalg: firstNestedValue(propertySources, ['materialvalg', 'Materialvalg', 'matierialvalg', 'Matierialvalg']),
    dataSource: firstNestedValue(propertySources, ['dataSource', 'DataSource', 'source', 'Source', 'kilde', 'Kilde'], 'Local Enova energy certificate data'),
    sourceApiVersion: firstNestedValue(propertySources, ['sourceApiVersion', 'SourceApiVersion', 'apiVersion', 'ApiVersion']),
    lastSyncedAt: firstNestedValue(propertySources, ['lastSyncedAt', 'LastSyncedAt', 'importedAt', 'ImportedAt']),
    certificateScheme,
    certificateSchemeLabel: certificateSchemeLabel(certificateScheme),
    certificateIssuedTimestamp: parseDateTimestamp(issuedDate),
    certificateIssuedYear: dateYear(issuedDate),
    poststed: firstNestedValue(propertySources, ['poststed', 'Poststed']),
    postnummer: firstNestedValue(propertySources, ['postnummer', 'Postnummer']),
    kommunenavn: firstNestedValue(propertySources, ['kommunenavn', 'Kommunenavn']) ||
      municipalityNameFromNumber(firstNestedValue(propertySources, ['kommunenummer', 'Kommunenummer', 'kommune', 'Kommune', 'kommuneNr', 'KommuneNr'])),
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

  return {
    ...normalized,
    ...buildUpgradeScores(normalized)
  };
}

function normalizeUnitFeature(feature, unitProperties, parentId, unitIndex) {
  const coordinates = feature.geometry.coordinates;
  const unitNumber = firstValue(unitProperties, UNIT_NUMBER_KEYS);
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
      parentId,
      bruksenhetsNr: properties.bruksenhetsNr || unitNumber,
      brukenhetsnummer: properties.brukenhetsnummer || unitNumber
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

function normalizedIdentityPart(value) {
  return String(value ?? '').trim().toLowerCase();
}

function featureCoordinateKey(feature) {
  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  if (!Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude))) return '';
  return `${Number(longitude).toFixed(5)}:${Number(latitude).toFixed(5)}`;
}

function certificateIdentityKey(feature) {
  const props = feature?.properties || {};
  const buildingNumber = firstValue(props, ['Bygningsnummer', 'bygningsnummer']);
  const unitNumber = firstValue(props, UNIT_NUMBER_KEYS);

  if (buildingNumber) {
    return `building:${normalizedIdentityPart(buildingNumber)}:${normalizedIdentityPart(unitNumber)}`;
  }

  const matrikkel = [
    props.kommunenummer,
    props.gard,
    props.bruksnummer,
    props.feste,
    props.seksjon,
    props.andel,
    unitNumber
  ].map(normalizedIdentityPart);

  if (matrikkel.slice(0, 3).every(Boolean)) {
    return `matrikkel:${matrikkel.join(':')}`;
  }

  return [
    'location',
    featureCoordinateKey(feature),
    normalizedIdentityPart(props.adresse),
    normalizedIdentityPart(unitNumber)
  ].join(':');
}

function certificateTimestamp(feature) {
  const directTimestamp = Number(feature?.properties?.certificateIssuedTimestamp);
  if (Number.isFinite(directTimestamp)) return directTimestamp;
  return parseDateTimestamp(feature?.properties?.utstedelsesdato) ?? Number.NEGATIVE_INFINITY;
}

export function getLatestCertificateFeatures(features) {
  const latestByIdentity = new Map();

  features.forEach((feature) => {
    const key = certificateIdentityKey(feature);
    const current = latestByIdentity.get(key);

    if (!current || certificateTimestamp(feature) > certificateTimestamp(current)) {
      latestByIdentity.set(key, feature);
    }
  });

  return Array.from(latestByIdentity.values());
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
    const matchesCertificateScheme =
      !filters.certificateScheme ||
      filters.certificateScheme === 'all' ||
      props.certificateScheme === filters.certificateScheme;

    return matchesYear && matchesEnergy && matchesEnergyGrade && matchesHeatingGrade && matchesCertificateScheme;
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
