export const DEFAULT_RADIUS = 5000;
export const DEFAULT_CENTER = [10.7522, 59.9139];
export const DEFAULT_ZOOM = 5.2;

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
  heatmapPoints: 'buildings-heatmap-points',
  upgradePriorityPoints: 'upgrade-priority-points',
  energyTilePoints: 'energy-tile-points',
  selectedHalo: 'selected-building-halo',
  selectedPoint: 'selected-building-point',
  nearby: 'nearby-layer',
  nearbyCircle: 'nearby-circle-layer'
};

export const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
export const ENERGY_TILE_URL = 'http://localhost:5277/tiles/{z}/{x}/{y}.pbf';
export const ENERGY_TILE_SOURCE_LAYER = 'points';
