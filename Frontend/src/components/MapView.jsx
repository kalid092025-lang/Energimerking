import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store/useStore.js';
import { buildFeatureCollection, buildNearbyCircleGeoJson, buildNearbyGeoJson } from '../utils/geo.js';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  LAYER_IDS,
  MAP_STYLE_URL,
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

function popupDetail(label, value) {
  if (!hasValue(value)) return '';

  const valueClass = hasValue(value) ? 'popup-value' : 'popup-value popup-value-empty';
  return `
    <div class="popup-detail">
      <span class="popup-label">${escapeHtml(label)}</span>
      <strong class="${valueClass}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function popupMetric(label, value, modifier = '') {
  const metricClass = ['popup-metric', modifier].filter(Boolean).join(' ');
  const valueClass = hasValue(value) ? 'popup-metric-value' : 'popup-metric-value popup-value-empty';
  return `
    <div class="${metricClass}">
      <span>${escapeHtml(label)}</span>
      <strong class="${valueClass}">${escapeHtml(displayValue(value, 'N/A'))}</strong>
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
    properties.brukenhetsnummer,
    properties.brukenhetsNR,
    properties.bruksenhetsNr,
    properties.bruksenhetsnummer,
    properties.Brukenhetsnummer,
    properties.BrukenhetsNR,
    properties.BruksenhetsNr,
    properties.Bruksenhetsnummer
  );

  return `
    <div class="popup-card">
      <div class="popup-header">
        <div class="popup-heading">
          <div class="popup-kicker">Energy certificate</div>
          <div class="popup-title">${address}</div>
          ${municipality ? `<div class="popup-subtitle">${municipality}</div>` : ''}
        </div>
        <div class="energy-badge ${energyGradeClass}" title="Energy grade">
          <span>Grade</span>
          <strong>${energyGradeDisplay}</strong>
        </div>
      </div>
      <div class="popup-metrics">
        ${popupMetric('Unit', unitNumber, 'popup-metric-compact')}
        ${popupMetric('Energy use', energyUse, 'popup-metric-compact')}
        ${popupMetric('Built', properties.byggeaar, 'popup-metric-compact')}
      </div>
      <div class="popup-details">
        ${popupDetail('Address', properties.adresse)}
        ${popupDetail('Municipality', properties.kommunenavn)}
        ${popupDetail('Gård', properties.gard)}
        ${popupDetail('Bruk', properties.bruksnummer)}
        ${popupDetail('Feste', properties.feste)}
        ${popupDetail('Andel', properties.andel)}
        ${popupDetail('Seksjon', properties.seksjon)}
        ${popupDetail('Organisation no.', properties.organisasjonsNr)}
        ${popupDetail('Certificate no.', properties.attestnummer)}
        ${popupDetail('Issued', properties.utstedelsesdato)}
        ${popupDetail('Heating grade', properties.oppvarmingskarakter)}
        ${popupDetail('Material', properties.materialvalg)}
      </div>
    </div>
  `;
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
    0,
    stats.p50,
    0.22,
    stats.p80,
    0.52,
    stats.p95,
    0.9
  ];
}

function heatmapPointColorExpression(stats) {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'heatmapEnergy'], 0],
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

  keepPopupInView(map, popup);
  return popup;
}

