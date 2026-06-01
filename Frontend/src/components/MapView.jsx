import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store/useStore.js';
import { buildFeatureCollection, buildNearbyCircleGeoJson, buildNearbyGeoJson } from '../utils/geo.js';
import {
  DEFAULT_CENTER,
  DEFAULT_RADIUS,
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
  const valueClass = hasValue(value) ? 'popup-value' : 'popup-value popup-value-empty';
  return `
    <div class="popup-detail">
      <span class="popup-label">${escapeHtml(label)}</span>
      <strong class="${valueClass}">${escapeHtml(displayValue(value))}</strong>
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

function popupHtml(properties) {
  const address = escapeHtml(displayValue(properties.adresse, 'Unknown address'));
  const municipality = escapeHtml(displayValue(properties.kommunenavn, 'Unknown municipality'));
  const energyGrade = displayValue(properties.energikarakter, 'N/A');
  const energyGradeDisplay = escapeHtml(energyGrade);
  const energyGradeClass = energyClass(energyGrade);
  const energyUse = properties.beregnetLevertEnergiTotaltkWhm2 ?? properties.energibruk_kwh_m2;

  return `
    <div class="popup-card">
      <div class="popup-header">
        <div class="popup-heading">
          <div class="popup-kicker">Energy certificate</div>
          <div class="popup-title">${address}</div>
          <div class="popup-subtitle">${municipality}</div>
        </div>
        <div class="energy-badge ${energyGradeClass}" title="Energy grade">
          <span>Grade</span>
          <strong>${energyGradeDisplay}</strong>
        </div>
      </div>
      <div class="popup-metrics">
        ${popupMetric('Unit', properties.bruksenhetsNr, 'popup-metric-compact')}
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

function unitsToListPayload(units) {
  return JSON.stringify(
    units.map((unit) => ({
      id: unit.id || unit.properties?.id,
      bruksenhetsNr: unit.properties?.bruksenhetsNr || unit.properties?.brukenhetsnummer || '',
      energikarakter: unit.properties?.energikarakter || '',
      distanceInMeters: unit.distanceInMeters
    }))
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
    const unitNumber = escapeHtml(properties.bruksenhetsNr || properties.brukenhetsnummer || 'N/A');
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
          <div class="nearby-unit-title">Unit: ${escapeHtml(u.bruksenhetsNr || 'N/A')}</div>
          ${
            u.energikarakter
              ? `<div class="energy-badge energy-badge-small ${energyClass(u.energikarakter)}">${escapeHtml(u.energikarakter)}</div>`
              : ''
          }
        </div>
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

function MapLegend() {
  const viewMode = useStore((state) => state.viewMode);

  return (
    <div className="map-legend">
      <div className="legend-kicker">Legend</div>
      {viewMode === 'heatmap' ? (
        <>
          <div className="legend-gradient" />
          <div className="legend-scale">
            <span>Low usage</span>
            <span>High usage</span>
          </div>
          <div className="legend-copy">Heatmap intensity is based on energibruk_kwh_m2.</div>
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
      'heatmap-weight': ['interpolate', ['linear'], ['coalesce', ['get', 'energibruk_kwh_m2'], 0], 0, 0, 50, 0.25, 150, 0.65, 400, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 9, 1.15, 13, 1.8],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(15,23,42,0)', 0.15, '#1d4ed8', 0.35, '#14b8a6', 0.55, '#fde047', 0.75, '#fb923c', 1, '#dc2626'],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 16, 8, 28, 13, 44],
      'heatmap-opacity': 0.82
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
  const setSelectedFeature = useStore((state) => state.setSelectedFeature);
  const featureCollection = useMemo(() => buildFeatureCollection(features), [features]);
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
  const nearbyCollectionRef = useRef(nearbyCollection);
  const nearbyCircleCollectionRef = useRef(nearbyCircleCollection);
  const selectedFeatureRef = useRef(selectedFeature);
  const viewModeRef = useRef(viewMode);
  const nearbySearchEnabledRef = useRef(nearbySearchEnabled);

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
      map.getSource(SOURCE_IDS.heatmapBuildings).setData(featureCollectionRef.current);
      map.getSource(SOURCE_IDS.nearby).setData(nearbyCollectionRef.current);
      map.getSource(SOURCE_IDS.nearbyCircle).setData(nearbyCircleCollectionRef.current);

      const markerVisibility = viewModeRef.current === 'markers' ? 'visible' : 'none';
      const heatmapVisibility = viewModeRef.current === 'heatmap' ? 'visible' : 'none';
      map.setLayoutProperty(LAYER_IDS.clusters, 'visibility', markerVisibility);
      map.setLayoutProperty(LAYER_IDS.clusterCount, 'visibility', markerVisibility);
      map.setLayoutProperty(LAYER_IDS.points, 'visibility', markerVisibility);
      map.setLayoutProperty(LAYER_IDS.heatmap, 'visibility', heatmapVisibility);

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
      
      // Use capture because MapLibre popups can stop bubbling before document sees the click.
      document.addEventListener('click', handleUnitSelection, true);
      
      // Store cleanup function
      const cleanup = () => {
        document.removeEventListener('click', handleUnitSelection, true);
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
          
          // Store a reference to the current feature for the event handler
          const currentFeatureCoordinates = feature.geometry.coordinates.slice();
          
          popupRef.current = openPopup(
            map,
            currentFeatureCoordinates,
            nearbyUnitsListHtml(feature.properties.units, address, currentFeatureCoordinates)
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
        if (!nearbySearchEnabledRef.current) return;
        mapClickRef.current({
          latitude: Number(event.lngLat.lat.toFixed(6)),
          longitude: Number(event.lngLat.lng.toFixed(6)),
          radiusInMeters: DEFAULT_RADIUS
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
    if (heatmapSource) heatmapSource.setData(featureCollection);
    const markerVisibility = viewMode === 'markers' ? 'visible' : 'none';
    const heatmapVisibility = viewMode === 'heatmap' ? 'visible' : 'none';
    map.setLayoutProperty(LAYER_IDS.clusters, 'visibility', markerVisibility);
    map.setLayoutProperty(LAYER_IDS.clusterCount, 'visibility', markerVisibility);
    map.setLayoutProperty(LAYER_IDS.points, 'visibility', markerVisibility);
    map.setLayoutProperty(LAYER_IDS.heatmap, 'visibility', heatmapVisibility);
  }, [featureCollection, viewMode]);

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
        <MapLegend />
        {nearbySearchEnabled && (
          <div className="map-pill">
            Click the map to search within {DEFAULT_RADIUS.toLocaleString()} m
          </div>
        )}
        {isSearchingNearby && (
          <div className="map-pill">
            Finding nearby buildings within {DEFAULT_RADIUS.toLocaleString()} m...
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
