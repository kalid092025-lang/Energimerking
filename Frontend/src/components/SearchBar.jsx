import { useState, useRef, useEffect, useCallback } from 'react'
import { useMapStore } from '../store/useMapStore'
import { RATING_COLORS } from '../utils/geoUtils'

/**
 * Searches the already-loaded allFeatures (your database, fetched at startup).
 * No external API â€” instant results, only your buildings.
 *
 * Matches: adresse, poststed, kommunenavn, bygningskategori
 * Sorted: exact prefix match first, then contains match.
 *
 * On select: setSearchResult(feature) â†’ MapView shows a popup on the map.
 */
export default function SearchBar() {
  const allFeatures     = useMapStore(s => s.allFeatures)
  const setSearchResult = useMapStore(s => s.setSearchResult)

  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState([])
  const [open,        setOpen]        = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

  const timerRef   = useRef(null)
  const wrapperRef = useRef(null)
  const inputRef   = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Position dropdown under input using fixed coords (escapes overflow clipping)
  const updatePos = useCallback(() => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 6, left: rect.left, width: rect.width })
  }, [])

  useEffect(() => { if (open) updatePos() }, [open, updatePos])
  useEffect(() => {
    window.addEventListener('resize', updatePos)
    return () => window.removeEventListener('resize', updatePos)
  }, [updatePos])

  // Local search against allFeatures â€” O(n) over ~8000 items, ~1ms
  const search = useCallback((q) => {
    const trimmed = q.trim().toLowerCase()
    if (!trimmed) { setResults([]); setOpen(false); return }

    const scored = []
    for (const f of allFeatures) {
      const p = f.properties
      if (!p) continue

      const fields = [
        p.adresse         ?? '',
        p.poststed        ?? '',
        p.kommunenavn     ?? '',
        p.bygningskategori ?? '',
      ].map(s => s.toLowerCase())

      const best = Math.max(
        ...fields.map(s =>
          s.startsWith(trimmed) ? 3 :
          s.includes(trimmed)   ? 1 : 0
        )
      )

      if (best > 0) scored.push({ f, score: best })
    }

    scored.sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : (a.f.properties.adresse ?? '').localeCompare(b.f.properties.adresse ?? '', 'no')
    )

    const top = scored.slice(0, 8).map(s => s.f)
    setResults(top)
    setOpen(top.length > 0)
    updatePos()
  }, [allFeatures, updatePos])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 150)
  }

  const handleSelect = (feature) => {
    const p = feature.properties
    setQuery(p.adresse ?? p.poststed ?? '')
    setOpen(false)
    setResults([])
    setSearchResult(feature)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); setResults([]) }
  }

  const hasData = allFeatures.length > 0

  const DropdownStyle = {
    position: 'fixed',
    top:   dropdownPos.top,
    left:  dropdownPos.left,
    width: dropdownPos.width,
    zIndex: 9999,
  }

  return (
    <div className="search-wrap" ref={wrapperRef}>
      <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>

      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder={hasData ? `Søk blant ${allFeatures.length.toLocaleString('no')} lastede bygg` : 'Laster data'}
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length) { setOpen(true); updatePos() } }}
        autoComplete="off"
        spellCheck={false}
        disabled={!hasData}
      />

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="search-results" style={DropdownStyle}>
          {results.map((feature, i) => {
            const p      = feature.properties
            const rating = p.energikarakter
            const color  = rating ? RATING_COLORS[rating] : 'var(--text-tertiary)'
            return (
              <div key={i} className="search-result-item" onMouseDown={() => handleSelect(feature)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {rating && (
                    <span style={{
                      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11,
                      color, background: `${color}22`, border: `1px solid ${color}66`,
                      borderRadius: 3, padding: '1px 5px', flexShrink: 0,
                    }}>{rating}</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {p.adresse ?? p.poststed ?? 'Ukjent adresse'}
                  </span>
                </div>
                <div className="search-result-type">
                  {[p.poststed, p.kommunenavn].filter(Boolean).join(' Â· ')}
                  {p.byggeaar ? ` Â· ${p.byggeaar}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
