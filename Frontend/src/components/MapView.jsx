import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Flame, Layers, MapPin, TrendingUp } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchBuildingsBoundsGeoJson, fetchTilePointDetails, fetchTilePointsBounds } from '../services/api.js';
import { useStore } from '../store/useStore.js';
import { buildFeatureCollection, buildNearbyCircleGeoJson, buildNearbyGeoJson } from '../utils/geo.js';
import { normalizeGeoJson } from '../utils/filtering.js';
import { normalizeTilePointsPayload, tileCursorParams } from '../utils/tilePoints.js';
import { buildUpgradeInsights } from '../utils/upgradeInsights.js';
import {
  DARK_MAP_STYLE_URL,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  LAYER_IDS,
  LIGHT_MAP_STYLE_URL,
  MAP_VIEW_MODES,
  SOURCE_IDS
} from '../utils/constants.js';
import '../styles/map-view.css';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function energyClass(grade) {
  const normalized = String(grade || 'unknown').trim().toUpperCase();
  return /^[A-G]$/.test(normalized) ? `energy-${normalized.toLowerCase()}` : 'energy-unknown';
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function displayValue(value, fallback = 'Not registered') {
  return hasValue(value) ? value : fallback;
}

const POPUP_HELP = {
  grade: 'Energy grade runs from A to G. A is best and G is weakest. It is based on calculated delivered energy per square meter for normal use.',
  unit: 'The building unit number, called bruksenhetsnummer/bruksenhetsNr in the source data.',
  energyUse: 'Calculated delivered energy per square meter for normal use, shown as kWh/m2.',
  built: 'The construction year registered for the building or unit.',
  address: 'The registered street address for this building or unit.',
  municipality: 'The municipality name when available.',
  gard: 'Norwegian property register farm number.',
  bruk: 'Norwegian property register usage number.',
  feste: 'Leasehold number from the property register, when registered.',
  andel: 'Share number from the property register, when registered.',
  seksjon: 'Section number from the property register, often used for condominiums/sections.',
  organisation: 'Organisation number connected to the registered certificate, when available.',
  certificate: 'Energy certificate identifier from Enova/energy marking data.',
  issued: 'Date when the energy certificate was issued.',
  heatingGrade: 'Heating grade is the red-to-green score for the installed heating system. Green is best and it is independent of the energy grade.',
  material: 'Registered material or construction information, when present.'
};

function popupHelp(text) {
  if (!text) return '';

  return `<button type="button" class="popup-help" title="${escapeHtml(text)}" aria-label="${escapeHtml(text)}">?</button>`;
}

function popupLabel(label, tooltip = '') {
  return `<span class="popup-label-text">${escapeHtml(label)}${popupHelp(tooltip)}</span>`;
}

function popupDetail(label, value, tooltip = '') {
  if (!hasValue(value)) return '';

  const valueClass = hasValue(value) ? 'popup-value' : 'popup-value popup-value-empty';
  return `
    <div class="popup-detail">
      <span class="popup-label">${popupLabel(label, tooltip)}</span>
      <strong class="${valueClass}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function popupMetric(label, value, modifier = '', tooltip = '') {
  const metricClass = ['popup-metric', modifier].filter(Boolean).join(' ');
  const valueClass = hasValue(value) ? 'popup-metric-value' : 'popup-metric-value popup-value-empty';
  return `
    <div class="${metricClass}">
      <span>${popupLabel(label, tooltip)}</span>
      <strong class="${valueClass}">${escapeHtml(displayValue(value, 'N/A'))}</strong>
    </div>
  `;
}

function markerPopupMetric(label, value, tooltip = '') {
  const valueClass = hasValue(value) ? 'marker-popup-metric-value' : 'marker-popup-metric-value popup-value-empty';
  return `
    <div class="marker-popup-metric">
      <span class="marker-popup-metric-label">${popupLabel(label, tooltip)}</span>
      <strong class="${valueClass}">${escapeHtml(displayValue(value, 'N/A'))}</strong>
    </div>
  `;
}

function markerPopupDetail(label, value, tooltip = '') {
  if (!hasValue(value)) return '';

  return `
    <div class="marker-popup-detail">
      <span class="marker-popup-detail-label">${popupLabel(label, tooltip)}</span>
      <strong class="marker-popup-detail-value">${escapeHtml(value)}</strong>
    </div>
  `;
}

function firstPopulated(...values) {
  return values.find((value) => hasValue(value));
}

function popupHtml(properties) {
  const address = escapeHtml(displayValue(properties.adresse, 'Unknown address'));
  const municipality = hasValue(properties.kommunenavn) ? escapeHtml(properties.kommunenavn) : '';
  const energyGrade = displayValue(properties.energikarakter, 'N/A');
  const energyGradeDisplay = escapeHtml(energyGrade);
  const energyGradeClass = energyClass(energyGrade);
  const energyUse = properties.beregnetLevertEnergiTotaltkWhm2 ?? properties.energibruk_kwh_m2;
  const unitNumber = firstPopulated(
    properties.bruksenhetsNr,
    properties.bruksenhetsnummer,
    properties.BruksenhetsNr,
    properties.Bruksenhetsnummer,
    properties.brukenhetsnummer,
    properties.brukenhetsNR,
    properties.Brukenhetsnummer,
    properties.BrukenhetsNR
  );

  return `
    <article class="popup-card marker-popup">
      <div class="marker-popup-header">
        <div class="marker-popup-heading">
          <div class="marker-popup-meta">
            <span class="marker-popup-kicker">Energy certificate</span>
            ${municipality ? `<span class="marker-popup-place">${municipality}</span>` : ''}
          </div>
          <h2 class="marker-popup-title">${address}</h2>
        </div>
        <div class="marker-popup-grade ${energyGradeClass}">
          <span>Grade</span>
          <strong>${energyGradeDisplay}</strong>
        </div>
      </div>
      <div class="marker-popup-snapshot" aria-label="Building summary">
        ${markerPopupMetric('Unit', unitNumber, POPUP_HELP.unit)}
        ${markerPopupMetric('Energy use', energyUse, POPUP_HELP.energyUse)}
        ${markerPopupMetric('Built', properties.byggeaar, POPUP_HELP.built)}
      </div>
      <div class="marker-popup-body">
        <div class="marker-popup-section-title">Certificate details</div>
        <div class="marker-popup-detail-list">
          ${markerPopupDetail('Address', properties.adresse, POPUP_HELP.address)}
          ${markerPopupDetail('Municipality', properties.kommunenavn, POPUP_HELP.municipality)}
          ${markerPopupDetail('Gnr.', properties.gard)}
          ${markerPopupDetail('Bnr.', properties.bruksnummer, POPUP_HELP.bruk)}
          ${markerPopupDetail('Festenr.', properties.feste, POPUP_HELP.feste)}
          ${markerPopupDetail('Andel', properties.andel, POPUP_HELP.andel)}
          ${markerPopupDetail('Seksjon', properties.seksjon, POPUP_HELP.seksjon)}
          ${markerPopupDetail('Organisation no.', properties.organisasjonsNr, POPUP_HELP.organisation)}
          ${markerPopupDetail('Certificate no.', properties.attestnummer, POPUP_HELP.certificate)}
          ${markerPopupDetail('Issued', properties.utstedelsesdato, POPUP_HELP.issued)}
          ${markerPopupDetail('Heating grade', properties.oppvarmingskarakter, POPUP_HELP.heatingGrade)}
          ${markerPopupDetail('Material', properties.materialvalg, POPUP_HELP.material)}
        </div>
      </div>
    </article>
  `;
}

function priorityClass(score) {
  if (score >= 75) return 'priority-high';
  if (score >= 45) return 'priority-medium';
  return 'priority-low';
}

function priorityLabel(score) {
  if (score >= 75) return 'High priority';
  if (score >= 45) return 'Medium priority';
  return 'Low priority';
}

function scoreBar(label, score) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));

  return `
    <div class="score-row">
      <div class="score-row-label">
        <span>${escapeHtml(label)}</span>
        <strong>${safeScore}/100</strong>
      </div>
      <div class="score-track">
        <div class="score-fill ${priorityClass(safeScore)}" style="width: ${safeScore}%"></div>
      </div>
    </div>
  `;
}

function upgradeDriverRows(drivers) {
  return drivers
    .map((item) => `
      <div class="upgrade-driver driver-${escapeHtml(item.tone)}">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.detail)}</span>
      </div>
    `)
    .join('');
}

function upgradeRecommendationItems(recommendations) {
  return recommendations
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
}

function upgradeDataRows(dataUsed) {
  return dataUsed
    .map((item) => `
      <div class="upgrade-data-item ${item.missing ? 'is-missing' : ''}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(displayValue(item.value, 'N/A'))}</strong>
      </div>
    `)
    .join('');
}

function upgradePopupHtml(properties) {
  const address = escapeHtml(displayValue(properties.adresse, 'Unknown address'));
  const energyUse = properties.beregnetLevertEnergiTotaltkWhm2 ?? properties.energibruk_kwh_m2;
  const score = Math.max(0, Math.min(100, Number(properties.upgradeScore) || 0));
  const priority = properties.upgradePriority || priorityLabel(score);
  const insights = buildUpgradeInsights(properties);

  return `
    <div class="popup-card popup-card-upgrade">
      <div class="popup-header">
        <div class="popup-heading">
          <div class="popup-kicker">Upgrade priority</div>
          <div class="popup-title">${address}</div>
          <div class="popup-subtitle">Heuristic estimate from certificate, heating, energy use, age, and data completeness.</div>
        </div>
        <div class="priority-badge ${priorityClass(score)}">
          <span>${escapeHtml(priority)}</span>
          <strong>${score}</strong>
        </div>
      </div>

      <div class="upgrade-confidence">
        <div>
          <div class="upgrade-confidence-label">Estimate confidence</div>
          <strong>${escapeHtml(insights.confidence.label)}</strong>
          <span>${escapeHtml(insights.confidence.copy)}</span>
        </div>
        <div class="upgrade-confidence-pill confidence-${escapeHtml(insights.confidence.level)}">
          ${escapeHtml(insights.confidence.label)}
        </div>
      </div>

      <div class="popup-metrics">
        ${popupMetric('Energy grade', properties.energikarakter, 'popup-metric-compact', POPUP_HELP.grade)}
        ${popupMetric('Heating grade', properties.oppvarmingskarakter, 'popup-metric-compact', POPUP_HELP.heatingGrade)}
        ${popupMetric('Energy use', energyUse, 'popup-metric-compact', POPUP_HELP.energyUse)}
        ${popupMetric('Built', properties.byggeaar, 'popup-metric-compact', POPUP_HELP.built)}
      </div>

      <div class="score-breakdown">
        ${scoreBar('Total priority', score)}
        ${scoreBar('Energy upgrade need', properties.energyUpgradeScore)}
        ${scoreBar('Heating upgrade need', properties.heatingUpgradeScore)}
      </div>

      <div class="upgrade-section">
        <div class="popup-kicker">Main drivers</div>
        <div class="upgrade-drivers">
          ${upgradeDriverRows(insights.drivers)}
        </div>
      </div>

      <div class="upgrade-actions">
        <div class="popup-kicker">Recommended checks</div>
        <ul>${upgradeRecommendationItems(insights.recommendations)}</ul>
      </div>

      <div class="upgrade-section">
        <div class="popup-kicker">Data used</div>
        <div class="upgrade-data-grid">
          ${upgradeDataRows(insights.dataUsed)}
        </div>
      </div>
    </div>
  `;
}

function popupHtmlForMode(properties, mode) {
  return mode === 'upgrade' ? upgradePopupHtml(properties) : popupHtml(properties);
}

function tilePopupHtml(properties) {
  return popupHtml(properties);
}

function tileDetailId(feature) {
  const properties = feature?.properties || {};
  return properties.denormId || properties.id || feature?.id || null;
}

function tileDetailFeatureFromPayloadForClick(payload, id, fallbackFeature) {
  const normalized = normalizeGeoJson(payload);
  const byId = findFeatureById(normalized.features, id);
  if (byId) return byId;

  const fallbackCoordinateKey = coordinateKey(fallbackFeature);
  const fallbackAddress = String(fallbackFeature?.properties?.adresse || '').trim().toLowerCase();
  const byCoordinateAndAddress = normalized.features.find((feature) => (
    coordinateKey(feature) === fallbackCoordinateKey &&
    (!fallbackAddress || String(feature.properties?.adresse || '').trim().toLowerCase() === fallbackAddress)
  ));

  return byCoordinateAndAddress || normalized.features[0] || null;
}

async function fetchTileDetailPayload(feature, options = {}) {
  const detailId = tileDetailId(feature);

  if (detailId) {
    try {
      return await fetchTilePointDetails(detailId, options);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }

  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  const lon = Number(longitude);
  const lat = Number(latitude);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  return fetchBuildingsBoundsGeoJson({
    minLatitude: lat - TILE_DETAIL_BOUNDS_PADDING_DEGREES,
    minLongitude: lon - TILE_DETAIL_BOUNDS_PADDING_DEGREES,
    maxLatitude: lat + TILE_DETAIL_BOUNDS_PADDING_DEGREES,
    maxLongitude: lon + TILE_DETAIL_BOUNDS_PADDING_DEGREES,
    amount: TILE_DETAIL_FALLBACK_AMOUNT
  }, options);
}

function idsMatch(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right);
}

function findFeatureById(features, id) {
  return features.find((item) => idsMatch(item.id, id) || idsMatch(item.properties?.id, id));
}

function coordinateKey(feature) {
  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  if (!Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude))) return '';
  return `${Number(longitude).toFixed(5)}-${Number(latitude).toFixed(5)}`;
}

function findUnitsAtFeatureLocation(features, selectedFeature) {
  const selectedKey = coordinateKey(selectedFeature);
  if (!selectedKey) return [];

  return features
    .filter((feature) => coordinateKey(feature) === selectedKey)
    .sort((left, right) => {
      const leftUnit = left.properties?.bruksenhetsNr || '';
      const rightUnit = right.properties?.bruksenhetsNr || '';
      return leftUnit.localeCompare(rightUnit, undefined, { numeric: true });
    });
}

function findUnitsAtCoordinates(features, coordinates) {
  return findUnitsAtFeatureLocation(features, {
    geometry: {
      coordinates
    }
  });
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percentile(values, targetPercentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * targetPercentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function ascendingStops(values) {
  let previous = 0;
  return values.map((value) => {
    const nextValue = Math.max(1, Math.round(Number(value) || 0));
    previous = Math.max(previous + 1, nextValue);
    return previous;
  });
}

function buildHeatmapData(features) {
  const grouped = new Map();

  features.forEach((feature) => {
    const key = coordinateKey(feature);
    const energyUse = Number(feature.properties?.energibruk_kwh_m2);
    if (!key || !Number.isFinite(energyUse) || energyUse <= 0) return;

    if (!grouped.has(key)) {
      grouped.set(key, {
        coordinates: feature.geometry.coordinates,
        values: []
      });
    }

    grouped.get(key).values.push(energyUse);
  });

  const aggregatedFeatures = Array.from(grouped.entries()).map(([key, group]) => {
    const heatmapEnergy = median(group.values);

    return {
      type: 'Feature',
      id: `heatmap-${key}`,
      geometry: {
        type: 'Point',
        coordinates: group.coordinates
      },
      properties: {
        id: `heatmap-${key}`,
        heatmapEnergy,
        unitCount: group.values.length
      }
    };
  });

  const values = aggregatedFeatures.map((feature) => feature.properties.heatmapEnergy);
  const [p50, p80, p95] = ascendingStops([
    percentile(values, 0.5),
    percentile(values, 0.8),
    percentile(values, 0.95)
  ]);

  return {
    collection: buildFeatureCollection(aggregatedFeatures),
    stats: {
      p50,
      p80,
      p95,
      count: aggregatedFeatures.length
    }
  };
}

function heatmapWeightExpression(stats) {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'heatmapEnergy'], 0],
    0,
    0.14,
    stats.p50,
    0.42,
    stats.p80,
    0.72,
    stats.p95,
    1
  ];
}

function heatmapPointColorExpression(stats) {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'energibruk_kwh_m2'], ['get', 'heatmapEnergy'], 0],
    0,
    '#7dd3fc',
    stats.p50,
    '#2dd4bf',
    stats.p80,
    '#fde047',
    stats.p95,
    '#ef4444'
  ];
}

function unitsToListPayload(units) {
  return JSON.stringify(
    units.map((unit) => {
      const props = unit.properties || unit;

      return {
        id: unit.id || props.id || props.coordinateid || props.Coordinateid || props.CoordinateId,
        adresse: props.adresse || props.Adresse || '',
        poststed: props.poststed || props.Poststed || '',
        kommunenavn: props.kommunenavn || props.Kommunenavn || '',
        bruksenhetsNr: firstPopulated(
          props.brukenhetsnummer,
          props.brukenhetsNR,
          props.bruksenhetsNr,
          props.bruksenhetsnummer,
          props.Brukenhetsnummer,
          props.BrukenhetsNR,
          props.BruksenhetsNr,
          props.Bruksenhetsnummer
        ) || '',
        energikarakter: props.energikarakter || props.Energikarakter || '',
        distanceInMeters: props.distanceInMeters
      };
    })
  );
}

function nearbyPopupHtml(properties) {
  const coordinateId = escapeHtml(properties.coordinateid ?? 'unknown');
  const latitude = escapeHtml(properties.latitude ?? 'N/A');
  const longitude = escapeHtml(properties.longitude ?? 'N/A');
  const unitCount = properties.unitCount ?? 1;
  
  let html = `
    <div class="popup-card popup-card-small">
      <div class="popup-kicker">Nearby result</div>
      <div class="popup-title">Coordinate #${coordinateId}</div>
      <div class="popup-subtitle">Lat ${latitude}, Lng ${longitude}</div>
  `;
  
  if (unitCount > 1) {
    html += `<div class="popup-grid"><div class="popup-metric"><span>Building units</span><strong>${unitCount}</strong></div></div>`;
  } else {
    const unitNumber = escapeHtml(firstPopulated(
      properties.brukenhetsnummer,
      properties.brukenhetsNR,
      properties.bruksenhetsNr,
      properties.bruksenhetsnummer,
      properties.Brukenhetsnummer,
      properties.BrukenhetsNR,
      properties.BruksenhetsNr,
      properties.Bruksenhetsnummer
    ) || 'N/A');
    html += `
      <div class="popup-grid">
        <div class="popup-metric"><span>Unit number</span><strong>${unitNumber}</strong></div>
      </div>
    `;
  }
  
  html += `</div>`;
  return html;
}

function nearbyUnitsListHtml(units, address = 'Unknown address', coordinates = [0, 0]) {
  const parsedUnits = JSON.parse(units);
  const addressDisplay = escapeHtml(address);
  const unitsHtml = parsedUnits
    .map(
      (u) => `
      <div class="nearby-unit-item" data-coordinateid="${u.id}">
        <div class="nearby-unit-row">
          <div class="nearby-unit-title">${escapeHtml(u.adresse || 'Unknown address')}</div>
          ${
            u.energikarakter
              ? `<div class="energy-badge energy-badge-small ${energyClass(u.energikarakter)}">${escapeHtml(u.energikarakter)}</div>`
              : ''
          }
        </div>
        ${
          u.bruksenhetsNr || u.poststed || u.kommunenavn
            ? `<div class="nearby-unit-location">${escapeHtml([u.bruksenhetsNr ? `Unit ${u.bruksenhetsNr}` : '', u.poststed, u.kommunenavn].filter(Boolean).join(' | '))}</div>`
            : ''
        }
        ${
          Number.isFinite(Number(u.distanceInMeters))
            ? `<div class="nearby-unit-distance">${Number(u.distanceInMeters).toFixed(0)} m</div>`
            : ''
        }
      </div>
    `
    )
    .join('');
  
  return `
    <div class="popup-card popup-card-units" data-lng="${coordinates[0]}" data-lat="${coordinates[1]}">
      <div class="popup-kicker">Building units at location</div>
      <div class="popup-title">${addressDisplay}</div>
      <div class="popup-subtitle"><strong>${parsedUnits.length}</strong> units</div>
      <div class="nearby-units-list">
        ${unitsHtml}
      </div>
    </div>
  `;
}

function keepPopupInView(map, popup) {
  requestAnimationFrame(() => {
    const popupElement = popup.getElement();
    const containerElement = map.getContainer();
    if (!popupElement || !containerElement) return;

    const popupRect = popupElement.getBoundingClientRect();
    const containerRect = containerElement.getBoundingClientRect();
    const popupCenterX = popupRect.left + popupRect.width / 2;
    const popupCenterY = popupRect.top + popupRect.height / 2;
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;

    map.panBy(
      [
        popupCenterX - containerCenterX,
        popupCenterY - containerCenterY
      ],
      {
        duration: 360,
        essential: true
      }
    );
  });
}

function openPopup(map, coordinates, html) {
  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    offset: 18,
    maxWidth: 'none'
  })
    .setLngLat(coordinates)
    .setHTML(html)
    .addTo(map);

  popup._energimerkingState = {
    coordinates: Array.isArray(coordinates) ? coordinates.slice() : [coordinates.lng, coordinates.lat],
    html
  };

  keepPopupInView(map, popup);
  return popup;
}

function formatEnergy(value) {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value)} kWh/m2` : 'N/A';
}

