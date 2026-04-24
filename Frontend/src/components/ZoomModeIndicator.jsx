import { useMapStore } from '../store/useMapStore'

const MODE_LABELS = {
  heatmap: 'Varmekart',
  cluster: '',
  point:   'Enkeltbygg',
}

export default function ZoomModeIndicator() {
  const zoomMode   = useMapStore(s => s.zoomMode)
  const currentZoom = useMapStore(s => s.currentZoom)

  return (
    <div className="zoom-mode map-overlay" style={{ top: 16, left: 16 }}>
      <span className="zoom-mode-dot" />
      {MODE_LABELS[zoomMode]}
      <span style={{ opacity: 0.4, marginLeft: 4 }}>
        zoom level {Math.round(currentZoom)}
      </span>
    </div>
  )
}
