import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
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
  const suggestionLocation = (feature) => (
    [
      feature.properties.poststed,
      feature.properties.kommunenavn
    ].filter(Boolean).join(' | ') || 'Location not registered'
  );
  const selectSuggestion = (feature) => {
    onSuggestionSelect(feature);
    setOpen(false);
  };

  return (
    <div className="search-layout">
      <div className="search-left">
        <div className="search-wrapper" ref={wrapperRef}>
          <div className={`search-shell ${hasData ? '' : 'is-disabled'}`}>
            <Search className="search-input-icon" aria-hidden="true" strokeWidth={2.2} />
            <input
              type="text"
              aria-label="Search buildings"
              value={searchQuery}
              disabled={!hasData}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setOpen(false);
                  event.currentTarget.blur();
                }

                if (event.key === 'Enter' && visibleSuggestions.length > 0) {
                  selectSuggestion(visibleSuggestions[0]);
                }
              }}
              placeholder={hasData ? 'Search by adresse, poststed, or kommunenavn' : 'No building data loaded'}
            />
            {searchQuery && (
              <button type="button" className="inline-ghost search-clear-button" aria-label="Clear search" onClick={() => {
                setSearchQuery('');
                setOpen(false);
              }}>
                <X aria-hidden="true" strokeWidth={2.2} />
              </button>
            )}
          </div>

          {open && searchQuery.trim() && (
              <div className="suggestions-panel" role="listbox" aria-label="Search suggestions">
                {visibleSuggestions.length > 0 ? (
                  visibleSuggestions.map((feature) => (
                    <button key={feature.id} type="button" className="suggestion-item" role="option" onClick={() => selectSuggestion(feature)}>
                      <span className="suggestion-dot" />
                      <span className="suggestion-copy">
                        <strong>{feature.properties.adresse || 'Unknown address'}</strong>
                        <small>{suggestionLocation(feature)}</small>
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