function MapLegend({ heatmapStats }) {
  const viewMode = useStore((state) => state.viewMode);
  const bydelDisplayMode = useStore((state) => state.bydelDisplayMode);
  const showHeatmapLegend = viewMode === 'heatmap' || (viewMode === 'markers' && bydelDisplayMode === 'heatmap');
  const heatmapStart = formatEnergy(heatmapStats.p50);
  const heatmapEnd = `${formatEnergy(heatmapStats.p95)}+`;

  return (
    <div className="map-legend">
      <div className="legend-kicker">Information card</div>
      {showHeatmapLegend ? (
        <>
          <div className="legend-copy">Energy use per building location</div>
          <div className="legend-gradient" />
          <div className="legend-scale">
            <span>
              <strong>{heatmapStart}</strong>
              <small>lower</small>
            </span>
            <span>
              <strong>{heatmapEnd}</strong>
              <small>higher</small>
            </span>
          </div>
        </>
      ) : (
        viewMode === 'tiles' ? (
          <div className="legend-list">
            <div className="legend-item"><span className="legend-dot dot-building" />Tile-mode building points</div>
            <div className="legend-copy">Colored by energy grade from the tile properties.</div>
          </div>
        ) : viewMode === 'upgrade' ? (
          <>
            <div className="legend-copy">Heuristic priority from existing certificate data. Building cards explain the score.</div>
            <div className="legend-gradient priority-gradient" />
            <div className="legend-scale">
              <span>
                <strong>Low</strong>
                <small>better condition</small>
              </span>
              <span>
                <strong>High</strong>
                <small>inspect first</small>
              </span>
            </div>
          </>
        ) : (
          <div className="legend-list">
            <div className="legend-item"><span className="legend-dot dot-cluster-small" />Small cluster / individual</div>
            <div className="legend-item"><span className="legend-dot dot-cluster-medium" />Medium cluster</div>
            <div className="legend-item"><span className="legend-dot dot-cluster-large" />Large cluster</div>
            <div className="legend-item"><span className="legend-dot dot-nearby" />radios result</div>
          </div>
        )
      )}
    </div>
  );
}

