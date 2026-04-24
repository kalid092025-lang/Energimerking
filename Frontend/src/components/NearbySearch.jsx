import { useMapStore } from '../store/useMapStore'
import { RATING_COLORS } from '../utils/geoUtils'

const RADIUS_OPTIONS = [100, 250, 500, 1000, 2000, 5000]

function resolveAddress(p) {
  return p.adresse || p.poststed || null
}

function resolveKommune(p) {
  return p.kommunenavn || null
}

export default function NearbySearch() {
  const nearbyActive = useMapStore(s => s.nearbyActive)
  const nearbyRadius = useMapStore(s => s.nearbyRadius)
  const nearbyResults = useMapStore(s => s.nearbyResults)
  const setNearbyActive = useMapStore(s => s.setNearbyActive)
  const setNearbyRadius = useMapStore(s => s.setNearbyRadius)
  const clearNearby = useMapStore(s => s.clearNearby)

  return (
    <div className="sidebar-section">
      <div className="section-label">Nærhet</div>

      <button
        className={`nearby-toggle${nearbyActive ? ' active' : ''}`}
        onClick={() => nearbyActive ? clearNearby() : setNearbyActive(true)}
      >
        <span className="dot" />
        {nearbyActive ? 'Klikk på kartet' : 'Søk i nærheten'}
      </button>

      {nearbyActive && (
        <>
          <p className="nearby-hint">
            Klikk hvor som helst på kartet for å finne bygg innen valgt radius.
          </p>
          <div className="nearby-radius-row">
            <span className="radius-label">Radius:</span>
            <select
              className="styled-select"
              value={nearbyRadius}
              onChange={e => setNearbyRadius(Number(e.target.value))}
            >
              {RADIUS_OPTIONS.map(r => (
                <option key={r} value={r}>
                  {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {nearbyResults.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
                {nearbyResults.length}
              </span>
              {' '}bygg funnet
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 320,
              overflowY: 'auto',
              paddingRight: 2,
            }}
          >
            {nearbyResults.map((f, i) => {
              const p = f.properties ?? {}
              const addr = resolveAddress(p)
              const kommune = resolveKommune(p)
              const rating = p.energikarakter ?? null
              const color = rating ? RATING_COLORS[rating] : 'var(--text-tertiary)'
              const energy = p.energibruk_kwh_m2 ?? null

              return (
                <div
                  key={i}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      background: rating ? `${color}22` : 'var(--bg-hover)',
                      border: `1px solid ${rating ? color : 'var(--border-mid)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 11,
                      color: rating ? color : 'var(--text-tertiary)',
                      flexShrink: 0,
                    }}
                  >
                    {rating ?? '?'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: addr ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        fontWeight: addr ? 500 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {addr ?? `Bygg ${i + 1}`}
                    </div>
                    {kommune && (
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--text-tertiary)',
                          marginTop: 1,
                        }}
                      >
                        {kommune}
                      </div>
                    )}
                  </div>

                  {energy != null && (
                    <div
                      style={{
                        fontSize: 10,
                        color,
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {Math.round(energy)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button className="btn-reset" style={{ marginTop: 10 }} onClick={clearNearby}>
            TÃ¸m resultat
          </button>
        </div>
      )}
    </div>
  )
}
