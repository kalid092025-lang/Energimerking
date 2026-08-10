import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Database, Flame, Landmark, Layers, MapPin, PlugZap, TrendingUp } from 'lucide-react';
import { fetchBydelStats } from '../services/api.js';
import { useStore } from '../store/useStore.js';
import { MAP_VIEW_MODES } from '../utils/constants.js';
import { OSLO_BYDELER, findBydel } from '../utils/osloBydeler.js';

function RangeField({ label, min, max, value, onChange, suffix = '', step = 1, tooltip = '' }) {
  const [draftValue, setDraftValue] = useState(value);
  const draftValueRef = useRef(value);
  const [currentMin, currentMax] = draftValue;
  const span = max - min || 1;
  const minPercent = ((currentMin - min) / span) * 100;
  const maxPercent = ((currentMax - min) / span) * 100;

  useEffect(() => {
    setDraftValue(value);
    draftValueRef.current = value;
  }, [value]);

  const updateDraftValue = (nextValue) => {
    draftValueRef.current = nextValue;
    setDraftValue(nextValue);
  };

  const commitDraftValue = () => {
    onChange(draftValueRef.current);
  };

  const updateMin = (nextValue) => {
    updateDraftValue([Math.min(Number(nextValue), currentMax), currentMax]);
  };
  const updateMax = (nextValue) => {
    updateDraftValue([currentMin, Math.max(Number(nextValue), currentMin)]);
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
          onPointerUp={commitDraftValue}
          onPointerCancel={commitDraftValue}
          onBlur={commitDraftValue}
          onKeyUp={commitDraftValue}
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
          onPointerUp={commitDraftValue}
          onPointerCancel={commitDraftValue}
          onBlur={commitDraftValue}
          onKeyUp={commitDraftValue}
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

function SectionToggle({ children, controlsId, isOpen, onToggle }) {
  return (
    <button
      type="button"
      className="section-toggle-button"
      aria-expanded={isOpen}
      aria-controls={controlsId}
      onClick={onToggle}
    >
      <span className="section-kicker">{children}</span>
      <ChevronDown className="section-toggle-icon" aria-hidden="true" strokeWidth={2.2} />
    </button>
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

const FILTER_MODE_ICONS = {
  markers: MapPin,
  heatmap: Flame,
  tiles: Layers,
  upgrade: TrendingUp
};

const FILTER_MODE_ITEMS = MAP_VIEW_MODES.map((item) => ({
  ...item,
  Icon: FILTER_MODE_ICONS[item.value]
}));

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

function formatRadius(radiusInMeters) {
  return radiusInMeters >= 1000
    ? `${(radiusInMeters / 1000).toFixed(radiusInMeters % 1000 === 0 ? 0 : 1)} km`
    : `${radiusInMeters} m`;
}

function percentage(count, total) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function countBy(values, allowedValues) {
  const counts = Object.fromEntries(allowedValues.map((value) => [value, 0]));

  values.forEach((value) => {
    if (value in counts) {
      counts[value] += 1;
    }
  });

  return counts;
}

function mostCommon(values, fallback = 'N/A') {
  const counts = new Map();

  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))[0]?.[0] || fallback;
}

function median(values) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : Math.round(sorted[middle]);
}

function buildBydelStats(features) {
  const total = features.length;
  const energyValues = [];
  const buildYears = [];
  const energyGrades = [];
  const heatingGrades = [];
  let oldBuildingCount = 0;
  let highUpgradeCount = 0;

  features.forEach((feature) => {
    const props = feature.properties || {};
    const energyGrade = String(props.energikarakter || '').trim().toUpperCase();
    const heatingGrade = normalizeHeatingGrade(props.oppvarmingskarakter);
    const energy = Number(props.energibruk_kwh_m2);
    const buildYear = Number(props.byggeaar);
    const upgradeScore = Number(props.upgradeScore);

    if (energyGrade) {
      energyGrades.push(energyGrade);
    }

    if (heatingGrade) {
      heatingGrades.push(heatingGrade);
    }

    if (Number.isFinite(energy) && energy > 0) {
      energyValues.push(energy);
    }

    if (Number.isFinite(buildYear) && buildYear > 0) {
      buildYears.push(buildYear);
      if (buildYear < 1980) oldBuildingCount += 1;
    }

    if (Number.isFinite(upgradeScore) && upgradeScore >= 75) {
      highUpgradeCount += 1;
    }
  });

  const averageEnergy = energyValues.length
    ? Math.round(energyValues.reduce((sum, value) => sum + value, 0) / energyValues.length)
    : null;
  const averageBuildYear = buildYears.length
    ? Math.round(buildYears.reduce((sum, value) => sum + value, 0) / buildYears.length)
    : null;
  const energyGradeCounts = countBy(energyGrades, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const heatingGradeCounts = countBy(heatingGrades, ['GREEN', 'YELLOW', 'ORANGE', 'RED']);

  return {
    total,
    averageEnergy,
    medianEnergy: median(energyValues),
    mostCommonEnergyGrade: mostCommon(energyGrades),
    mostCommonHeatingGrade: mostCommon(heatingGrades),
    energyGradeCounts,
    heatingGradeCounts,
    averageBuildYear,
    oldBuildingShare: percentage(oldBuildingCount, total),
    highUpgradeShare: percentage(highUpgradeCount, total)
  };
}

function formatEnergy(value) {
  return value ? `${value} kWh/m2` : 'N/A';
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString() : 'N/A';
}

function formatCurrency(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value)).toLocaleString()} kr` : 'N/A';
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : 'N/A';
}

function formatCountShare(count, total) {
  return `${percentage(count, total)}% (${count.toLocaleString()})`;
}

function BydelStatSection({ Icon, children, status = '' }) {
  return (
    <div className="bydel-stat-section">
      <Icon className="bydel-stat-section-icon" aria-hidden="true" strokeWidth={2.2} />
      <span>{children}</span>
      {status && <small>{status}</small>}
    </div>
  );
}

function BydelStat({ label, value }) {
  return (
    <div className="bydel-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Filters() {
  const viewMode = useStore((state) => state.viewMode);
  const allFeatures = useStore((state) => state.allFeatures);
  const selectedBydelId = useStore((state) => state.selectedBydelId);
  const filters = useStore((state) => state.filters);
  const filterBounds = useStore((state) => state.filterBounds);
  const radiusInMeters = useStore((state) => state.radiusInMeters);
  const setViewMode = useStore((state) => state.setViewMode);
  const setSelectedBydelId = useStore((state) => state.setSelectedBydelId);
  const updateRange = useStore((state) => state.updateRange);
  const updateSelect = useStore((state) => state.updateSelect);
  const setRadiusInMeters = useStore((state) => state.setRadiusInMeters);
  const resetFilters = useStore((state) => state.resetFilters);
  const radiusLabel = radiusInMeters >= 1000
    ? `${(radiusInMeters / 1000).toFixed(radiusInMeters % 1000 === 0 ? 0 : 1)} km`
    : `${radiusInMeters} m`;
  const selectedBydel = findBydel(selectedBydelId);
  const bydelStats = useMemo(() => buildBydelStats(allFeatures), [allFeatures]);
  const [externalBydelStats, setExternalBydelStats] = useState(null);
  const [externalBydelStatus, setExternalBydelStatus] = useState('idle');
  const [statsOpen, setStatsOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const bydelStatsCache = useRef(new Map());

  useEffect(() => {
    let isActive = true;

    if (bydelStatsCache.current.has(selectedBydelId)) {
      setExternalBydelStats(bydelStatsCache.current.get(selectedBydelId));
      setExternalBydelStatus('ready');
      return () => {
        isActive = false;
      };
    }

    setExternalBydelStatus('loading');
    setExternalBydelStats(null);

    fetchBydelStats(selectedBydelId)
      .then((payload) => {
        if (!isActive) return;
        bydelStatsCache.current.set(selectedBydelId, payload);
        setExternalBydelStats(payload);
        setExternalBydelStatus('ready');
      })
      .catch(() => {
        if (!isActive) return;
        setExternalBydelStatus('error');
      });

    return () => {
      isActive = false;
    };
  }, [selectedBydelId]);

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
        <div className="filter-group view-mode-select">
          <div className="mode-segment-control" role="group" aria-label="View mode">
            {FILTER_MODE_ITEMS.map((item) => {
              const Icon = item.Icon;
              const isActive = viewMode === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  className={[
                    'mode-segment-button',
                    isActive ? 'active' : '',
                    item.isolated ? 'is-tiles-mode' : ''
                  ].filter(Boolean).join(' ')}
                  onClick={() => setViewMode(item.value)}
                  aria-pressed={isActive}
                  data-mode={item.value}
                >
                  <Icon className="mode-segment-icon" aria-hidden="true" strokeWidth={2.2} />
                  <span className="mode-segment-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {viewMode === 'markers' && (
          <div className="bydel-panel">
            <div className="section-heading">
              <div>
                <div className="section-kicker">Bydeler i Oslo</div>
              </div>
            </div>
            <div className="bydel-select-wrap">
              <select
                className="bydel-select"
                aria-label="Velg bydel i Oslo"
                value={selectedBydelId}
                onChange={(event) => setSelectedBydelId(event.target.value)}
              >
                {OSLO_BYDELER.map((bydel) => (
                  <option key={bydel.id} value={bydel.id}>
                    {bydel.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="bydel-meta">
              <span>{selectedBydel.name}</span>
              <strong>{formatRadius(selectedBydel.radiusInMeters)} radius</strong>
            </div>
            <div className="section-heading section-heading-compact">
              <SectionToggle
                controlsId="bydel-stats-panel"
                isOpen={statsOpen}
                onToggle={() => setStatsOpen((open) => !open)}
              >
                Stats
              </SectionToggle>
            </div>
            <div
              id="bydel-stats-panel"
              className={`collapsible-region ${statsOpen ? 'is-open' : ''}`}
              aria-hidden={!statsOpen}
              inert={statsOpen ? undefined : ''}
            >
              <div className="bydel-stats-grid">
                <BydelStatSection Icon={Database}>Database stats</BydelStatSection>
                <BydelStat label="Buildings" value={bydelStats.total.toLocaleString()} />
                <BydelStat label="Avg energy" value={formatEnergy(bydelStats.averageEnergy)} />
                <BydelStat label="Typical energy" value={formatEnergy(bydelStats.medianEnergy)} />
                <BydelStat label="Common energy grade" value={bydelStats.mostCommonEnergyGrade} />
                <BydelStat label="Common heating" value={bydelStats.mostCommonHeatingGrade} />
                <BydelStat label="Avg build year" value={bydelStats.averageBuildYear || 'N/A'} />
                <BydelStat label="Before 1980" value={`${bydelStats.oldBuildingShare}%`} />
                <BydelStat label="High upgrade" value={`${bydelStats.highUpgradeShare}%`} />
                {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((grade) => (
                  <BydelStat
                    key={grade}
                    label={`Energy ${grade}`}
                    value={formatCountShare(bydelStats.energyGradeCounts[grade], bydelStats.total)}
                  />
                ))}
                <BydelStat label="Heating green" value={formatCountShare(bydelStats.heatingGradeCounts.GREEN, bydelStats.total)} />
                <BydelStat label="Heating yellow" value={formatCountShare(bydelStats.heatingGradeCounts.YELLOW, bydelStats.total)} />
                <BydelStat label="Heating orange" value={formatCountShare(bydelStats.heatingGradeCounts.ORANGE, bydelStats.total)} />
                <BydelStat label="Heating red" value={formatCountShare(bydelStats.heatingGradeCounts.RED, bydelStats.total)} />

                <BydelStatSection
                  Icon={Landmark}
                  status={externalBydelStatus === 'loading' ? 'loading' : ''}
                >
                  SSB / Oslo stats
                </BydelStatSection>
                <BydelStat label="Median price" value={formatCurrency(externalBydelStats?.housing?.medianHousePrice)} />
                <BydelStat label="Price per m2" value={formatCurrency(externalBydelStats?.housing?.pricePerM2)} />
                <BydelStat label="Price trend" value={formatPercent(externalBydelStats?.housing?.priceTrendPercent)} />
                <BydelStat label="Median income" value={formatCurrency(externalBydelStats?.demographics?.medianHouseholdIncome)} />
                <BydelStat label="Population" value={formatNumber(externalBydelStats?.demographics?.population)} />
                <BydelStat label="Population growth" value={formatPercent(externalBydelStats?.demographics?.populationGrowthPercent)} />

                <BydelStatSection Icon={PlugZap}>NOBIL stats</BydelStatSection>
                <BydelStat label="Public chargers" value={formatNumber(externalBydelStats?.chargers?.publicChargers)} />
                <BydelStat label="Fast chargers" value={formatNumber(externalBydelStats?.chargers?.fastChargers)} />
                {externalBydelStatus === 'error' && (
                  <div className="bydel-stat-note">External bydel stats are unavailable.</div>
                )}
                {externalBydelStats?.chargers?.status && (
                  <div className="bydel-stat-note">{externalBydelStats.chargers.status}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="filter-card">
        <div className="section-heading">
          <SectionToggle
            controlsId="filters-fields-panel"
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((open) => !open)}
          >
            Filters
          </SectionToggle>
          <button type="button" className="reset-button" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div
          id="filters-fields-panel"
          className={`collapsible-region ${filtersOpen ? 'is-open' : ''}`}
          aria-hidden={!filtersOpen}
          inert={filtersOpen ? undefined : ''}
        >
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
        </div>
      </section>
    </div>
  );
}

export default Filters;