const MODE_ICONS = {
  markers: MapPin,
  heatmap: Flame,
  tiles: Layers,
  upgrade: TrendingUp
};

const MODE_DOCK_ITEMS = MAP_VIEW_MODES.map((item) => ({
  ...item,
  Icon: MODE_ICONS[item.value]
}));

function CollapsedModeDock() {
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const viewMode = useStore((state) => state.viewMode);
  const setViewMode = useStore((state) => state.setViewMode);

  if (sidebarOpen) return null;

  return (
    <div className="collapsed-mode-dock" aria-label="Map view modes">
      {MODE_DOCK_ITEMS.map((item) => {
        const Icon = item.Icon;

        return (
          <button
            key={item.value}
            type="button"
            className={[
              'collapsed-mode-button',
              viewMode === item.value ? 'active' : '',
              item.isolated ? 'is-tiles-mode' : ''
            ].filter(Boolean).join(' ')}
            onClick={() => setViewMode(item.value)}
            aria-label={item.label}
            aria-pressed={viewMode === item.value}
            data-mode={item.value}
            title={item.label}
          >
            <Icon className="mode-icon" aria-hidden="true" strokeWidth={2.2} />
          </button>
        );
      })}
    </div>
  );
}

function mapStyleUrlForTheme(theme) {
  return theme === 'dark' ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL;
}

function setLayerVisibility(map, layerId, visibility) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visibility);
  }
}

const MIN_GEOJSON_TILE_ZOOM = 12;
const TILE_POINT_FIRST_BATCH_LIMIT = 250;
const TILE_POINT_BACKGROUND_BATCH_LIMIT = 500;
const TILE_POINT_MAX_REQUESTS_PER_BOUNDS = 2;
const TILE_POINT_RENDER_LIMIT = 15000;
const TILE_POINT_LOAD_GRID_COLUMNS = 5;
const TILE_POINT_LOAD_GRID_ROWS = 4;
const TILE_POINT_RENDER_GRID_COLUMNS = 5;
const TILE_POINT_RENDER_GRID_ROWS = 4;
const TILE_POINT_FETCH_CONCURRENCY = 6;
const MAX_GEOJSON_TILE_CACHE_ENTRIES = 54;
const MAX_GEOJSON_TILE_LOADED_AREAS = 54;
const GEOJSON_TILE_MOVE_DEBOUNCE_MS = 700;
const GEOJSON_TILE_CACHE_ZOOM_STEP = 0.5;
const GEOJSON_TILE_CACHE_BOUNDS_STEP_DEGREES = 0.005;
const TILE_DETAIL_BOUNDS_PADDING_DEGREES = 0.00008;
const TILE_DETAIL_FALLBACK_AMOUNT = 250;

function snapNumber(value, step, decimals) {
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function snapBoundsOut(bounds, step) {
  return {
    west: Number((Math.floor(bounds.west / step) * step).toFixed(3)),
    south: Number((Math.floor(bounds.south / step) * step).toFixed(3)),
    east: Number((Math.ceil(bounds.east / step) * step).toFixed(3)),
    north: Number((Math.ceil(bounds.north / step) * step).toFixed(3))
  };
}

function boundsKey(bounds) {
  return [
    bounds.west.toFixed(4),
    bounds.south.toFixed(4),
    bounds.east.toFixed(4),
    bounds.north.toFixed(4)
  ].join(':');
}

function boundsFromKey(key) {
  const [west, south, east, north] = String(key).split(':').map(Number);

  if (![west, south, east, north].every(Number.isFinite)) {
    return null;
  }

  return { west, south, east, north };
}

function isValidBounds(bounds) {
  return bounds.east - bounds.west > 0.0001 && bounds.north - bounds.south > 0.0001;
}

function boundsOverlap(left, right) {
  return (
    left.west < right.east &&
    left.east > right.west &&
    left.south < right.north &&
    left.north > right.south
  );
}

function subtractBounds(bounds, coveredBounds) {
  if (!boundsOverlap(bounds, coveredBounds)) return [bounds];

  const overlap = {
    west: Math.max(bounds.west, coveredBounds.west),
    south: Math.max(bounds.south, coveredBounds.south),
    east: Math.min(bounds.east, coveredBounds.east),
    north: Math.min(bounds.north, coveredBounds.north)
  };
  const missingBounds = [];

  if (bounds.west < overlap.west) {
    missingBounds.push({ west: bounds.west, south: bounds.south, east: overlap.west, north: bounds.north });
  }
  if (overlap.east < bounds.east) {
    missingBounds.push({ west: overlap.east, south: bounds.south, east: bounds.east, north: bounds.north });
  }
  if (bounds.south < overlap.south) {
    missingBounds.push({ west: overlap.west, south: bounds.south, east: overlap.east, north: overlap.south });
  }
  if (overlap.north < bounds.north) {
    missingBounds.push({ west: overlap.west, south: overlap.north, east: overlap.east, north: bounds.north });
  }

  return missingBounds.filter(isValidBounds);
}

function missingBoundsForViewport(viewportBounds, loadedBoundsList) {
  return loadedBoundsList.reduce(
    (missingBounds, loadedBounds) => missingBounds.flatMap((bounds) => subtractBounds(bounds, loadedBounds)),
    [viewportBounds]
  );
}

function rememberTileLoadedBounds(loadedBoundsList, bounds) {
  return [...loadedBoundsList, bounds].slice(-MAX_GEOJSON_TILE_LOADED_AREAS);
}

function splitBoundsIntoGrid(bounds, columns = TILE_POINT_LOAD_GRID_COLUMNS, rows = TILE_POINT_LOAD_GRID_ROWS) {
  const width = (bounds.east - bounds.west) / columns;
  const height = (bounds.north - bounds.south) / rows;
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = {
        west: bounds.west + (width * column),
        south: bounds.south + (height * row),
        east: column === columns - 1 ? bounds.east : bounds.west + (width * (column + 1)),
        north: row === rows - 1 ? bounds.north : bounds.south + (height * (row + 1))
      };

      if (isValidBounds(cell)) {
        cells.push(cell);
      }
    }
  }

  return cells;
}

