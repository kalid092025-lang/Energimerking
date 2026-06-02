import { useMemo } from 'react';
import { useStore } from '../store/useStore.js';

function RangeField({ label, min, max, value, onChange, suffix = '', step = 1, tooltip = '' }) {
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
        <label>
          {tooltip ? (
            <HelpLabel tooltip={tooltip}>{label}</HelpLabel>
          ) : (
            label
          )}
        </label>
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

function HelpLabel({ children, tooltip }) {
  return (
    <span className="label-with-help">
      <span>{children}</span>
      <button
        type="button"
        className="help-tooltip"
        aria-label={tooltip}
        data-tooltip={tooltip}
      >
        ?
      </button>
    </span>
  );
}

function formatEnergyRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return 'no energy use';
  }

  const roundedMin = Math.round(min);
  const roundedMax = Math.round(max);
  return roundedMin === roundedMax
    ? `${roundedMin} kWh/m2`
    : `${roundedMin}-${roundedMax} kWh/m2`;
}

function Filters() {
  const viewMode = useStore((state) => state.viewMode);
  const allFeatures = useStore((state) => state.allFeatures);
  const filters = useStore((state) => state.filters);
  const filterBounds = useStore((state) => state.filterBounds);
  const radiusInMeters = useStore((state) => state.radiusInMeters);
  const setViewMode = useStore((state) => state.setViewMode);
  const updateRange = useStore((state) => state.updateRange);
  const updateSelect = useStore((state) => state.updateSelect);
  const setRadiusInMeters = useStore((state) => state.setRadiusInMeters);
  const resetFilters = useStore((state) => state.resetFilters);
  const radiusLabel = radiusInMeters >= 1000
    ? `${(radiusInMeters / 1000).toFixed(radiusInMeters % 1000 === 0 ? 0 : 1)} km`
    : `${radiusInMeters} m`;

  const energyGrades = useMemo(() => {
    const ranges = new Map();
    allFeatures.forEach((feature) => {
      const grade = feature.properties.energikarakter;
      const energyUse = Number(feature.properties.energibruk_kwh_m2);
      if (!grade || !Number.isFinite(energyUse) || energyUse <= 0) return;

      const currentRange = ranges.get(grade) || {
        min: energyUse,
        max: energyUse
      };
      ranges.set(grade, {
        min: Math.min(currentRange.min, energyUse),
        max: Math.max(currentRange.max, energyUse)
      });
    });
    return Array.from(ranges.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([grade, range]) => ({
        grade,
        rangeLabel: formatEnergyRange(range.min, range.max)
      }));
  }, [allFeatures]);

  const heatingGrades = useMemo(() => {
    const values = new Set();
    allFeatures.forEach((feature) => {
      if (feature.properties.oppvarmingskarakter) values.add(feature.properties.oppvarmingskarakter);
    });
    return ['all', ...Array.from(values).sort()];
  }, [allFeatures]);

  const selectedEnergyGrades = Array.isArray(filters.energikarakter)
    ? filters.energikarakter
    : filters.energikarakter === 'all'
      ? []
      : [filters.energikarakter];

  const toggleEnergyGrade = (grade) => {
    const nextGrades = selectedEnergyGrades.includes(grade)
      ? selectedEnergyGrades.filter((item) => item !== grade)
      : [...selectedEnergyGrades, grade].sort();

    updateSelect('energikarakter', nextGrades);
  };

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
            suffix=" kWh/m2"
            tooltip="Energy use is calculated delivered energy per square meter for normal use, shown as kWh/m2. Enova uses this calculated value for the energy grade."
          />
          <div className="filter-group radius-control">
            <div className="filter-label-row">
              <label htmlFor="radius-range">
                <HelpLabel tooltip="Radius controls how far from your clicked map point the app searches for nearby buildings. Turn Radius on, choose a distance here, then click the map.">
                  Radius
                </HelpLabel>
              </label>
              <div className="filter-range-value">{radiusLabel}</div>
            </div>
            <input
              id="radius-range"
              type="range"
              min="500"
              max="10000"
              step="500"
              value={radiusInMeters}
              onChange={(event) => setRadiusInMeters(Number(event.target.value))}
            />
          </div>
          <div className="filter-group">
            <div className="filter-label-row">
              <label>
                <HelpLabel tooltip="Energy grade runs from A to G. A is best and G is weakest. Enova bases it on calculated delivered energy per square meter for normal use, not measured consumption.">
                  Energy grade
                </HelpLabel>
              </label>
              <div className="filter-range-value">
                {selectedEnergyGrades.length === 0 ? 'All' : selectedEnergyGrades.join(', ')}
              </div>
            </div>
            <div className="checkbox-filter-list">
              {energyGrades.map(({ grade, rangeLabel }) => (
                <label key={grade} className="checkbox-filter-option">
                  <input
                    type="checkbox"
                    checked={selectedEnergyGrades.includes(grade)}
                    onChange={() => toggleEnergyGrade(grade)}
                  />
                  <span>{grade} ({rangeLabel})</span>
                </label>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <div className="filter-label-row">
              <label>
                <HelpLabel tooltip="Heating grade is the red-to-green score for the installed heating system. Green is best and means a high share of heating can use other energy carriers than direct electricity, oil, or gas. It is independent of the energy grade.">
                  Heating grade
                </HelpLabel>
              </label>
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
