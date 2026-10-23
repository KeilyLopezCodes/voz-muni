import 'leaflet/dist/leaflet.css'
import Box from '@mui/material/Box'
import { useTranslation } from 'react-i18next'
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import type { LimitesMunicipio } from '../api/registro-api'
import type { Punto } from './estado-registro'

// Se carga con React.lazy solo en el paso Ubicación: Leaflet no entra en el bundle inicial (RNF-02).
// Si las teselas no cargan, el mapa queda gris y el resto del paso sigue funcionando.

const TESELAS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export interface MapaUbicacionProps {
  limites: LimitesMunicipio
  punto: Punto | null
  onMarcar: (punto: Punto) => void
}

function ClicEnMapa({ onMarcar }: Pick<MapaUbicacionProps, 'onMarcar'>) {
  useMapEvents({
    click: (evento) => onMarcar({ lat: evento.latlng.lat, lng: evento.latlng.lng }),
  })
  return null
}

// Tocar el mapa pone el marcador; otro toque lo mueve. Un círculo evita depender de las imágenes
// del marcador por defecto de Leaflet, que no se empaquetan bien con Vite.
export default function MapaUbicacion({ limites, punto, onMarcar }: MapaUbicacionProps) {
  const { t } = useTranslation('tickets')
  const caja: [[number, number], [number, number]] = [
    [limites.latMin, limites.lngMin],
    [limites.latMax, limites.lngMax],
  ]

  return (
    <Box role="region" aria-label={t('nuevo.ubicacion.mapa')} sx={{ height: 280, width: '100%' }}>
      <MapContainer bounds={caja} maxBounds={caja} maxBoundsViscosity={1} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={TESELAS} attribution={t('nuevo.ubicacion.atribucion')} />
        <ClicEnMapa onMarcar={onMarcar} />
        {punto && <CircleMarker center={[punto.lat, punto.lng]} radius={10} />}
      </MapContainer>
    </Box>
  )
}
