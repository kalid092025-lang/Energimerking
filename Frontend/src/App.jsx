import { useEffect, useRef, useState } from 'react'
import { useBuildings } from './hooks/useBuildings'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import BuildingPanel from './components/BuildingPanel'
import Legend from './components/Legend'
import ZoomModeIndicator from './components/ZoomModeIndicator'

export default function App() {
  const mapRef = useRef(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') ?? 'dark')

  const { isLoading } = useBuildings()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <div className="app-layout">
      <Sidebar
        mapRef={mapRef}
        theme={theme}
        onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
      />

      <div style={{ position: 'relative', overflow: 'hidden', height: '100vh' }}>
        {isLoading && <div className="loading-bar" />}

        <MapView key={theme} mapRef={mapRef} theme={theme} />
        <ZoomModeIndicator />
        <Legend />
        <BuildingPanel />
      </div>
    </div>
  )
}
