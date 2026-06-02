import { useMemo } from 'react';
import { useStore } from '../store/useStore.js';

function RangeField({ label, min, max, value, onChange, suffix = '', step = 1 }) {
  const [currentMin, currentMax] = value;
  const span = max - min || 1;
  const minPercent = ((currentMin - min) / span) * 100;
  const maxPercent = ((currentMax - min) / span) * 100;
  const updateMin = (nextValue) => {
    onChange([Math.min(Number(nextValue), currentMax), currentMax]);
  };
  const updateMax = (nextValue) => {
    onChange([currentMin, Math.max(Number(nextValue), currentMin)]);
  };

  return (
    <div className="filter-group">
      <div className="filter-label-row">
        <label>{label}</label>
        <div className="filter-range-value">
          {currentMin}
          {suffix} - {currentMax}
          {suffix}
        </div>
      </div>
      <div
        className="range-slider"
        style={{
          '--range-start': `${minPercent}%`,
          '--range-end': `${maxPercent}%`
        }}
      >
        <div className="range-track">
          <div className="range-track-fill" />
        </div>
        <input
          className="range-input range-input-min"
          type="range"
          aria-label={`${label} minimum`}
          min={min}
          max={max}
          step={step}
          value={currentMin}
          onChange={(event) => updateMin(event.target.value)}
        />
        <input
          className="range-input range-input-max"
          type="range"
          aria-label={`${label} maximum`}
          min={min}
          max={max}
          step={step}
          value={currentMax}
          onChange={(event) => updateMax(event.target.value)}
        />
      </div>
    </div>
  );
}

function Filters() {
  const viewMode = useStore((state) => state.viewMode);
  const allFeatures = useStore((state) => state.allFeatures);
  const filters = useStore((state) => state.filters);
  const filterBounds = useStore((state) => state.filterBounds);
  const setViewMode = useStore((state) => state.setViewMode);
  const updateRange = useStore((state) => state.updateRange);
  const updateSelect = useStore((state) => state.updateSelect);
  const resetFilters = useStore((state) => state.resetFilters);

  const energyGrades = useMemo(() => {
    const values = new Set();
    allFeatures.forEach((feature) => {
      if (feature.properties.energikarakter) values.add(feature.properties.energikarakter);
    });
    return ['all', ...Array.from(values).sort()];
  }, [allFeatures]);

  const heatingGrades = useMemo(() => {
    const values = new Set();
    allFeatures.forEach((feature) => {
      if (feature.properties.oppvarmingskarakter) values.add(feature.properties.oppvarmingskarakter);
    });
    return ['all', ...Array.from(values).sort()];
  }, [allFeatures]);

  return (
    <div className="filters-stack">
      <section className="filter-card">
        <div className="section-heading">
          <div>
            <div className="section-kicker">View mode</div>
          </div>
        </div>
        <div className="segment-control">
          <button type="button" className={viewMode === 'markers' ? 'active' : ''} onClick={() => setViewMode('markers')}>
            Markers
          </button>
          <button type="button" className={viewMode === 'heatmap' ? 'active' : ''} onClick={() => setViewMode('heatmap')}>
            Heatmap
          </button>
        </div>
      </section>

      <section className="filter-card">
        <div className="section-heading">
          <div>
            <div className="section-kicker">Filters</div>
          </div>
          <button type="button" className="reset-button" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div className="filters-fields">
          <RangeField
            label="Build year"
            min={filterBounds.byggeaar[0]}
            max={filterBounds.byggeaar[1]}
            value={filters.byggeaar}
            onChange={(value) => updateRange('byggeaar', value)}
          />
          <RangeField
            label="Energy use"
            min={filterBounds.energibruk_kwh_m2[0]}
            max={filterBounds.energibruk_kwh_m2[1]}
            value={filters.energibruk_kwh_m2}
            onChange={(value) => updateRange('energibruk_kwh_m2', value)}
            suffix=" kWh"
          />
          <div className="filter-group">
            <div className="filter-label-row">
              <label>Energy grade</label>
            </div>
            <select value={filters.energikarakter} onChange={(event) => updateSelect('energikarakter', event.target.value)}>
              {energyGrades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade === 'all' ? 'All grades' : grade}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <div className="filter-label-row">
              <label>Heating grade</label>
            </div>
            <select value={filters.oppvarmingskarakter} onChange={(event) => updateSelect('oppvarmingskarakter', event.target.value)}>
              {heatingGrades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade === 'all' ? 'All types' : grade}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Filters;
