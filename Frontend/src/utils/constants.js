export const DEFAULT_RADIUS = 5000;
export const DEFAULT_CENTER = [10.7522, 59.9139];
export const DEFAULT_ZOOM = 5.2;

export const MAP_VIEW_MODES = [
  { value: 'markers', label: 'Bydeler i Oslo' },
  { value: 'tiles', label: 'Enkel bygg', isolated: true },
  { value: 'upgrade', label: 'Upgrade priority' }
];

export const BYDEL_DISPLAY_MODES = [
  { value: 'clusters', label: 'Clusters' },
  { value: 'heatmap', label: 'Heatmap' }
];

export const SOURCE_IDS = {
  buildings: 'buildings',
  upgradeBuildings: 'upgrade-buildings',
  heatmapBuildings: 'heatmap-buildings',
  energyTiles: 'energy-tiles',
  selected: 'selected-building',
  nearby: 'nearby-buildings',
  nearbyCircle: 'nearby-circle'
};

export const LAYER_IDS = {
  clusters: 'clusters',
  clusterCount: 'cluster-count',
  points: 'unclustered-points',
  heatmap: 'buildings-heatmap',
  heatmapLocations: 'buildings-heatmap-locations',
  heatmapPoints: 'buildings-heatmap-points',
  upgradePriorityPoints: 'upgrade-priority-points',
  energyTilePoints: 'energy-tile-points',
  selectedHalo: 'selected-building-halo',
  selectedPoint: 'selected-building-point',
  nearby: 'nearby-layer',
  nearbyCircle: 'nearby-circle-layer'
};

export const LIGHT_MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
export const DARK_MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
export const MAP_STYLE_URL = LIGHT_MAP_STYLE_URL;
