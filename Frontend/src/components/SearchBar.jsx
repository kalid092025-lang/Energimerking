import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import '../styles/searchbar.css';

function SearchBar({
  suggestions,
  hasData,
  onSuggestionSelect
}) {
  const searchQuery = useStore((state) => state.searchQuery);
  const setSearchQuery = useStore((state) => state.setSearchQuery);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleWindowClick(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }

    window.addEventListener('mousedown', handleWindowClick);
    return () => window.removeEventListener('mousedown', handleWindowClick);
  }, []);

  const visibleSuggestions = useMemo(() => suggestions.slice(0, 7), [suggestions]);

  return (
    <div className="search-layout">
      <div className="search-left">
        <div className="search-wrapper" ref={wrapperRef}>
          <div className="search-shell">
            <input
              type="text"
              value={searchQuery}
              disabled={!hasData}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={hasData ? 'Search by adresse, poststed, or kommunenavn' : 'No building data loaded'}
            />
            {searchQuery && (
              <button type="button" className="inline-ghost" onClick={() => {
                setSearchQuery('');
                setOpen(false);
              }}>
                Clear
              </button>
            )}
          </div>

          {open && searchQuery.trim() && (
              <div className="suggestions-panel">
                {visibleSuggestions.length > 0 ? (
                  visibleSuggestions.map((feature) => (
                    <button key={feature.id} type="button" className="suggestion-item" onClick={() => {
                      onSuggestionSelect(feature);
                      setOpen(false);
                    }}>
                      <span className="suggestion-dot" />
                      <span className="suggestion-copy">
                        <strong>{feature.properties.adresse || 'Unknown address'}</strong>
                        <small>
                          {feature.properties.poststed || 'Unknown place'} | {feature.properties.kommunenavn || 'Unknown municipality'}
                        </small>
                      </span>
                    </button>
                  ))
                ) : hasData ? (
                  <div className="suggestions-empty">No matching buildings found.</div>
                ) : (
                  <div className="suggestions-empty">No building data is available to search.</div>
                )}
              </div>
            )}
        </div>

      </div>
    </div>
  );
}

export default SearchBar;