function splitMissingBoundsForTileRequests(missingBounds) {
  return missingBounds.flatMap((bounds) => splitBoundsIntoGrid(bounds));
}

function tileViewportRequest(map) {
  const rawZoom = map.getZoom();
  const zoom = Number(rawZoom.toFixed(1));

  if (zoom < MIN_GEOJSON_TILE_ZOOM) {
    return {
      shouldLoad: false,
      key: `below:${zoom}`
    };
  }

  const bounds = map.getBounds();
  const cacheZoom = snapNumber(rawZoom, GEOJSON_TILE_CACHE_ZOOM_STEP, 1);
  const viewportBounds = snapBoundsOut({
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth()
  }, GEOJSON_TILE_CACHE_BOUNDS_STEP_DEGREES);
  const key = [cacheZoom.toFixed(1), boundsKey(viewportBounds)].join(':');

  return {
    shouldLoad: true,
    key,
    bounds: viewportBounds
  };
}

function readTileCache(cache, key) {
  if (!cache.has(key)) return null;

  const entry = normalizeTileCacheEntry(cache.get(key));
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function normalizeTileCacheEntry(entry) {
  if (Array.isArray(entry)) {
    return {
      features: entry,
      nextCursor: null,
      complete: false
    };
  }

  return {
    features: Array.isArray(entry?.features) ? entry.features : [],
    nextCursor: entry?.nextCursor || null,
    complete: Boolean(entry?.complete)
  };
}

function writeTileCache(cache, key, entry) {
  cache.set(key, normalizeTileCacheEntry(entry));

  while (cache.size > MAX_GEOJSON_TILE_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function isFeatureInsideBounds(feature, bounds) {
  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  const lon = Number(longitude);
  const lat = Number(latitude);

  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= bounds.west &&
    lon <= bounds.east &&
    lat >= bounds.south &&
    lat <= bounds.north
  );
}

function tileRenderBucketIndex(feature, bounds) {
  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  const lon = Number(longitude);
  const lat = Number(latitude);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return -1;

  const lonSpan = bounds.east - bounds.west || 1;
  const latSpan = bounds.north - bounds.south || 1;
  const column = Math.max(
    0,
    Math.min(TILE_POINT_RENDER_GRID_COLUMNS - 1, Math.floor(((lon - bounds.west) / lonSpan) * TILE_POINT_RENDER_GRID_COLUMNS))
  );
  const row = Math.max(
    0,
    Math.min(TILE_POINT_RENDER_GRID_ROWS - 1, Math.floor(((lat - bounds.south) / latSpan) * TILE_POINT_RENDER_GRID_ROWS))
  );

  return (row * TILE_POINT_RENDER_GRID_COLUMNS) + column;
}

function evenlyCapTileFeatures(features, bounds, limit) {
  const bucketCount = TILE_POINT_RENDER_GRID_COLUMNS * TILE_POINT_RENDER_GRID_ROWS;
  const buckets = Array.from({ length: bucketCount }, () => []);

  features.forEach((feature) => {
    const bucketIndex = tileRenderBucketIndex(feature, bounds);
    if (bucketIndex >= 0) {
      buckets[bucketIndex].push(feature);
    }
  });

  const capped = [];
  const baseQuota = Math.max(1, Math.floor(limit / bucketCount));

  buckets.forEach((bucket) => {
    capped.push(...bucket.slice(0, baseQuota));
  });

  let offset = baseQuota;
  while (capped.length < limit) {
    let added = false;

    for (const bucket of buckets) {
      if (capped.length >= limit) break;
      if (offset < bucket.length) {
        capped.push(bucket[offset]);
        added = true;
      }
    }

    if (!added) break;
    offset += 1;
  }

  return capped;
}

function capTileFeaturesForViewport(features, bounds) {
  const visibleFeatures = features.filter((feature) => isFeatureInsideBounds(feature, bounds));

  if (visibleFeatures.length <= TILE_POINT_RENDER_LIMIT) {
    return visibleFeatures;
  }

  return evenlyCapTileFeatures(visibleFeatures, bounds, TILE_POINT_RENDER_LIMIT);
}

function cachedTileFeaturesForViewport(cache, viewportBounds) {
  let features = [];

  cache.forEach((entry, key) => {
    const cachedBounds = boundsFromKey(key);
    if (!cachedBounds || !boundsOverlap(viewportBounds, cachedBounds)) return;

    const cachedFeatures = normalizeTileCacheEntry(entry).features;
    features = mergeUniqueTileFeatures(features, cachedFeatures);
  });

  return features;
}

function cachedBoundsForViewport(cache, viewportBounds) {
  const cachedBoundsList = [];

  cache.forEach((entry, key) => {
    const cachedBounds = boundsFromKey(key);
    if (!cachedBounds || !boundsOverlap(viewportBounds, cachedBounds)) return;
    if (!normalizeTileCacheEntry(entry).complete) return;

    cachedBoundsList.push(cachedBounds);
  });

  return cachedBoundsList;
}

function normalizedTileKeyPart(value) {
  return value === null || value === undefined ? '' : String(value).trim().toLowerCase();
}

function normalizedTileCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : '';
}

function tileFeatureKey(feature) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];
  const explicitId = normalizedTileKeyPart(feature?.id || properties.denormId || properties.id);

  if (explicitId) {
    return `id:${explicitId}`;
  }

  const stableParts = [
    properties.kommunenummer,
    properties.gard,
    properties.bruksnummer,
    properties.feste,
    properties.andel,
    properties.seksjon,
    properties.bruksenhetsNr || properties.brukenhetsnummer,
    properties.adresse,
    normalizedTileCoordinate(coordinates[0]),
    normalizedTileCoordinate(coordinates[1])
  ].map(normalizedTileKeyPart);

  if (stableParts.some(Boolean)) {
    return stableParts.join('|');
  }

  return '';
}

function mergeUniqueTileFeatures(existingFeatures, nextFeatures) {
  const seenKeys = new Set(existingFeatures.map(tileFeatureKey));
  const mergedFeatures = [...existingFeatures];

  nextFeatures.forEach((feature) => {
    const key = tileFeatureKey(feature);
    if (seenKeys.has(key)) return;

    seenKeys.add(key);
    mergedFeatures.push(feature);
  });

  return mergedFeatures;
}

function syncMapDataAndVisibility(map, {
  featureCollection,
  heatmapCollection,
  heatmapStats,
  nearbyCollection,
  nearbyCircleCollection,
  selectedFeature,
  viewMode,
  bydelDisplayMode
}) {
  if (!map?.isStyleLoaded()) return;

  map.getSource(SOURCE_IDS.buildings)?.setData(featureCollection);
  map.getSource(SOURCE_IDS.heatmapBuildings)?.setData(heatmapCollection);
  map.getSource(SOURCE_IDS.upgradeBuildings)?.setData(featureCollection);
  map.getSource(SOURCE_IDS.nearby)?.setData(nearbyCollection);
  map.getSource(SOURCE_IDS.nearbyCircle)?.setData(nearbyCircleCollection);
  map.getSource(SOURCE_IDS.selected)?.setData(
    selectedFeature ? buildFeatureCollection([selectedFeature]) : buildFeatureCollection([])
  );

  if (map.getLayer(LAYER_IDS.heatmap)) {
    map.setPaintProperty(LAYER_IDS.heatmap, 'heatmap-weight', heatmapWeightExpression(heatmapStats));
  }
  if (map.getLayer(LAYER_IDS.heatmapPoints)) {
    map.setPaintProperty(LAYER_IDS.heatmapPoints, 'circle-color', heatmapPointColorExpression(heatmapStats));
  }
  if (map.getLayer(LAYER_IDS.heatmapLocations)) {
    map.setPaintProperty(LAYER_IDS.heatmapLocations, 'circle-color', heatmapPointColorExpression(heatmapStats));
  }

  const bydelHeatmapActive = viewMode === 'heatmap' || (viewMode === 'markers' && bydelDisplayMode === 'heatmap');
  const bydelClustersActive = viewMode === 'markers' && bydelDisplayMode !== 'heatmap';
  const markerVisibility = bydelClustersActive ? 'visible' : 'none';
  const heatmapVisibility = bydelHeatmapActive ? 'visible' : 'none';
  const tileVisibility = viewMode === 'tiles' ? 'visible' : 'none';
  const upgradeVisibility = viewMode === 'upgrade' ? 'visible' : 'none';
  const nearbyCircleVisibility = viewMode === 'tiles' ? 'none' : 'visible';

  setLayerVisibility(map, LAYER_IDS.clusters, markerVisibility);
  setLayerVisibility(map, LAYER_IDS.clusterCount, markerVisibility);
  setLayerVisibility(map, LAYER_IDS.points, markerVisibility);
  setLayerVisibility(map, LAYER_IDS.heatmap, heatmapVisibility);
  setLayerVisibility(map, LAYER_IDS.heatmapLocations, heatmapVisibility);
  setLayerVisibility(map, LAYER_IDS.heatmapPoints, heatmapVisibility);
  setLayerVisibility(map, LAYER_IDS.upgradePriorityPoints, upgradeVisibility);
  setLayerVisibility(map, LAYER_IDS.energyTilePoints, tileVisibility);
  setLayerVisibility(map, LAYER_IDS.nearbyCircle, nearbyCircleVisibility);
}

