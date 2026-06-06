export const OSLO_BYDELER = [
  { id: 'all', name: 'Alle viste Oslo-punkter', latitude: 59.91733, longitude: 10.844128, radiusInMeters: 3000, zoom: 11 },
  { id: 'gamle-oslo', name: 'Gamle Oslo', latitude: 59.9056, longitude: 10.7867, radiusInMeters: 2300, zoom: 12 },
  { id: 'grunerlokka', name: 'Grunerlokka', latitude: 59.925, longitude: 10.759, radiusInMeters: 1900, zoom: 12.2 },
  { id: 'sagene', name: 'Sagene', latitude: 59.937, longitude: 10.755, radiusInMeters: 1600, zoom: 12.5 },
  { id: 'st-hanshaugen', name: 'St. Hanshaugen', latitude: 59.9227, longitude: 10.7396, radiusInMeters: 1600, zoom: 12.6 },
  { id: 'frogner', name: 'Frogner', latitude: 59.9225, longitude: 10.706, radiusInMeters: 2700, zoom: 11.8 },
  { id: 'ullern', name: 'Ullern', latitude: 59.925, longitude: 10.65, radiusInMeters: 3500, zoom: 11.3 },
  { id: 'vestre-aker', name: 'Vestre Aker', latitude: 59.957, longitude: 10.673, radiusInMeters: 4400, zoom: 11 },
  { id: 'nordre-aker', name: 'Nordre Aker', latitude: 59.956, longitude: 10.755, radiusInMeters: 3900, zoom: 11.2 },
  { id: 'bjerke', name: 'Bjerke', latitude: 59.942, longitude: 10.815, radiusInMeters: 3000, zoom: 11.5 },
  { id: 'grorud', name: 'Grorud', latitude: 59.962, longitude: 10.88, radiusInMeters: 3500, zoom: 11.3 },
  { id: 'stovner', name: 'Stovner', latitude: 59.962, longitude: 10.925, radiusInMeters: 3300, zoom: 11.4 },
  { id: 'alna', name: 'Alna', latitude: 59.932, longitude: 10.855, radiusInMeters: 4100, zoom: 11.1 },
  { id: 'ostensjo', name: 'Ostensjo', latitude: 59.885, longitude: 10.832, radiusInMeters: 3900, zoom: 11.2 },
  { id: 'nordstrand', name: 'Nordstrand', latitude: 59.865, longitude: 10.795, radiusInMeters: 4300, zoom: 11.1 },
  { id: 'sondre-nordstrand', name: 'Sondre Nordstrand', latitude: 59.835, longitude: 10.84, radiusInMeters: 5000, zoom: 10.9 }
];

export const DEFAULT_BYDEL = OSLO_BYDELER[0];

export function findBydel(bydelId) {
  return OSLO_BYDELER.find((bydel) => bydel.id === bydelId) || DEFAULT_BYDEL;
}
