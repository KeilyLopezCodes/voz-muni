import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import type { Cumplimiento, Indicadores } from '../api/reportes-api'
import { formatoNumero } from './formato'

interface Props {
  indicadores: Indicadores
}

interface Tarjeta {
  clave: string
  titulo: string
  valor: string
  detalle?: string
}

// Las tarjetas del tablero (SPEC 43). Un valor null (sin quejas medidas) se muestra como "—".
export function TarjetasIndicadores({ indicadores }: Props) {
  const { t } = useTranslation('reportes')
  const sinDato = t('sinDato')
  const horas = (valor: number | null) => (valor === null ? sinDato : t('horas', { valor: formatoNumero(valor) }))
  const porcentaje = (c: Cumplimiento) =>
    c.porcentaje === null ? sinDato : t('porcentaje', { valor: formatoNumero(c.porcentaje) })
  const detalle = (c: Cumplimiento) =>
    t('tarjetas.detalleCumplimiento', {
      cumple: formatoNumero(c.cumple),
      incumple: formatoNumero(c.incumple),
      pendiente: formatoNumero(c.pendiente),
    })

  const tarjetas: Tarjeta[] = [
    { clave: 'total', titulo: t('tarjetas.total'), valor: formatoNumero(indicadores.cantidad) },
    {
      clave: 'horasRespuesta',
      titulo: t('tarjetas.horasRespuesta'),
      valor: horas(indicadores.horasPromedioRespuesta),
      detalle: t('tarjetas.horasHabiles'),
    },
    {
      clave: 'horasResolucion',
      titulo: t('tarjetas.horasResolucion'),
      valor: horas(indicadores.horasPromedioResolucion),
      detalle: t('tarjetas.horasHabiles'),
    },
    {
      clave: 'cumplimientoRespuesta',
      titulo: t('tarjetas.cumplimientoRespuesta'),
      valor: porcentaje(indicadores.cumplimientoRespuesta),
      detalle: detalle(indicadores.cumplimientoRespuesta),
    },
    {
      clave: 'cumplimientoResolucion',
      titulo: t('tarjetas.cumplimientoResolucion'),
      valor: porcentaje(indicadores.cumplimientoResolucion),
      detalle: detalle(indicadores.cumplimientoResolucion),
    },
    { clave: 'escaladas', titulo: t('tarjetas.escaladas'), valor: formatoNumero(indicadores.escaladasAbiertas) },
  ]

  return (
    <Grid component="section" aria-label={t('tarjetas.titulo')} container spacing={2}>
      {tarjetas.map((tarjeta) => (
        <Grid key={tarjeta.clave} size={{ xs: 12, sm: 6, md: 4 }}>
          <Card variant="outlined" component="article" aria-label={tarjeta.titulo} sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" component="h2">
                {tarjeta.titulo}
              </Typography>
              <Typography variant="h4" component="p" sx={{ fontWeight: 800 }}>
                {tarjeta.valor}
              </Typography>
              {tarjeta.detalle && (
                <Typography variant="body2" color="text.secondary">
                  {tarjeta.detalle}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  )
}