function addSourceIfMissing(map, sourceId, source) {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, source);
  }
}

function addLayerIfMissing(map, layer) {
  if (!map.getLayer(layer.id)) {
    map.addLayer(layer);
  }
}

const MAP_PIN_IMAGES = [
  ['map-pin-marker', '#1a73e8'],
  ['map-pin-upgrade-low', '#22c55e'],
  ['map-pin-upgrade-mid', '#facc15'],
  ['map-pin-upgrade-high', '#f97316'],
  ['map-pin-upgrade-critical', '#dc2626'],
  ['map-pin-selected', '#fbbc04'],
  ['map-pin-nearby', '#ea4335'],
  ['energy-pin-a', '#15803d'],
  ['energy-pin-b', '#22c55e'],
  ['energy-pin-c', '#84cc16'],
  ['energy-pin-d', '#facc15'],
  ['energy-pin-e', '#f97316'],
  ['energy-pin-f', '#dc2626'],
  ['energy-pin-g', '#991b1b'],
  ['energy-pin-default', '#64748b']
];

function createEnergyPinImage(color) {
  const pixelRatio = 2;
  const width = 56;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  const context = canvas.getContext('2d');

  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);

  context.save();
  context.translate(width / 2, 56);
  context.scale(1, 0.32);
  context.beginPath();
  context.arc(0, 0, 12, 0, Math.PI * 2);
  context.fillStyle = 'rgba(0, 0, 0, 0.22)';
  context.fill();
  context.restore();

  context.save();
  context.translate(width / 2, 26);
  context.rotate(Math.PI / 4);
  context.beginPath();
  context.moveTo(-4, -18);
  context.quadraticCurveTo(18, -18, 18, 4);
  context.lineTo(18, 18);
  context.lineTo(4, 18);
  context.quadraticCurveTo(-18, 18, -18, -4);
  context.quadraticCurveTo(-18, -18, -4, -18);
  context.closePath();
  context.lineWidth = 11;
  context.lineJoin = 'round';
  context.strokeStyle = color;
  context.stroke();
  context.restore();

  return {
    image: context.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio
  };
}

function addMapImages(map) {
  MAP_PIN_IMAGES.forEach(([id, color]) => {
    if (map.hasImage?.(id)) return;

    const { image, pixelRatio } = createEnergyPinImage(color);
    map.addImage(id, image, { pixelRatio });
  });
}

