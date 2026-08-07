import {
  CircleDot,
  Moon,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useStore } from "../store/useStore.js";
import Filters from "./Filters.jsx";
import "../styles/sidebar.css";

function Sidebar({ isSearchingNearby }) {
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const theme = useStore((state) => state.theme);
  const nearbySearchEnabled = useStore((state) => state.nearbySearchEnabled);
  const nearby = useStore((state) => state.nearby);
  const toggleSidebar = useStore((state) => state.toggleSidebar);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const toggleNearbySearch = useStore((state) => state.toggleNearbySearch);
  const clearNearby = useStore((state) => state.clearNearby);
  const ThemeIcon = theme === "dark" ? Moon : Sun;

  return (
    <aside className={`sidebar-shell ${sidebarOpen ? "is-open" : "is-closed"}`}>
      <div className="sidebar-panel">
        <div className="sidebar-top">
          <div className="sidebar-controls" aria-label="Map tools">
            <button
              type="button"
              className={`tool-button icon-tool ${sidebarOpen ? "active" : ""}`}
              onClick={toggleSidebar}
              aria-pressed={sidebarOpen}
            >
              <SlidersHorizontal
                className="tool-icon"
                aria-hidden="true"
                strokeWidth={2.2}
              />
              <span className="sr-only">Filters</span>
            </button>
            <button
              type="button"
              className={`tool-button ${nearbySearchEnabled ? "active" : ""}`}
              onClick={toggleNearbySearch}
              aria-pressed={nearbySearchEnabled}
              aria-label="Toggle radius search. When enabled, click the map to search for buildings inside the selected radius."
              title="Toggle radius search. When enabled, click the map to search for buildings inside the selected radius."
            >
              <span>
                <CircleDot
                  className="tool-inline-icon"
                  aria-hidden="true"
                  strokeWidth={2.2}
                />{" "}
                Radius{" "}
                <span className="tool-help" aria-hidden="true">
                  ?
                </span>
              </span>
              <strong>{nearbySearchEnabled ? "On" : "Off"}</strong>
            </button>
            <button
              type="button"
              className="tool-button icon-tool"
              onClick={toggleTheme}
            >
              <ThemeIcon
                className="tool-icon"
                aria-hidden="true"
                strokeWidth={2.2}
              />
              <span className="sr-only">
                {theme === "dark" ? "Dark mode" : "Light mode"}
              </span>
            </button>
          </div>

          <div className="sidebar-collapsible">
            {nearby.results.length > 0 && (
              <button
                type="button"
                className="clear-nearby-button"
                onClick={clearNearby}
              >
                Clear radius results
              </button>
            )}

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
