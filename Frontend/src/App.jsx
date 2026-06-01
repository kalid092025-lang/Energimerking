import { useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView.jsx';
import Sidebar from './components/Sidebar.jsx';
import SearchBar from './components/SearchBar.jsx';
import { fetchBuildingsGeoJson } from './services/api.js';
import { useStore } from './store/useStore.js';
import {
  buildInitialFilterBounds,
  filterFeatures,
  getSearchSuggestions,
  normalizeGeoJson
} from './utils/filtering.js';
import './styles/app.css';

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function distanceInMeters(from, to) {
  const earthRadius = 6371008.8;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const startLatitude = toRadians(from.latitude);
  const endLatitude = toRadians(to.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function extractErrorMessage(error, fallbackMessage) {
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

function App() {
  const theme = useStore((state) => state.theme);
  const searchQuery = useStore((state) => state.searchQuery);
  const selectedFeature = useStore((state) => state.selectedFeature);
  const nearby = useStore((state) => state.nearby);
  const filters = useStore((state) => state.filters);
  const allFeatures = useStore((state) => state.allFeatures);
  const isLoading = useStore((state) => state.isLoading);
  const error = useStore((state) => state.error);
  const initializeFilters = useStore((state) => state.initializeFilters);
  const setLoading = useStore((state) => state.setLoading);
  const setError = useStore((state) => state.setError);
  const setAllFeatures = useStore((state) => state.setAllFeatures);
  const setSelectedFeature = useStore((state) => state.setSelectedFeature);
  const setNearby = useStore((state) => state.setNearby);
  const setSearchQuery = useStore((state) => state.setSearchQuery);
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);
  const [searchSelection, setSearchSelection] = useState(null);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        setError('');
        const payload = await fetchBuildingsGeoJson();
        if (!active) return;
        const normalized = normalizeGeoJson(payload);
        setAllFeatures(normalized.features);
        initializeFilters(buildInitialFilterBounds(normalized.features));
      } catch (loadError) {
        if (!active) return;
        setAllFeatures([]);
        initializeFilters(buildInitialFilterBounds([]));
        setError(extractErrorMessage(loadError, 'Failed to load building data.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [initializeFilters, setAllFeatures, setError, setLoading]);

  const filteredFeatures = useMemo(
    () => filterFeatures(allFeatures, filters),
    [allFeatures, filters]
  );
  const suggestions = useMemo(
    () => getSearchSuggestions(allFeatures, searchQuery),
    [allFeatures, searchQuery]
  );
  const selectedFeatureFromList = useMemo(() => {
    if (!selectedFeature?.id) return null;
    return (
      filteredFeatures.find((feature) => feature.id === selectedFeature.id) ||
      allFeatures.find((feature) => feature.id === selectedFeature.id) ||
      null
    );
  }, [allFeatures, filteredFeatures, selectedFeature]);

  const handleSuggestionSelect = (feature) => {
    setSelectedFeature(feature);
    setSearchQuery(feature.properties.adresse || feature.properties.poststed || '');
    setSearchSelection({
      featureId: feature.id,
      selectedAt: Date.now()
    });
  };

  const handleMapClick = ({ latitude, longitude, radiusInMeters }) => {
    setIsSearchingNearby(true);
    setError('');

    const center = { latitude, longitude };
    const results = allFeatures
      .map((feature) => {
        const [featureLongitude, featureLatitude] = feature.geometry.coordinates;
        const featurePoint = {
          latitude: Number(featureLatitude),
          longitude: Number(featureLongitude)
        };

        return {
          coordinateid: feature.properties.id,
          latitude: featurePoint.latitude,
          longitude: featurePoint.longitude,
          bruksenhetsNr: feature.properties.bruksenhetsNr || feature.properties.brukenhetsnummer || '',
          energikarakter: feature.properties.energikarakter || '',
          distanceInMeters: distanceInMeters(center, featurePoint)
        };
      })
      .filter((item) => item.distanceInMeters <= radiusInMeters)
      .sort((left, right) => left.distanceInMeters - right.distanceInMeters)
      .slice(0, 200);

    setNearby({
      center,
      radiusInMeters,
      results
    });
    setIsSearchingNearby(false);
  };

  const isEmpty = !isLoading && !error && filteredFeatures.length === 0;
  const emptyTitle = allFeatures.length === 0
    ? 'No backend data loaded'
    : 'No buildings match these filters';
  const emptyCopy = allFeatures.length === 0
    ? 'Try the Swagger defaults: latitude 59.9, longitude 10.8, radius 2500.'
    : 'Adjust the ranges or grade filters to bring results back.';

  return (
    <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
      <div className="app-background" />
      <div className="app-layout">
        <Sidebar
          featureCount={filteredFeatures.length}
          totalCount={allFeatures.length}
          isSearchingNearby={isSearchingNearby}
        />
        <main className="app-main">
          <div className="top-overlay">
            <SearchBar
              suggestions={suggestions}
              hasData={allFeatures.length > 0}
              onSuggestionSelect={handleSuggestionSelect}
            />
          </div>
          <MapView
            features={filteredFeatures}
            allFeaturesCount={allFeatures.length}
            selectedFeature={selectedFeatureFromList}
            searchSelection={searchSelection}
            nearbyState={nearby}
            onMapClick={handleMapClick}
            isSearchingNearby={isSearchingNearby}
          />
          {isLoading && (
              <div className="status-overlay">
                <div className="status-card">
                  <div className="spinner" />
                  <div>
                    <div className="status-title">Loading building data</div>
                    <div className="status-copy">Preparing map, layers, and filters.</div>
                  </div>
                </div>
              </div>
            )}
          {error && !isLoading && (
              <div className="toast toast-error">
                <div className="toast-title">Something went wrong</div>
                <div className="toast-copy">{error}</div>
              </div>
            )}
          {isEmpty && (
              <div className="toast toast-empty">
                <div className="toast-title">{emptyTitle}</div>
                <div className="toast-copy">{emptyCopy}</div>
              </div>
            )}
        </main>
      </div>
    </div>
  );
}

export default App;