function addMapLayers(map) {
  addMapImages(map);

  addSourceIfMissing(map, SOURCE_IDS.buildings, {
    type: 'geojson',
    data: buildFeatureCollection([]),
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 13
  });

  addSourceIfMissing(map, SOURCE_IDS.heatmapBuildings, {
    type: 'geojson',
    data: buildFeatureCollection([])
  });

  addSourceIfMissing(map, SOURCE_IDS.upgradeBuildings, {
    type: 'geojson',
    data: buildFeatureCollection([])
  });

  addSourceIfMissing(map, SOURCE_IDS.energyTiles, {
    type: 'geojson',
    data: buildFeatureCollection([])
  });

  addLayerIfMissing(map, {
    id: LAYER_IDS.clusters,
    type: 'circle',
    source: SOURCE_IDS.buildings,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#1a73e8', 25, '#34a853', 100, '#fbbc04'],
      'circle-radius': ['step', ['get', 'point_count'], 18, 25, 26, 100, 34],
      'circle-opacity': 0.88,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  addLayerIfMissing(map, {
    id: LAYER_IDS.clusterCount,
    type: 'symbol',
    source: SOURCE_IDS.buildings,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Open Sans Bold'],
      'text-size': 12
    },
    paint: {
      'text-color': '#ffffff'
    }
  });

  addLayerIfMissing(map, {
    id: LAYER_IDS.points,
    type: 'symbol',
    source: SOURCE_IDS.buildings,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': 'map-pin-marker',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.42, 12, 0.62, 16, 0.76],
      'icon-anchor': 'bottom',
      'icon-offset': [0, 3],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });

  addLayerIfMissing(map, {
    id: LAYER_IDS.heatmap,
    type: 'heatmap',
    source: SOURCE_IDS.heatmapBuildings,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['coalesce', ['get', 'heatmapEnergy'], 0], 0, 0.14, 60, 0.42, 180, 0.72, 420, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.48, 8, 0.68, 12, 0.82, 16, 0.9],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(56, 189, 248, 0)',
        0.08,
        'rgba(125, 211, 252, 0.54)',
        0.28,
        'rgba(45, 212, 191, 0.62)',
        0.52,
        'rgba(163, 230, 53, 0.68)',
        0.74,
        'rgba(253, 224, 71, 0.76)',
        0.9,
        'rgba(253, 186, 116, 0.84)',
        1,
        'rgba(239, 68, 68, 0.92)'
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 16, 8, 22, 12, 30, 18, 42],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.72, 9, 0.82, 16, 0.76, 20, 0.48]
    }
  });

  addLayerIfMissing(map, {
    id: LAYER_IDS.heatmapLocations,
    type: 'circle',
    source: SOURCE_IDS.heatmapBuildings,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 8, 7, 12, 10, 16, 14],
      'circle-color': '#2dd4bf',
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.42, 10, 0.5, 16, 0.34],
      'circle-blur': ['interpolate', ['linear'], ['zoom'], 4, 1.1, 12, 0.85, 16, 0.55],
      'circle-stroke-width': 0
    }
  });

  addLayerIfMissing(map, {
    id: LAYER_IDS.heatmapPoints,
    type: 'circle',
    source: SOURCE_IDS.buildings,
    filter: ['!', ['has', 'point_count']],
    minzoom: 11,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.2, 11, 5.2, 14, 7.2, 17, 9.5],
      'circle-color': '#2dd4bf',
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.68, 12, 0.82, 15, 0.94],
      'circle-stroke-color': 'rgba(255, 255, 255, 0.86)',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 14, 1.3]
    }
  });

  addLayerIfMissing(map, {
    id: LAYER_IDS.upgradePriorityPoints,
    type: 'symbol',
    source: SOURCE_IDS.upgradeBuildings,
    layout: {
      visibility: 'none',
      'icon-image': [
        'step',
        ['coalesce', ['get', 'upgradeScore'], 0],
        'map-pin-upgrade-low',
        45,
        'map-pin-upgrade-mid',
        75,
        'map-pin-upgrade-high',
        100,
        'map-pin-upgrade-critical'
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.38, 12, 0.58, 16, 0.74],
      'icon-anchor': 'bottom',
      'icon-offset': [0, 3],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });

  addLayerIfMissing(map, {
    id: LAYER_IDS.energyTilePoints,
    type: 'symbol',
    source: SOURCE_IDS.energyTiles,
    layout: {
      visibility: 'none',
      'icon-image': [
        'match',
        ['get', 'energikarakter'],
        'A',
        'energy-pin-a',
        'B',
        'energy-pin-b',
        'C',
        'energy-pin-c',
        'D',
        'energy-pin-d',
        'E',
        'energy-pin-e',
        'F',
        'energy-pin-f',
        'G',
        'energy-pin-g',
        'energy-pin-default'
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.42, 14, 0.58, 18, 0.76],
      'icon-anchor': 'bottom',
      'icon-offset': [0, 3],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });

  addSourceIfMissing(map, SOURCE_IDS.selected, { type: 'geojson', data: buildFeatureCollection([]) });
  addLayerIfMissing(map, {
    id: LAYER_IDS.selectedHalo,
    type: 'symbol',
    source: SOURCE_IDS.selected,
    layout: {
      'icon-image': 'map-pin-selected',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.72, 14, 0.92, 18, 1.05],
      'icon-anchor': 'bottom',
      'icon-offset': [0, 3],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });
  addLayerIfMissing(map, {
    id: LAYER_IDS.selectedPoint,
    type: 'symbol',
    source: SOURCE_IDS.selected,
    layout: {
      'icon-image': 'map-pin-selected',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 14, 0.68, 18, 0.82],
      'icon-anchor': 'bottom',
      'icon-offset': [0, 3],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });

  addSourceIfMissing(map, SOURCE_IDS.nearby, { type: 'geojson', data: buildFeatureCollection([]) });
  addLayerIfMissing(map, {
    id: LAYER_IDS.nearby,
    type: 'symbol',
    source: SOURCE_IDS.nearby,
    layout: {
      'icon-image': 'map-pin-nearby',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.42, 12, 0.58, 16, 0.72],
      'icon-anchor': 'bottom',
      'icon-offset': [0, 3],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });

  addSourceIfMissing(map, SOURCE_IDS.nearbyCircle, { type: 'geojson', data: buildFeatureCollection([]) });
  addLayerIfMissing(map, {
    id: LAYER_IDS.nearbyCircle,
    type: 'fill',
    source: SOURCE_IDS.nearbyCircle,
    paint: {
      'fill-color': '#ea4335',
      'fill-opacity': 0.12,
      'fill-outline-color': '#ea4335'
    }
  });
}

function MapView({ features, allFeaturesCount, selectedFeature, searchSelection, nearbyState, selectedBydel, onMapClick, isSearchingNearby }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const featuresRef = useRef(features);
  const tileLoadControllerRef = useRef(null);
  const tileDetailControllerRef = useRef(null);
  const tileViewportTimerRef = useRef(null);
  const tileRequestKeyRef = useRef('');
  const tileReadyLoadQueuedRef = useRef(false);
  const tileCacheRef = useRef(new Map());
  const tileLoadedBoundsRef = useRef([]);
  const allFeatures = useStore((state) => state.allFeatures);
  const allFeaturesRef = useRef(allFeatures);
  const mapClickRef = useRef(onMapClick);
  const hasFittedRef = useRef(false);
  const theme = useStore((state) => state.theme);
  const viewMode = useStore((state) => state.viewMode);
  const bydelDisplayMode = useStore((state) => state.bydelDisplayMode);
  const nearbySearchEnabled = useStore((state) => state.nearbySearchEnabled);
  const radiusInMeters = useStore((state) => state.radiusInMeters);
  const setSelectedFeature = useStore((state) => state.setSelectedFeature);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [isTileLoading, setIsTileLoading] = useState(false);
  const featureCollection = useMemo(() => buildFeatureCollection(features), [features]);
  const heatmapData = useMemo(() => buildHeatmapData(features), [features]);
  const nearbyCollection = useMemo(() => buildNearbyGeoJson(nearbyState.results), [nearbyState.results]);
  const [tileFeatures, setTileFeatures] = useState([]);
  const tileCollection = useMemo(() => buildFeatureCollection(tileFeatures), [tileFeatures]);
  const nearbyCircleCollection = useMemo(() => {
    if (!nearbyState.center) return buildFeatureCollection([]);
    return buildNearbyCircleGeoJson(
      nearbyState.center.longitude,
      nearbyState.center.latitude,
      nearbyState.radiusInMeters
    );
  }, [nearbyState.center, nearbyState.radiusInMeters]);
  const featureCollectionRef = useRef(featureCollection);
  const heatmapCollectionRef = useRef(heatmapData.collection);
  const heatmapStatsRef = useRef(heatmapData.stats);
  const tileCollectionRef = useRef(tileCollection);
  const nearbyCollectionRef = useRef(nearbyCollection);
  const nearbyCircleCollectionRef = useRef(nearbyCircleCollection);
  const selectedFeatureRef = useRef(selectedFeature);
  const mapStyleUrlRef = useRef(mapStyleUrlForTheme(theme));
  const viewModeRef = useRef(viewMode);
  const bydelDisplayModeRef = useRef(bydelDisplayMode);
  const nearbySearchEnabledRef = useRef(nearbySearchEnabled);
  const radiusInMetersRef = useRef(radiusInMeters);
  const selectedBydelRef = useRef(selectedBydel);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    allFeaturesRef.current = allFeatures;
  }, [allFeatures]);

  useEffect(() => {
    featureCollectionRef.current = featureCollection;
  }, [featureCollection]);

  useEffect(() => {
    heatmapCollectionRef.current = heatmapData.collection;
    heatmapStatsRef.current = heatmapData.stats;
  }, [heatmapData]);

  useEffect(() => {
    tileCollectionRef.current = tileCollection;
  }, [tileCollection]);

  useEffect(() => {
    nearbyCollectionRef.current = nearbyCollection;
  }, [nearbyCollection]);

  useEffect(() => {
    nearbyCircleCollectionRef.current = nearbyCircleCollection;
  }, [nearbyCircleCollection]);

  useEffect(() => {
    selectedFeatureRef.current = selectedFeature;
  }, [selectedFeature]);

  useEffect(() => {
    mapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    bydelDisplayModeRef.current = bydelDisplayMode;
  }, [bydelDisplayMode]);

  useEffect(() => {
    nearbySearchEnabledRef.current = nearbySearchEnabled;
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = nearbySearchEnabled ? 'crosshair' : '';
    }
  }, [nearbySearchEnabled]);

  useEffect(() => {
    radiusInMetersRef.current = radiusInMeters;
  }, [radiusInMeters]);

  useEffect(() => {
    selectedBydelRef.current = selectedBydel;
  }, [selectedBydel]);

  const loadTilesForCurrentViewport = useCallback(async (map) => {
    if (!map || viewModeRef.current !== 'tiles') return;

    const request = tileViewportRequest(map);

    if (!request.shouldLoad) {
      tileRequestKeyRef.current = request.key;
      tileLoadControllerRef.current?.abort();
      tileLoadedBoundsRef.current = [];
      setTileFeatures([]);
      setIsTileLoading(false);
      return;
    }

    const cachedViewportFeatures = cachedTileFeaturesForViewport(tileCacheRef.current, request.bounds);
    const cachedViewportBounds = cachedBoundsForViewport(tileCacheRef.current, request.bounds);
    let missingBounds = missingBoundsForViewport(
      request.bounds,
      [...tileLoadedBoundsRef.current, ...cachedViewportBounds]
    );

    if (missingBounds.length === 0) {
      const nextFeatures = capTileFeaturesForViewport(
        mergeUniqueTileFeatures(tileCollectionRef.current?.features || [], cachedViewportFeatures),
        request.bounds
      );

      if (nextFeatures.length > 0) {
        setTileFeatures(nextFeatures);
        tileRequestKeyRef.current = request.key;
        setIsTileLoading(false);
        return;
      }

      tileLoadedBoundsRef.current = [];
      missingBounds = [request.bounds];
    }

    const requestBounds = splitMissingBoundsForTileRequests(missingBounds);

    if (requestBounds.length === 0) {
      tileRequestKeyRef.current = request.key;
      setIsTileLoading(false);
      return;
    }

    const missingRequestKey = requestBounds.map(boundsKey).join('|');

    if (missingRequestKey === tileRequestKeyRef.current) return;

    tileRequestKeyRef.current = missingRequestKey;
    tileLoadControllerRef.current?.abort();

    const controller = new AbortController();
    tileLoadControllerRef.current = controller;
    setIsTileLoading(true);

    let latestFeatures = capTileFeaturesForViewport(
      mergeUniqueTileFeatures(tileCollectionRef.current?.features || [], cachedViewportFeatures),
      request.bounds
    );
    try {
      const loadStates = [];

      for (const bounds of requestBounds) {
        const boundsCacheKey = boundsKey(bounds);
        const cachedEntry = readTileCache(tileCacheRef.current, boundsCacheKey);
        const cachedFeatures = cachedEntry?.features || [];

        if (cachedFeatures.length > 0) {
          latestFeatures = capTileFeaturesForViewport(
            mergeUniqueTileFeatures(latestFeatures, cachedFeatures),
            request.bounds
          );
          setTileFeatures(latestFeatures);
        }

        if (cachedEntry?.complete) {
          tileLoadedBoundsRef.current = rememberTileLoadedBounds(tileLoadedBoundsRef.current, bounds);
          continue;
        }

        loadStates.push({
          bounds,
          boundsCacheKey,
          loadedFeatures: cachedFeatures,
          cursor: cachedEntry?.nextCursor || null,
          completed: false
        });
      }

      const isTileLoadStale = () => (
        controller.signal.aborted ||
        tileLoadControllerRef.current !== controller ||
        tileRequestKeyRef.current !== missingRequestKey ||
        viewModeRef.current !== 'tiles'
      );

      const applyTilePayload = (state, payload) => {
        if (isTileLoadStale()) return;

        const normalized = normalizeTilePointsPayload(payload);
        const nextFeatures = normalized.features;

        if (nextFeatures.length === 0) {
          state.completed = true;
          return;
        }

        state.loadedFeatures = mergeUniqueTileFeatures(state.loadedFeatures, nextFeatures);
        latestFeatures = capTileFeaturesForViewport(
          mergeUniqueTileFeatures(latestFeatures, nextFeatures),
          request.bounds
        );
        setTileFeatures(latestFeatures);

        if (!normalized.hasMore || !normalized.nextCursor) {
          state.completed = true;
          state.cursor = null;
          return;
        }

        state.cursor = normalized.nextCursor;
      };

      const fetchTileStatePage = async (state, limit) => {
        const payload = await fetchTilePointsBounds({
          minLatitude: state.bounds.south,
          minLongitude: state.bounds.west,
          maxLatitude: state.bounds.north,
          maxLongitude: state.bounds.east,
          limit,
          ...tileCursorParams(state.cursor)
        }, {
          signal: controller.signal
        });

        applyTilePayload(state, payload);
      };

      const loadTileStateBatch = async (states, limit) => {
        let nextStateIndex = 0;
        const errors = [];
        const workerCount = Math.min(TILE_POINT_FETCH_CONCURRENCY, states.length);

        await Promise.all(Array.from({ length: workerCount }, async () => {
          while (!isTileLoadStale() && nextStateIndex < states.length) {
            const state = states[nextStateIndex];
            nextStateIndex += 1;

            if (state.completed) continue;

            try {
              await fetchTileStatePage(state, limit);
            } catch (error) {
              if (error?.name === 'AbortError') return;
              errors.push(error);
            }
          }
        }));

        if (errors.length > 0) {
          throw errors[0];
        }
      };

      for (let index = 0; index < TILE_POINT_MAX_REQUESTS_PER_BOUNDS; index += 1) {
        const limit = index === 0 ? TILE_POINT_FIRST_BATCH_LIMIT : TILE_POINT_BACKGROUND_BATCH_LIMIT;
        const activeStates = loadStates.filter((state) => !state.completed);

        if (activeStates.length === 0) break;

        await loadTileStateBatch(activeStates, limit);

        if (isTileLoadStale()) return;
      }

      for (const state of loadStates) {
        writeTileCache(tileCacheRef.current, state.boundsCacheKey, {
          features: state.loadedFeatures,
          nextCursor: state.cursor,
          complete: state.completed
        });

        if (state.completed) {
          tileLoadedBoundsRef.current = rememberTileLoadedBounds(tileLoadedBoundsRef.current, state.bounds);
        }
      }

    } catch (error) {
      if (error?.name === 'AbortError') return;
    } finally {
      if (tileLoadControllerRef.current === controller) {
        tileLoadControllerRef.current = null;
        tileRequestKeyRef.current = '';
        setIsTileLoading(false);
      }
    }
  }, []);

  const loadTilesForCurrentViewportWhenReady = useCallback((map) => {
    if (!map || viewModeRef.current !== 'tiles') return;

    if (!map.isStyleLoaded()) {
      if (tileReadyLoadQueuedRef.current) return;

      tileReadyLoadQueuedRef.current = true;
      map.once('idle', () => {
        tileReadyLoadQueuedRef.current = false;

        if (mapRef.current === map && viewModeRef.current === 'tiles') {
          loadTilesForCurrentViewportWhenReady(map);
        }
      });
      return;
    }

    if (map.getZoom() < MIN_GEOJSON_TILE_ZOOM) {
      const activeBydel = selectedBydelRef.current;

      map.once('moveend', () => {
        if (mapRef.current === map && viewModeRef.current === 'tiles') {
          loadTilesForCurrentViewport(map);
        }
      });
      map.easeTo({
        center: activeBydel ? [activeBydel.longitude, activeBydel.latitude] : map.getCenter(),
        zoom: MIN_GEOJSON_TILE_ZOOM,
        duration: 600,
        essential: true
      });
      return;
    }

    loadTilesForCurrentViewport(map);
  }, [loadTilesForCurrentViewport]);

  const scheduleTilesForCurrentViewport = useCallback((map) => {
    if (!map || viewModeRef.current !== 'tiles') return;

    if (tileViewportTimerRef.current) {
      window.clearTimeout(tileViewportTimerRef.current);
    }

    tileViewportTimerRef.current = window.setTimeout(() => {
      tileViewportTimerRef.current = null;
      loadTilesForCurrentViewport(map);
    }, GEOJSON_TILE_MOVE_DEBOUNCE_MS);
  }, [loadTilesForCurrentViewport]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyleUrlRef.current,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    setZoomLevel(map.getZoom());

    const updateZoomLevel = () => {
      setZoomLevel(Number(map.getZoom().toFixed(1)));
    };

    const handleTileViewportMoveEnd = () => {
      scheduleTilesForCurrentViewport(map);
    };

    map.on('zoom', updateZoomLevel);
    map.on('moveend', handleTileViewportMoveEnd);
    map.on('zoomend', handleTileViewportMoveEnd);

    map.on('load', () => {
      addMapLayers(map);
      syncMapDataAndVisibility(map, {
        featureCollection: featureCollectionRef.current,
        heatmapCollection: heatmapCollectionRef.current,
        heatmapStats: heatmapStatsRef.current,
        nearbyCollection: nearbyCollectionRef.current,
        nearbyCircleCollection: nearbyCircleCollectionRef.current,
        selectedFeature: selectedFeatureRef.current,
        viewMode: viewModeRef.current,
        bydelDisplayMode: bydelDisplayModeRef.current
      });
      map.getSource(SOURCE_IDS.energyTiles)?.setData(tileCollectionRef.current);
      loadTilesForCurrentViewportWhenReady(map);

      map.on('click', LAYER_IDS.clusters, (event) => {
        const clusterFeature = map.queryRenderedFeatures(event.point, { layers: [LAYER_IDS.clusters] })[0];
        const clusterId = clusterFeature.properties.cluster_id;
        map.getSource(SOURCE_IDS.buildings).getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (!error) map.easeTo({ center: clusterFeature.geometry.coordinates, zoom });
        });
      });

      map.on('click', LAYER_IDS.points, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const selected = findFeatureById(allFeaturesRef.current, feature.properties.id);
        const unitsAtLocation = selected ? findUnitsAtFeatureLocation(allFeaturesRef.current, selected) : [];
        const coordinates = selected?.geometry?.coordinates?.slice() || feature.geometry.coordinates.slice();
        const address = selected?.properties?.adresse || feature.properties.adresse || 'Unknown address';
        setSelectedFeature(selected || null);
        popupRef.current?.remove();
        popupRef.current = openPopup(
          map,
          coordinates,
          unitsAtLocation.length > 1
            ? nearbyUnitsListHtml(unitsToListPayload(unitsAtLocation), address, coordinates)
            : popupHtmlForMode(selected?.properties || feature.properties, 'markers')
        );
      });

      map.on('click', LAYER_IDS.heatmapPoints, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const selected = findFeatureById(allFeaturesRef.current, feature.properties.id);
        const unitsAtLocation = selected ? findUnitsAtFeatureLocation(allFeaturesRef.current, selected) : [];
        const coordinates = selected?.geometry?.coordinates?.slice() || feature.geometry.coordinates.slice();
        const address = selected?.properties?.adresse || feature.properties.adresse || 'Unknown address';

        setSelectedFeature(selected || null);
        popupRef.current?.remove();
        popupRef.current = openPopup(
          map,
          coordinates,
          unitsAtLocation.length > 1
            ? nearbyUnitsListHtml(unitsToListPayload(unitsAtLocation), address, coordinates)
            : popupHtmlForMode(selected?.properties || feature.properties, 'heatmap')
        );
      });

      map.on('click', LAYER_IDS.upgradePriorityPoints, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const selected = findFeatureById(allFeaturesRef.current, feature.properties.id);
        const unitsAtLocation = selected ? findUnitsAtFeatureLocation(allFeaturesRef.current, selected) : [];
        const coordinates = selected?.geometry?.coordinates?.slice() || feature.geometry.coordinates.slice();
        const address = selected?.properties?.adresse || feature.properties.adresse || 'Unknown address';

        setSelectedFeature(selected || null);
        popupRef.current?.remove();
        popupRef.current = openPopup(
          map,
          coordinates,
          unitsAtLocation.length > 1
            ? nearbyUnitsListHtml(unitsToListPayload(unitsAtLocation), address, coordinates)
            : popupHtmlForMode(selected?.properties || feature.properties, 'upgrade')
        );
      });

      map.on('click', LAYER_IDS.energyTilePoints, async (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const coordinates = feature.geometry.coordinates.slice();
        const fallbackProperties = feature.properties || {};
        const detailId = tileDetailId(feature);

        tileDetailControllerRef.current?.abort();
        popupRef.current?.remove();
        popupRef.current = openPopup(
          map,
          coordinates,
          tilePopupHtml(fallbackProperties)
        );

        const controller = new AbortController();
        tileDetailControllerRef.current = controller;

        try {
          const payload = await fetchTileDetailPayload(feature, {
            signal: controller.signal
          });

          if (
            controller.signal.aborted ||
            tileDetailControllerRef.current !== controller ||
            viewModeRef.current !== 'tiles'
          ) {
            return;
          }

          const detailFeature = tileDetailFeatureFromPayloadForClick(payload, detailId, feature);
          if (!detailFeature) return;

          const detailCoordinates = detailFeature.geometry?.coordinates?.slice() || coordinates;
          setSelectedFeature(detailFeature);
          popupRef.current?.remove();
          popupRef.current = openPopup(
            map,
            detailCoordinates,
            tilePopupHtml(detailFeature.properties)
          );
        } catch (error) {
          if (error?.name !== 'AbortError') {
            console.warn('Could not load tile point details.', error);
          }
        } finally {
          if (tileDetailControllerRef.current === controller) {
            tileDetailControllerRef.current = null;
          }
        }
      });

      // Add delegated click handler for unit selection at the document level
      const handleUnitSelection = (e) => {
        const unitItem = e.target.closest('.nearby-unit-item');
        if (!unitItem) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const coordinateId = unitItem.getAttribute('data-coordinateid');
        const popupCard = unitItem.closest('.popup-card-units');
        const lng = popupCard?.getAttribute('data-lng');
        const lat = popupCard?.getAttribute('data-lat');
        
        const selected = findFeatureById(allFeaturesRef.current, coordinateId);
        
        if (selected) {
          setSelectedFeature(selected);
          // Ensure the current popup is fully removed
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }
          
          // Use a small delay to ensure removal is complete
          setTimeout(() => {
            popupRef.current = openPopup(
              map,
              [parseFloat(lng) || 0, parseFloat(lat) || 0],
              popupHtmlForMode(selected.properties, viewModeRef.current)
            );
          }, 100);
        }
      };

      const handlePopupOutsideClick = (event) => {
        if (!popupRef.current) return;
        const popupElement = popupRef.current.getElement();
        if (popupElement?.contains(event.target)) return;
        if (event.target.closest('.sidebar-shell, .collapsed-mode-dock, .top-overlay')) return;

        popupRef.current.remove();
        popupRef.current = null;
        setSelectedFeature(null);
      };
      
      // Use capture because MapLibre popups can stop bubbling before document sees the click.
      document.addEventListener('click', handleUnitSelection, true);
      document.addEventListener('mousedown', handlePopupOutsideClick, true);
      
      // Store cleanup function
      const cleanup = () => {
        document.removeEventListener('click', handleUnitSelection, true);
        document.removeEventListener('mousedown', handlePopupOutsideClick, true);
      };
      
      mapRef.current._cleanup = cleanup;

      map.on('click', LAYER_IDS.nearby, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        
        const unitCount = feature.properties.unitCount ?? 1;
        popupRef.current?.remove();
        
        if (unitCount > 1) {
          // Show list of units
          // Get address from the first unit's building
          const parsedUnits = JSON.parse(feature.properties.units);
          const firstBuildingId = parsedUnits[0]?.id;
          const firstBuilding = firstBuildingId
            ? findFeatureById(allFeaturesRef.current, firstBuildingId)
            : null;
          const address = firstBuilding?.properties?.adresse || 'Unknown address';
          const enrichedUnits = parsedUnits.map((unit) => findFeatureById(allFeaturesRef.current, unit.id) || unit);
          
          // Store a reference to the current feature for the event handler
          const currentFeatureCoordinates = feature.geometry.coordinates.slice();
          
          popupRef.current = openPopup(
            map,
            currentFeatureCoordinates,
            nearbyUnitsListHtml(unitsToListPayload(enrichedUnits), address, currentFeatureCoordinates)
          );
        } else {
          // Single unit - show full building info
          const selected = findFeatureById(allFeaturesRef.current, feature.properties.coordinateid);
          setSelectedFeature(selected || null);
          popupRef.current = openPopup(
            map,
            feature.geometry.coordinates.slice(),
            selected ? popupHtml(selected.properties) : nearbyPopupHtml(feature.properties)
          );
        }
      });

      map.on('click', (event) => {
        const hits = map.queryRenderedFeatures(event.point, { layers: [LAYER_IDS.clusters, LAYER_IDS.points, LAYER_IDS.heatmapPoints, LAYER_IDS.upgradePriorityPoints, LAYER_IDS.energyTilePoints, LAYER_IDS.nearby] });
        if (hits.length > 0) return;
        tileDetailControllerRef.current?.abort();
        popupRef.current?.remove();
        popupRef.current = null;
        setSelectedFeature(null);
        if (!nearbySearchEnabledRef.current) return;
        mapClickRef.current({
          latitude: Number(event.lngLat.lat.toFixed(6)),
          longitude: Number(event.lngLat.lng.toFixed(6)),
          radiusInMeters: radiusInMetersRef.current
        });
      });

      [LAYER_IDS.clusters, LAYER_IDS.points, LAYER_IDS.heatmapPoints, LAYER_IDS.upgradePriorityPoints, LAYER_IDS.energyTilePoints, LAYER_IDS.nearby].forEach((layerId) => {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = nearbySearchEnabledRef.current ? 'crosshair' : '';
        });
      });
    });

    mapRef.current = map;
    return () => {
      popupRef.current?.remove();
      if (tileViewportTimerRef.current) {
        window.clearTimeout(tileViewportTimerRef.current);
        tileViewportTimerRef.current = null;
      }
      tileLoadControllerRef.current?.abort();
      tileDetailControllerRef.current?.abort();
      mapRef.current?._cleanup?.();
      map.off('zoom', updateZoomLevel);
      map.off('moveend', handleTileViewportMoveEnd);
      map.off('zoomend', handleTileViewportMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [loadTilesForCurrentViewportWhenReady, scheduleTilesForCurrentViewport, setSelectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextStyleUrl = mapStyleUrlForTheme(theme);
    if (mapStyleUrlRef.current === nextStyleUrl) return;

    mapStyleUrlRef.current = nextStyleUrl;
    map.once('style.load', () => {
      const activePopup = popupRef.current;
      const popupState = activePopup?.isOpen?.() ? activePopup._energimerkingState : null;
      if (activePopup && !activePopup.isOpen?.()) {
        popupRef.current = null;
      }
      addMapLayers(map);
      const restoreMapOverlays = () => {
        addMapLayers(map);
        syncMapDataAndVisibility(map, {
          featureCollection: featureCollectionRef.current,
          heatmapCollection: heatmapCollectionRef.current,
          heatmapStats: heatmapStatsRef.current,
          nearbyCollection: nearbyCollectionRef.current,
          nearbyCircleCollection: nearbyCircleCollectionRef.current,
          selectedFeature: selectedFeatureRef.current,
          viewMode: viewModeRef.current,
          bydelDisplayMode: bydelDisplayModeRef.current
        });
        map.getSource(SOURCE_IDS.energyTiles)?.setData(tileCollectionRef.current);
        loadTilesForCurrentViewportWhenReady(map);
      };

      restoreMapOverlays();
      if (popupState) {
        popupRef.current?.remove();
        popupRef.current = openPopup(map, popupState.coordinates, popupState.html);
      }
      map.once('idle', restoreMapOverlays);
    });
    map.setStyle(nextStyleUrl, { diff: false });
  }, [loadTilesForCurrentViewportWhenReady, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    syncMapDataAndVisibility(map, {
      featureCollection,
      heatmapCollection: heatmapData.collection,
      heatmapStats: heatmapData.stats,
      nearbyCollection,
      nearbyCircleCollection,
      selectedFeature,
      viewMode,
      bydelDisplayMode
    });
  }, [bydelDisplayMode, featureCollection, heatmapData, nearbyCollection, nearbyCircleCollection, selectedFeature, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    map.getSource(SOURCE_IDS.energyTiles)?.setData(tileCollection);
  }, [tileCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (viewMode === 'tiles') {
      loadTilesForCurrentViewportWhenReady(map);
    } else {
      if (tileViewportTimerRef.current) {
        window.clearTimeout(tileViewportTimerRef.current);
        tileViewportTimerRef.current = null;
      }
      tileLoadControllerRef.current?.abort();
      tileDetailControllerRef.current?.abort();
      setIsTileLoading(false);
    }
  }, [loadTilesForCurrentViewportWhenReady, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_IDS.selected);
    if (!source) return;
    if (!selectedFeature) {
      source.setData(buildFeatureCollection([]));
      popupRef.current?.remove();
      return;
    }
    source.setData(buildFeatureCollection([selectedFeature]));
    map.flyTo({
      center: selectedFeature.geometry.coordinates,
      zoom: Math.max(map.getZoom(), 14),
      duration: 1200,
      essential: true
    });
  }, [selectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !searchSelection?.featureId) return;

    const searchedFeature = findFeatureById(allFeaturesRef.current, searchSelection.featureId);
    if (!searchedFeature) return;

    const unitsAtLocation = findUnitsAtFeatureLocation(allFeaturesRef.current, searchedFeature);
    const coordinates = searchedFeature.geometry.coordinates.slice();
    const address = searchedFeature.properties?.adresse || 'Unknown address';

    popupRef.current?.remove();
    popupRef.current = openPopup(
      map,
      coordinates,
      unitsAtLocation.length > 1
        ? nearbyUnitsListHtml(unitsToListPayload(unitsAtLocation), address, coordinates)
        : popupHtml(searchedFeature.properties)
    );
  }, [searchSelection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const nearbySource = map.getSource(SOURCE_IDS.nearby);
    const circleSource = map.getSource(SOURCE_IDS.nearbyCircle);
    if (nearbySource) nearbySource.setData(nearbyCollection);
    if (circleSource) circleSource.setData(nearbyCircleCollection);
  }, [nearbyCollection, nearbyCircleCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasFittedRef.current || allFeaturesCount === 0 || features.length === 0) return;
    const activeBydel = selectedBydelRef.current;
    if (activeBydel) {
      map.easeTo({
        center: [activeBydel.longitude, activeBydel.latitude],
        zoom: activeBydel.zoom || 11,
        duration: 1200,
        essential: true
      });
      hasFittedRef.current = true;
      return;
    }

    const coordinates = features.map((feature) => feature.geometry.coordinates);
    const bounds = coordinates.reduce(
      (accumulator, coordinate) => accumulator.extend(coordinate),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    );
    map.fitBounds(bounds, {
      padding: { top: 140, right: 80, bottom: 80, left: 420 },
      duration: 1400,
      maxZoom: 12
    });
    hasFittedRef.current = true;
  }, [allFeaturesCount, features]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !selectedBydel) return;
    map.easeTo({
      center: [selectedBydel.longitude, selectedBydel.latitude],
      zoom: selectedBydel.zoom || 11,
      duration: 900,
      essential: true
    });
  }, [selectedBydel]);

  return (
    <div className="map-shell">
      <div ref={mapContainerRef} className="map-canvas" />
      <CollapsedModeDock />
      <div className="zoom-readout">
        Zoom {zoomLevel.toFixed(1)}
      </div>
      <div className="map-floating">
        {viewMode !== 'tiles' && <MapLegend heatmapStats={heatmapData.stats} />}
        {viewMode === 'tiles' && isTileLoading && (
          <div className="map-pill is-loading is-tile-loading">
            <span className="map-pill-loader" aria-hidden="true" />
            Loading Enkel bygg
          </div>
        )}
        {nearbySearchEnabled && (
          <div className="map-pill is-hint">
            Click the map to search within {radiusInMeters.toLocaleString()} m
          </div>
        )}
        {isSearchingNearby && (
          <div className="map-pill is-loading">
            <span className="map-pill-loader" aria-hidden="true" />
            Finding nearby buildings within {radiusInMeters.toLocaleString()} m...
          </div>
        )}
        {nearbyState.results.length > 0 && (
          <div className="map-pill is-count">
            <strong>{nearbyState.results.length}</strong> nearby loaded coordinates
          </div>
        )}
      </div>
    </div>
  );
}

export default MapView;
