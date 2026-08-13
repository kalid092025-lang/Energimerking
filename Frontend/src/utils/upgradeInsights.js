const CURRENT_ANALYSIS_YEAR = 2026;
const STALE_CERTIFICATE_YEAR = CURRENT_ANALYSIS_YEAR - 10;

const VALID_ENERGY_GRADES = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
const VALID_HEATING_GRADES = new Set(['GREEN', 'YELLOW', 'ORANGE', 'RED']);

const UNIT_NUMBER_KEYS = [
  'bruksenhetsNr',
  'bruksenhetsnummer',
  'BruksenhetsNr',
  'Bruksenhetsnummer',
  'brukenhetsnummer',
  'brukenhetsNR',
  'Brukenhetsnummer',
  'BrukenhetsNR'
];

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function firstValue(properties, keys) {
  for (const key of keys) {
    if (hasValue(properties?.[key])) return properties[key];
  }

  return '';
}

function toNumber(value, fallback = null) {
  if (!hasValue(value)) return fallback;

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeGrade(value) {
  return String(value || '').trim().toUpperCase();
}

function parseCertificateYear(value) {
  if (!hasValue(value)) return null;

  const directYear = toNumber(value);
  if (Number.isFinite(directYear) && directYear >= 1900 && directYear <= CURRENT_ANALYSIS_YEAR) {
    return directYear;
  }

  const text = String(value).trim();
  const isoYear = text.match(/^(\d{4})/);
  if (isoYear) return toNumber(isoYear[1]);

  const localDate = text.match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\D|$)/);
  if (localDate) return toNumber(localDate[3]);

  const timestamp = Date.parse(text);
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp).getUTCFullYear();
  }

  return null;
}

function certificateYearFromProperties(properties) {
  const normalizedYear = toNumber(properties?.certificateIssuedYear);
  if (
    Number.isFinite(normalizedYear) &&
    normalizedYear >= 1900 &&
    normalizedYear <= CURRENT_ANALYSIS_YEAR
  ) {
    return normalizedYear;
  }

  return parseCertificateYear(properties?.utstedelsesdato);
}

