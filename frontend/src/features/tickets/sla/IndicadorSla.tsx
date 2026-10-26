import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import PauseCircleOutlineRounded from '@mui/icons-material/PauseCircleOutlineRounded'
import ScheduleRounded from '@mui/icons-material/ScheduleRounded'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { fechaGuatemala } from '../antiguedad'
import type { EstadoTicket, SlaDto } from '../api/tickets-api'

// Sin plazo de resolución que mostrar: la queja ya se resolvió o terminó.
const SIN_RESOLUCION: readonly string[] = ['resuelta', 'cerrada', 'rechazada']

interface IndicadorSlaProps {
  sla: SlaDto | null // null para el vecino: no se muestra nada
  estado: EstadoTicket | string
  ahora?: Date // la hora con la que se decide "vencida"; por defecto, la actual
}

interface Linea {
  clave: string
  texto: string
  titulo?: string
  vencida: boolean
  icono: ReactElement
}

// Vencimientos de una queja para los internos (SPEC 30), en las tarjetas de /asignacion y /atencion y en el
// detalle. "Vencida" se calcula aquí con la hora actual, para que el dato no quede viejo en la caché, y siempre
// lleva texto e ícono, no solo color (WCAG).
export function IndicadorSla({ sla, estado, ahora = new Date() }: IndicadorSlaProps) {
  const { t, i18n } = useTranslation('tickets')
  if (!sla || (sla.venceRespuesta === null && sla.venceResolucion === null && !sla.pausado)) {
    return null
  }
  const fecha = (iso: string) => fechaGuatemala(iso, i18n.language)
  const paso = (iso: string) => ahora.getTime() > new Date(iso).getTime()
  const lineas: Linea[] = []

  if (sla.primeraRespuestaEn !== null) {
    const tarde = sla.venceRespuesta !== null && new Date(sla.primeraRespuestaEn).getTime() > new Date(sla.venceRespuesta).getTime()
    lineas.push({
      clave: 'respuesta',
      texto: t(tarde ? 'sla.respondidaFueraDePlazo' : 'sla.respondida'),
      titulo: fecha(sla.primeraRespuestaEn),
      vencida: tarde,
      icono: tarde ? <ErrorOutlineRounded fontSize="inherit" /> : <CheckCircleOutlineRounded fontSize="inherit" />,
    })
  } else if (sla.venceRespuesta !== null) {
    const vencida = paso(sla.venceRespuesta)
    lineas.push({
      clave: 'respuesta',
      texto: vencida ? t('sla.respuestaVencida') : t('sla.responderAntes', { fecha: fecha(sla.venceRespuesta) }),
      titulo: vencida ? t('sla.venceEl', { fecha: fecha(sla.venceRespuesta) }) : undefined,
      vencida,
      icono: vencida ? <ErrorOutlineRounded fontSize="inherit" /> : <ScheduleRounded fontSize="inherit" />,
    })
  }

  if (!SIN_RESOLUCION.includes(estado)) {
    if (sla.pausado && sla.restanteMinutosEnPausa !== null) {
      lineas.push({
        clave: 'resolucion',
        texto: t('sla.enPausa', {
          horas: Math.floor(sla.restanteMinutosEnPausa / 60),
          minutos: sla.restanteMinutosEnPausa % 60,
        }),
        vencida: false,
        icono: <PauseCircleOutlineRounded fontSize="inherit" />,
      })
    } else if (sla.venceResolucion !== null) {
      const vencida = paso(sla.venceResolucion)
      lineas.push({
        clave: 'resolucion',
        texto: vencida ? t('sla.resolucionVencida') : t('sla.resolverAntes', { fecha: fecha(sla.venceResolucion) }),
        titulo: vencida ? t('sla.venceEl', { fecha: fecha(sla.venceResolucion) }) : undefined,
        vencida,
        icono: vencida ? <ErrorOutlineRounded fontSize="inherit" /> : <ScheduleRounded fontSize="inherit" />,
      })
    }
  }

  if (lineas.length === 0) {
    return null
  }
  return (
    <Stack spacing={0.25} aria-label={t('sla.titulo')} role="group" sx={{ minWidth: 0 }}>
      {lineas.map((linea) => (
        <Typography
          key={linea.clave}
          variant="body2"
          title={linea.titulo}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            overflowWrap: 'anywhere',
            color: linea.vencida ? 'error.main' : 'text.secondary',
            fontWeight: linea.vencida ? 700 : undefined,
          }}
        >
          <Box component="span" aria-hidden sx={{ display: 'inline-flex', flexShrink: 0 }}>
            {linea.icono}
          </Box>
          {linea.texto}
        </Typography>
      ))}
    </Stack>
  )
}