function formatEnergy(value) {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value)} kWh/m2` : 'N/A';
}

function MapLegend({ heatmapStats }) {
  const viewMode = useStore((state) => state.viewMode);

  return (
    <div className="map-legend">
      <div className="legend-kicker">Legend</div>
      {viewMode === 'heatmap' ? (
        <>
          <div className="legend-gradient" />
          <div className="legend-scale">
            <span>Low</span>
            <span>Extreme</span>
          </div>
          <div className="legend-breaks">
            <span>Typical {formatEnergy(heatmapStats.p50)}</span>
            <span>High {formatEnergy(heatmapStats.p80)}</span>
            <span>Extreme {formatEnergy(heatmapStats.p95)}+</span>
          </div>
          <div className="legend-copy">Each building location is colored by median energy use.</div>
        </>
      ) : (
        <div className="legend-list">
          <div className="legend-item"><span className="legend-dot dot-cluster-small" />Small cluster</div>
          <div className="legend-item"><span className="legend-dot dot-cluster-medium" />Medium cluster</div>
          <div className="legend-item"><span className="legend-dot dot-cluster-large" />Large cluster</div>
          <div className="legend-item"><span className="legend-dot dot-building" />Individual building</div>
          <div className="legend-item"><span className="legend-dot dot-nearby" />radios result</div>
        </div>
      )}
    </div>
  );
}

function addMapLayers(map) {
  map.addSource(SOURCE_IDS.buildings, {
    type: 'geojson',
    data: buildFeatureCollection([]),
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 13
  });

  map.addSource(SOURCE_IDS.heatmapBuildings, {
    type: 'geojson',
    data: buildFeatureCollection([])
  });

  map.addLayer({
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

  map.addLayer({
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

  map.addLayer({
    id: LAYER_IDS.points,
    type: 'circle',
    source: SOURCE_IDS.buildings,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 12, 9],
      'circle-color': '#1a73e8',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.9
    }
  });

  map.addLayer({
    id: LAYER_IDS.heatmap,
    type: 'heatmap',
    source: SOURCE_IDS.heatmapBuildings,
    maxzoom: 15,
    layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['coalesce', ['get', 'energibruk_kwh_m2'], 0], 0, 0, 60, 0.18, 180, 0.5, 420, 0.82],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.2, 9, 0.55, 13, 0.85],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(56, 189, 248, 0)',
        0.18,
        'rgba(125, 211, 252, 0.34)',
        0.38,
        'rgba(45, 212, 191, 0.44)',
        0.58,
        'rgba(163, 230, 53, 0.5)',
        0.76,
        'rgba(253, 224, 71, 0.56)',
        0.92,
        'rgba(253, 186, 116, 0.6)',
        1,
        'rgba(239, 68, 68, 0.72)'
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 26, 8, 44, 13, 72],
      'heatmap-opacity': 0.58
    }
  });

  map.addLayer({
    id: LAYER_IDS.heatmapPoints,
    type: 'circle',
    source: SOURCE_IDS.heatmapBuildings,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 10, 5.5, 14, 8],
      'circle-color': '#2dd4bf',
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.55, 10, 0.72, 14, 0.86],
      'circle-stroke-color': 'rgba(255, 255, 255, 0.86)',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 1.2]
    }
  });

  map.addSource(SOURCE_IDS.selected, { type: 'geojson', data: buildFeatureCollection([]) });
  map.addLayer({
    id: LAYER_IDS.selectedHalo,
    type: 'circle',
    source: SOURCE_IDS.selected,
    paint: {
      'circle-radius': 18,
      'circle-color': 'rgba(251, 188, 4, 0.2)',
      'circle-stroke-color': '#fbbc04',
      'circle-stroke-width': 3
    }
  });
  map.addLayer({
    id: LAYER_IDS.selectedPoint,
    type: 'circle',
    source: SOURCE_IDS.selected,
    paint: {
      'circle-radius': 7,
      'circle-color': '#fbbc04',
      'circle-stroke-color': '#202124',
      'circle-stroke-width': 2
    }
  });

  map.addSource(SOURCE_IDS.nearby, { type: 'geojson', data: buildFeatureCollection([]) });
  map.addLayer({
    id: LAYER_IDS.nearby,
    type: 'circle',
    source: SOURCE_IDS.nearby,
    paint: {
      'circle-radius': 6,
      'circle-color': '#ea4335',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2
    }
  });

  map.addSource(SOURCE_IDS.nearbyCircle, { type: 'geojson', data: buildFeatureCollection([]) });
  map.addLayer({
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

function MapView({ features, allFeaturesCount, selectedFeature, searchSelection, nearbyState, onMapClick, isSearchingNearby }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const featuresRef = useRef(features);
  const allFeatures = useStore((state) => state.allFeatures);
  const allFeaturesRef = useRef(allFeatures);
  const mapClickRef = useRef(onMapClick);
  const hasFittedRef = useRef(false);
  const viewMode = useStore((state) => state.viewMode);
  const nearbySearchEnabled = useStore((state) => state.nearbySearchEnabled);
  const radiusInMeters = useStore((state) => state.radiusInMeters);
  const setSelectedFeature = useStore((state) => state.setSelectedFeature);
  const featureCollection = useMemo(() => buildFeatureCollection(features), [features]);
  const heatmapData = useMemo(() => buildHeatmapData(features), [features]);
  const nearbyCollection = useMemo(() => buildNearbyGeoJson(nearbyState.results), [nearbyState.results]);
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
  const nearbyCollectionRef = useRef(nearbyCollection);
  const nearbyCircleCollectionRef = useRef(nearbyCircleCollection);
  const selectedFeatureRef = useRef(selectedFeature);
  const viewModeRef = useRef(viewMode);
  const nearbySearchEnabledRef = useRef(nearbySearchEnabled);
  const radiusInMetersRef = useRef(radiusInMeters);

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
    nearbySearchEnabledRef.current = nearbySearchEnabled;
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = nearbySearchEnabled ? 'crosshair' : '';
    }
  }, [nearbySearchEnabled]);

  useEffect(() => {
    radiusInMetersRef.current = radiusInMeters;
  }, [radiusInMeters]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      addMapLayers(map);
      map.getSource(SOURCE_IDS.buildings).setData(featureCollectionRef.current);
      map.getSource(SOURCE_IDS.heatmapBuildings).setData(heatmapCollectionRef.current);
      map.getSource(SOURCE_IDS.nearby).setData(nearbyCollectionRef.current);
      map.getSource(SOURCE_IDS.nearbyCircle).setData(nearbyCircleCollectionRef.current);
      map.setPaintProperty(
        LAYER_IDS.heatmap,
        'heatmap-weight',
        heatmapWeightExpression(heatmapStatsRef.current)
      );
      map.setPaintProperty(
        LAYER_IDS.heatmapPoints,
        'circle-color',
        heatmapPointColorExpression(heatmapStatsRef.current)
      );

      const markerVisibility = viewModeRef.current === 'markers' ? 'visible' : 'none';
      const heatmapVisibility = viewModeRef.current === 'heatmap' ? 'visible' : 'none';
      map.setLayoutProperty(LAYER_IDS.clusters, 'visibility', markerVisibility);
      map.setLayoutProperty(LAYER_IDS.clusterCount, 'visibility', markerVisibility);
      map.setLayoutProperty(LAYER_IDS.points, 'visibility', markerVisibility);
      map.setLayoutProperty(LAYER_IDS.heatmap, 'visibility', heatmapVisibility);
      map.setLayoutProperty(LAYER_IDS.heatmapPoints, 'visibility', heatmapVisibility);

      if (selectedFeatureRef.current) {
        map.getSource(SOURCE_IDS.selected).setData(
          buildFeatureCollection([selectedFeatureRef.current])
        );
      }

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
            : popupHtml(selected?.properties || feature.properties)
        );
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
              popupHtml(selected.properties)
            );
          }, 100);
        }
      };

      const handlePopupOutsideClick = (event) => {
        if (!popupRef.current) return;
        const popupElement = popupRef.current.getElement();
        if (popupElement?.contains(event.target)) return;

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
        const hits = map.queryRenderedFeatures(event.point, { layers: [LAYER_IDS.clusters, LAYER_IDS.points, LAYER_IDS.nearby] });
        if (hits.length > 0) return;
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

      [LAYER_IDS.clusters, LAYER_IDS.points, LAYER_IDS.nearby].forEach((layerId) => {
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
      mapRef.current?._cleanup?.();
      map.remove();
      mapRef.current = null;
    };
  }, [setSelectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_IDS.buildings);
    const heatmapSource = map.getSource(SOURCE_IDS.heatmapBuildings);
    if (source) source.setData(featureCollection);
    if (heatmapSource) heatmapSource.setData(heatmapData.collection);
    map.setPaintProperty(LAYER_IDS.heatmap, 'heatmap-weight', heatmapWeightExpression(heatmapData.stats));
    map.setPaintProperty(LAYER_IDS.heatmapPoints, 'circle-color', heatmapPointColorExpression(heatmapData.stats));
    const markerVisibility = viewMode === 'markers' ? 'visible' : 'none';
    const heatmapVisibility = viewMode === 'heatmap' ? 'visible' : 'none';
    map.setLayoutProperty(LAYER_IDS.clusters, 'visibility', markerVisibility);
    map.setLayoutProperty(LAYER_IDS.clusterCount, 'visibility', markerVisibility);
    map.setLayoutProperty(LAYER_IDS.points, 'visibility', markerVisibility);
    map.setLayoutProperty(LAYER_IDS.heatmap, 'visibility', heatmapVisibility);
    map.setLayoutProperty(LAYER_IDS.heatmapPoints, 'visibility', heatmapVisibility);
  }, [featureCollection, heatmapData, viewMode]);

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

  return (
    <div className="map-shell">
      <div ref={mapContainerRef} className="map-canvas" />
      <div className="map-floating">
        <MapLegend heatmapStats={heatmapData.stats} />
        {nearbySearchEnabled && (
          <div className="map-pill">
            Click the map to search within {radiusInMeters.toLocaleString()} m
          </div>
        )}
        {isSearchingNearby && (
          <div className="map-pill">
            Finding nearby buildings within {radiusInMeters.toLocaleString()} m...
          </div>
        )}
        {nearbyState.results.length > 0 && (
          <div className="map-pill">
            <strong>{nearbyState.results.length}</strong> nearby loaded coordinates
          </div>
        )}
      </div>
    </div>
  );
}

export default MapView;