function formatEnergyUse(value) {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value)} kWh/m2` : 'N/A';
}

function formatBuildYear(value) {
  return Number.isFinite(value) && value > 0 ? String(Math.round(value)) : 'N/A';
}

function addRecommendation(items, text) {
  if (!items.includes(text)) items.push(text);
}

function driver(tone, label, detail) {
  return { tone, label, detail };
}

function buildConfidence(availableCoreCount, totalCoreCount) {
  if (availableCoreCount >= 4) {
    return {
      level: 'high',
      label: 'High',
      copy: `${availableCoreCount}/${totalCoreCount} core inputs available.`
    };
  }

  if (availableCoreCount === 3) {
    return {
      level: 'medium',
      label: 'Medium',
      copy: `${availableCoreCount}/${totalCoreCount} core inputs available.`
    };
  }

  return {
    level: 'low',
    label: 'Limited',
    copy: `${availableCoreCount}/${totalCoreCount} core inputs available.`
  };
}

export function buildUpgradeInsights(properties = {}) {
  const energyGrade = normalizeGrade(properties.energikarakter);
  const heatingGrade = normalizeGrade(properties.oppvarmingskarakter);
  const energyUse = toNumber(properties.energibruk_kwh_m2 ?? properties.beregnetLevertEnergiTotaltkWhm2);
  const buildYear = toNumber(properties.byggeaar);
  const certificateYear = certificateYearFromProperties(properties);
  const unitNumber = firstValue(properties, UNIT_NUMBER_KEYS);

  const hasEnergyGrade = VALID_ENERGY_GRADES.has(energyGrade);
  const hasHeatingGrade = VALID_HEATING_GRADES.has(heatingGrade);
  const hasEnergyUse = Number.isFinite(energyUse) && energyUse > 0;
  const hasBuildYear = Number.isFinite(buildYear) && buildYear > 0;
  const hasCertificateYear = Number.isFinite(certificateYear);

  const drivers = [];
  const recommendations = [];

  if (!hasEnergyGrade) {
    drivers.push(driver('missing', 'Energy grade missing', 'The priority estimate falls back to a neutral grade input.'));
  } else if (['E', 'F', 'G'].includes(energyGrade)) {
    drivers.push(driver('high', `Energy grade ${energyGrade}`, 'Weak envelope performance is a strong upgrade signal.'));
    addRecommendation(recommendations, 'Check insulation, windows, ventilation heat recovery, and air leakage first.');
  } else if (['C', 'D'].includes(energyGrade)) {
    drivers.push(driver('medium', `Energy grade ${energyGrade}`, 'Moderate performance suggests targeted envelope checks.'));
    addRecommendation(recommendations, 'Check attic insulation, window condition, ventilation settings, and heat recovery potential.');
  } else {
    drivers.push(driver('low', `Energy grade ${energyGrade}`, 'The registered grade lowers the energy-upgrade urgency.'));
    addRecommendation(recommendations, 'Confirm smaller efficiency wins such as controls, sealing, and ventilation tuning.');
  }

  if (!hasEnergyUse) {
    drivers.push(driver('missing', 'Energy use missing', 'kWh/m2 is unavailable, so the estimate relies more on grades and age.'));
  } else if (energyUse >= 300) {
    drivers.push(driver('high', `${formatEnergyUse(energyUse)} energy use`, 'High calculated delivered energy raises the priority.'));
    addRecommendation(recommendations, 'Compare the certificate energy use against similar nearby buildings before selecting measures.');
  } else if (energyUse >= 180) {
    drivers.push(driver('medium', `${formatEnergyUse(energyUse)} energy use`, 'Medium-high calculated energy use supports further inspection.'));
  } else {
    drivers.push(driver('low', `${formatEnergyUse(energyUse)} energy use`, 'Calculated energy use does not dominate this score.'));
  }

  if (!hasHeatingGrade) {
    drivers.push(driver('missing', 'Heating grade missing', 'Heating source quality is unavailable for this estimate.'));
  } else if (['RED', 'ORANGE'].includes(heatingGrade)) {
    drivers.push(driver('high', `${heatingGrade} heating grade`, 'Heating source quality is a strong upgrade signal.'));
    addRecommendation(recommendations, 'Review heating options such as heat pump, district heating, or another renewable/non-direct-electric source.');
  } else if (heatingGrade === 'YELLOW') {
    drivers.push(driver('medium', 'YELLOW heating grade', 'Heating is partly renewable, but there may be room to improve the share.'));
    addRecommendation(recommendations, 'Compare whether increasing renewable heating share would improve the certificate.');
  } else {
    drivers.push(driver('low', 'GREEN heating grade', 'Heating source quality lowers the heating-upgrade urgency.'));
  }

  if (!hasBuildYear) {
    drivers.push(driver('missing', 'Build year missing', 'Age-related envelope risk is unavailable.'));
  } else if (buildYear < 1987) {
    drivers.push(driver('high', `Built ${Math.round(buildYear)}`, 'Older construction year raises envelope inspection priority.'));
    addRecommendation(recommendations, 'Inspect roof, wall, window, and floor heat loss before expensive system changes.');
  } else if (buildYear < 2010) {
    drivers.push(driver('medium', `Built ${Math.round(buildYear)}`, 'Age may still justify targeted envelope checks.'));
  } else {
    drivers.push(driver('low', `Built ${Math.round(buildYear)}`, 'Newer construction year lowers age-related priority.'));
  }

  if (!hasCertificateYear) {
    drivers.push(driver('missing', 'Certificate date unknown', 'The estimate cannot tell whether the certificate reflects recent work.'));
    addRecommendation(recommendations, 'Confirm certificate date and missing inputs before using this as a work list.');
  } else if (certificateYear < STALE_CERTIFICATE_YEAR) {
    drivers.push(driver('medium', `Certificate from ${certificateYear}`, 'Older certificates may not reflect recent upgrades.'));
    addRecommendation(recommendations, 'Verify the current certificate and any recent renovations before planning work.');
  }

  if (recommendations.length === 0) {
    addRecommendation(recommendations, 'Use the score as a screening signal, then verify the certificate data before planning measures.');
  }

  const availableCoreCount = [
    hasEnergyGrade,
    hasHeatingGrade,
    hasEnergyUse,
    hasBuildYear,
    hasCertificateYear
  ].filter(Boolean).length;

  return {
    confidence: buildConfidence(availableCoreCount, 5),
    drivers: drivers.slice(0, 7),
    recommendations: recommendations.slice(0, 4),
    dataUsed: [
      { label: 'Energy grade', value: hasEnergyGrade ? energyGrade : 'Missing', missing: !hasEnergyGrade },
      { label: 'Heating grade', value: hasHeatingGrade ? heatingGrade : 'Missing', missing: !hasHeatingGrade },
      { label: 'Energy use', value: formatEnergyUse(energyUse), missing: !hasEnergyUse },
      { label: 'Built', value: formatBuildYear(buildYear), missing: !hasBuildYear },
      { label: 'Certificate', value: hasCertificateYear ? String(certificateYear) : 'Unknown date', missing: !hasCertificateYear },
      { label: 'Method', value: properties.certificateSchemeLabel || properties.certificateScheme || 'Unknown', missing: !hasValue(properties.certificateSchemeLabel || properties.certificateScheme) },
      { label: 'Material', value: properties.materialvalg || 'Not registered', missing: !hasValue(properties.materialvalg) },
      { label: 'Unit', value: unitNumber || 'Not registered', missing: !hasValue(unitNumber) }
    ]
  };
}
