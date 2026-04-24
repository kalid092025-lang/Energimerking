import { useMapStore } from '../store/useMapStore'
import { fmtEnergy, RATING_COLORS, RATING_DESC } from '../utils/geoUtils'

const FIELDS = [
  { key: 'byggeaar',         label: 'Byggeår' },
  { key: 'bygningskategori', label: 'Kategori' },
  { key: 'kommunenavn',      label: 'Kommune' },
  { key: 'poststed',         label: 'Poststed' },
  { key: 'adresse',          label: 'Adresse' },
  { key: 'bygningsnummer',   label: 'Bygningsnr.' },
]

export default function BuildingPanel() {
  const building     = useMapStore(s => s.selectedBuilding)
  const clearSelection = useMapStore(s => s.clearSelection)

  const open = !!building
  const p    = building ?? {}

  const rating = p.energikarakter ?? null
  const color  = rating ? RATING_COLORS[rating] : 'var(--text-tertiary)'

  return (
    <div className={`building-panel${open ? ' open' : ''}`}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="panel-header">
        <div className="panel-title">
          {p.adresse ?? p.poststed ?? 'Ukjent adresse'}
        </div>
        <button className="panel-close" onClick={clearSelection}>×</button>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="panel-body">
        {open && (
          <>
            {/* Energy badge */}
            {rating && (
              <div
                className="energy-badge"
                style={{ color, borderColor: color }}
              >
                <div className="energy-badge-letter">{rating}</div>
                <div className="energy-badge-info">
                  <div className="energy-badge-kwh">
                    {fmtEnergy(p.energibruk_kwh_m2)}
                  </div>
                  <div className="energy-badge-unit">
                    {RATING_DESC[rating] ?? ''}
                  </div>
                </div>
              </div>
            )}

            {/* Detail grid */}
            <div className="detail-grid">
              {FIELDS.map(({ key, label }) => (
                p[key] != null && (
                  <div key={key} className="detail-row">
                    <span className="detail-key">{label}</span>
                    <span className="detail-val">{p[key]}</span>
                  </div>
                )
              ))}
              {p.energibruk_kwh_m2 != null && (
                <div className="detail-row">
                  <span className="detail-key">Energibruk</span>
                  <span className="detail-val" style={{ color }}>
                    {fmtEnergy(p.energibruk_kwh_m2)}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
