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
      <span className="help-tooltip-panel" role="tooltip">{tooltip}</span>
    </span>
  );
}

const ENERGY_GRADE_MEANINGS = {
  A: 'best',
  B: 'very good',
  C: 'good',
  D: 'average',
  E: 'weak',
  F: 'poor',
  G: 'weakest'
};

const HEATING_GRADE_MEANINGS = {
  GREEN: 'very high renewable/non-electric share',
  YELLOW: 'moderate renewable share',
  ORANGE: 'mostly electric heating',
  RED: 'direct electric or fossil heating'
};

const HEATING_GRADE_ORDER = {
  GREEN: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3
};

function normalizeHeatingGrade(grade) {
  return String(grade || '').trim().toUpperCase();
}

function heatingGradeMeaning(grade) {
  return HEATING_GRADE_MEANINGS[normalizeHeatingGrade(grade)] || 'heating score';
}

function compareHeatingGrades(left, right) {
  const leftGrade = normalizeHeatingGrade(left);
  const rightGrade = normalizeHeatingGrade(right);
  const leftOrder = HEATING_GRADE_ORDER[leftGrade] ?? 99;
  const rightOrder = HEATING_GRADE_ORDER[rightGrade] ?? 99;

  return leftOrder === rightOrder
    ? leftGrade.localeCompare(rightGrade)
    : leftOrder - rightOrder;
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
    const values = new Set();
    allFeatures.forEach((feature) => {
      const grade = feature.properties.energikarakter;
      if (grade) values.add(String(grade).trim().toUpperCase());
    });
    return Array.from(values)
      .sort((left, right) => left.localeCompare(right))
      .map((grade) => ({
        grade,
        meaning: ENERGY_GRADE_MEANINGS[grade] || 'registered grade'
      }));
  }, [allFeatures]);

  const heatingGrades = useMemo(() => {
    const values = new Set();
    allFeatures.forEach((feature) => {
      const grade = feature.properties.oppvarmingskarakter;
      if (grade && normalizeHeatingGrade(grade) !== 'LIGHT GREEN') values.add(grade);
    });
    return Array.from(values).sort(compareHeatingGrades);
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
                <HelpLabel tooltip="Energy grade runs from A to G. A is best and G is weakest. The exact kWh/m2 thresholds vary by building type/category, so loaded data ranges can overlap.">
                  Energy grade
                </HelpLabel>
              </label>
              <div className="filter-range-value">
                {selectedEnergyGrades.length === 0 ? 'All' : selectedEnergyGrades.join(', ')}
              </div>
            </div>
            <div className="checkbox-filter-list">
              {energyGrades.map(({ grade, meaning }) => (
                <label key={grade} className="checkbox-filter-option">
                  <input
                    type="checkbox"
                    checked={selectedEnergyGrades.includes(grade)}
                    onChange={() => toggleEnergyGrade(grade)}
                  />
                  <span className="filter-option-copy">
                    <strong>{grade}</strong>
                    <span>{meaning}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <div className="filter-label-row">
              <label>
                <HelpLabel tooltip="Heating grade describes the heating energy source. Green means a very high share of renewable/non-electric heating. Yellow means moderate renewable heating. Orange is mostly electric heating. Red is predominantly direct electric or fossil-fuel heating.">
                  Heating grade
                </HelpLabel>
              </label>
            </div>
            <div className="checkbox-filter-list">
              <label className="checkbox-filter-option">
                <input
                  type="radio"
                  name="heating-grade"
                  checked={filters.oppvarmingskarakter === 'all'}
                  onChange={() => updateSelect('oppvarmingskarakter', 'all')}
                />
                <span className="filter-option-copy">
                  <strong>All</strong>
                  <span>all heating scores</span>
                </span>
              </label>
              {heatingGrades.map((grade) => (
                <label key={grade} className="checkbox-filter-option">
                  <input
                    type="radio"
                    name="heating-grade"
                    checked={filters.oppvarmingskarakter === grade}
                    onChange={() => updateSelect('oppvarmingskarakter', grade)}
                  />
                  <span className="filter-option-copy">
                    <strong>{grade}</strong>
                    <span>{heatingGradeMeaning(grade)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Filters;
