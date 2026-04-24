import { useMapStore } from '../store/useMapStore'
import { RATING_COLORS, RATING_DESC } from '../utils/geoUtils'

const RATINGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export default function Legend() {
  const zoomMode = useMapStore(s => s.zoomMode)

  return (
    <div className="legend map-overlay interactive" style={{ top: 16, right: 16 }}>
      {/* ── Heatmap legend ─────────────────────────── */}
      {zoomMode === 'heatmap' && (
        <>
          <div className="legend-title">Energiintensitet</div>
          <div className="legend-heatmap-bar" />
          <div className="legend-heatmap-labels">
            <span>Lav</span>
            <span>Høy</span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
            Gj.sn. energibruk per område
          </div>
        </>
      )}

      {/* ── Cluster legend ─────────────────────────── */}
      {zoomMode === 'cluster' && (
        <>
          <div className="legend-title">Klyngestørrelse</div>
          <div className="legend-ratings" style={{ gap: 6 }}>
            {[
              { label: '< 10 bygg', color: '#22c55e', size: 10 },
              { label: '10–49 bygg', color: '#fde047', size: 14 },
              { label: '50+ bygg', color: '#b91c1c', size: 18 },
            ].map(({ label, color, size }) => (
              <div key={label} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}>
                <div style={{
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                }} />
                {label}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Nearby legend (same as point) ─────────── */}
      {zoomMode !== 'heatmap' && (
        <>
          <div className="legend-title" style={{ marginTop: zoomMode === 'cluster' ? 14 : 0 }}>
            Energikarakter
          </div>
          <div className="legend-ratings">
            {RATINGS.map(r => (
              <div key={r} className="legend-rating-row">
                <div className="legend-dot" style={{ background: RATING_COLORS[r] }} />
                <span className="legend-letter" style={{ color: RATING_COLORS[r] }}>{r}</span>
                <span>{RATING_DESC[r]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
