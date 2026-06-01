import { useStore } from '../store/useStore.js';
import Filters from './Filters.jsx';
import '../styles/sidebar.css';

function Sidebar({ featureCount, totalCount, isSearchingNearby }) {
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const theme = useStore((state) => state.theme);
  const nearbySearchEnabled = useStore((state) => state.nearbySearchEnabled);
  const nearby = useStore((state) => state.nearby);
  const toggleSidebar = useStore((state) => state.toggleSidebar);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const toggleNearbySearch = useStore((state) => state.toggleNearbySearch);
  const clearNearby = useStore((state) => state.clearNearby);

  return (
    <aside className={`sidebar-shell ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
      <div className="sidebar-panel">
        <div className="sidebar-top">
          <div className="sidebar-controls" aria-label="Map tools">
            <button
              type="button"
              className={`tool-button ${sidebarOpen ? 'active' : ''}`}
              onClick={toggleSidebar}
              aria-pressed={sidebarOpen}
            >
              <span>Filters</span>
              <strong>{sidebarOpen ? 'Open' : 'Closed'}</strong>
            </button>
            <button
              type="button"
              className={`tool-button ${nearbySearchEnabled ? 'active' : ''}`}
              onClick={toggleNearbySearch}
              aria-pressed={nearbySearchEnabled}
            >
              <span>Radius</span>
              <strong>{nearbySearchEnabled ? 'On' : 'Off'}</strong>
            </button>
            <button type="button" className="tool-button" onClick={toggleTheme}>
              <span>Theme</span>
              <strong>{theme === 'dark' ? 'Light' : 'Dark'}</strong>
            </button>
          </div>

          <div className="sidebar-collapsible">
            {nearby.results.length > 0 && (
              <button type="button" className="clear-nearby-button" onClick={clearNearby}>
                Clear radius results
              </button>
            )}

            <div className="stats-grid">
              <div className="stat-card">
                <span>Visible</span>
                <strong>{featureCount.toLocaleString()}</strong>
              </div>
              <div className="stat-card">
                <span>Loaded</span>
                <strong>{totalCount.toLocaleString()}</strong>
              </div>
            </div>

            {isSearchingNearby && (
              <div className="sidebar-alert">
                Searching nearby buildings for the clicked map location.
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-scroll sidebar-collapsible">
          <Filters />
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
