import SearchBar from './SearchBar'
import FilterPanel from './FilterPanel'
import NearbySearch from './NearbySearch'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <path
        d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.72 5.28l-1.77 1.77M7.05 16.95l-1.77 1.77M18.72 18.72l-1.77-1.77M7.05 7.05 5.28 5.28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 15.2A8.5 8.5 0 0 1 8.8 4a9 9 0 1 0 11.2 11.2Z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function Sidebar({ mapRef, theme = 'dark', onToggleTheme }) {
  const isDark = theme === 'dark'

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-row">
          <div className="sidebar-logo">
            Energi<span>Kart</span>
          </div>

          <button
            type="button"
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Bytt til light mode' : 'Bytt til dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            <span className="theme-toggle-icon">
              {isDark ? <MoonIcon /> : <SunIcon />}
            </span>
          </button>
        </div>

        <div className="sidebar-subtitle">Energianalyse</div>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <SearchBar />
        </div>

        <NearbySearch />
        <FilterPanel />
      </div>
    </aside>
  )
}
