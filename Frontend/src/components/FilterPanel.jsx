import { useState, useRef, useCallback } from 'react'
import { useMapStore } from '../store/useMapStore'

const ALL_RATINGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

/**
 * Dual-thumb range slider component.
 *
 * Uses two overlapping <input type="range"> elements on the same track.
 * The fill bar is positioned via inline style computed from the values.
 * onChange fires at most once per animation frame (rAF debounce).
 */
function DualRange({ min, max, value, onChange, unit = '' }) {
  const [low, high] = value
  const rafRef = useRef(null)

  const schedule = useCallback((newLow, newHigh) => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => onChange([newLow, newHigh]))
  }, [onChange])

  const fillLeft  = ((low  - min) / (max - min)) * 100
  const fillRight = ((max  - high) / (max - min)) * 100

  return (
    <div className="range-track">
      <div className="range-track-bg" />
      <div
        className="range-track-fill"
        style={{ left: `${fillLeft}%`, right: `${fillRight}%` }}
      />
      {/* Low thumb */}
      <input
        type="range"
        min={min}
        max={max}
        value={low}
        onChange={e => {
          const v = Math.min(Number(e.target.value), high - 1)
          schedule(v, high)
        }}
        style={{ zIndex: low > max - 10 ? 5 : 3 }}
      />
      {/* High thumb */}
      <input
        type="range"
        min={min}
        max={max}
        value={high}
        onChange={e => {
          const v = Math.max(Number(e.target.value), low + 1)
          schedule(low, v)
        }}
        style={{ zIndex: 4 }}
      />
    </div>
  )
}

export default function FilterPanel() {
  const filters     = useMapStore(s => s.filters)
  const categories  = useMapStore(s => s.categories)
  const setFilters  = useMapStore(s => s.setFilters)
  const resetFilters = useMapStore(s => s.resetFilters)
  const stats       = useMapStore(s => s.stats)

  const toggleRating = (r) => {
    const current = filters.ratings
    if (current.includes(r)) {
      if (current.length === 1) return   // keep at least one
      setFilters({ ratings: current.filter(x => x !== r) })
    } else {
      setFilters({ ratings: [...current, r] })
    }
  }

  return (
    <div>
      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-value">{stats.count.toLocaleString('no')}</div>
            <div className="stat-label">Bygg</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avgEnergy}</div>
            <div className="stat-label">Snitt kWh/m²</div>
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="section-label">Filtre</div>

        {/* Year built */}
        <div className="filter-group">
          <div className="filter-label">
            <span>Byggeår</span>
            <span className="filter-value">
              {filters.yearRange[0]} – {filters.yearRange[1]}
            </span>
          </div>
          <DualRange
            min={1800}
            max={2024}
            value={filters.yearRange}
            onChange={v => setFilters({ yearRange: v })}
          />
        </div>

        {/* Energy usage */}
        <div className="filter-group">
          <div className="filter-label">
            <span>Energibruk</span>
            <span className="filter-value">
              {filters.energyRange[0]} – {filters.energyRange[1]} kWh/m²
            </span>
          </div>
          <DualRange
            min={0}
            max={3000}
            value={filters.energyRange}
            onChange={v => setFilters({ energyRange: v })}
          />
        </div>

        {/* Energy rating */}
        <div className="filter-group">
          <div className="filter-label">
            <span>Energikarakter</span>
          </div>
          <div className="rating-grid">
            {ALL_RATINGS.map(r => (
              <button
                key={r}
                className={`rating-btn${filters.ratings.includes(r) ? ' active' : ''}`}
                data-rating={r}
                onClick={() => toggleRating(r)}
                title={r}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Building category */}
        <div className="filter-group">
          <div className="filter-label"><span>Kategori</span></div>
          <select
            className="styled-select"
            value={filters.category}
            onChange={e => setFilters({ category: e.target.value })}
          >
            {categories.map(c => (
              <option key={c} value={c}>
                {c === 'all' ? 'Alle kategorier' : c}
              </option>
            ))}
          </select>
        </div>

        <button className="btn-reset" onClick={resetFilters}>
          Tilbakestill filtre
        </button>
      </div>
    </div>
  )
}
