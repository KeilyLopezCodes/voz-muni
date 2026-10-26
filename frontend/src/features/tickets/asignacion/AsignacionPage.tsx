import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip, { type ChipProps } from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Pagination from '@mui/material/Pagination'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../../shared/auth/session'
import {
  CLAVES_ASIGNACION,
  listarPorAsignar,
  TAMANO_PAGINA,
  type TicketPorAsignar,
  VISTAS_POR_ASIGNAR,
  type VistaPorAsignar,
} from '../api/asignacion-api'
import type { Prioridad } from '../api/triage-api'
import { antiguedad, fechaGuatemala } from '../antiguedad'
import { IndicadorSla } from '../sla/IndicadorSla'
import { PanelAsignacion } from './PanelAsignacion'

// Color de cada prioridad; la etiqueta sale de las traducciones de SPEC 19.
const COLOR_PRIORIDAD: Record<Prioridad, ChipProps['color']> = {
  urgente: 'error',
  alta: 'warning',
  media: 'info',
  baja: 'default',
}

// Bandeja del coordinador (su dependencia) y del supervisor (todas), SPEC 20.
export function AsignacionPage() {
  const { t, i18n } = useTranslation('tickets')
  const session = useSession()
  const [vista, setVista] = useState<VistaPorAsignar>('sin_tecnico')
  const [pagina, setPagina] = useState(1)
  const [elegido, setElegido] = useState<TicketPorAsignar | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const bandeja = useQuery({
    queryKey: [...CLAVES_ASIGNACION.bandeja, vista, pagina],
    queryFn: () => listarPorAsignar(vista, pagina),
  })
  const ahora = new Date()
  const paginas = bandeja.data ? Math.ceil(bandeja.data.total / TAMANO_PAGINA) : 0
  // El coordinador solo ve su dependencia; al supervisor le sirve saber de cuál es cada queja.
  const verDependencia = session?.rol === 'supervisor'

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('asignacion.titulo')}
      </Typography>

      <Stack spacing={2}>
        <ToggleButtonGroup
          value={vista}
          exclusive
          size="small"
          aria-label={t('asignacion.vista.etiqueta')}
          onChange={(_evento, valor: VistaPorAsignar | null) => {
            if (valor) {
              setVista(valor)
              setPagina(1)
            }
          }}
          sx={{ flexWrap: 'wrap' }}
        >
          {VISTAS_POR_ASIGNAR.map((opcion) => (
            <ToggleButton key={opcion} value={opcion}>
              {t(`asignacion.vista.${opcion}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {bandeja.isPending && <CircularProgress aria-label={t('asignacion.cargando')} />}
        {bandeja.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void bandeja.refetch()}>
                {t('asignacion.reintentar')}
              </Button>
            }
          >
            {t('asignacion.errorCarga')}
          </Alert>
        )}
        {bandeja.isSuccess && bandeja.data.datos.length === 0 && (
          <Alert severity="info">{t('asignacion.vacia')}</Alert>
        )}

        {bandeja.data?.datos.map((ticket) => (
          <Card key={ticket.id} variant="outlined">
            <CardActionArea
              onClick={() => setElegido(ticket)}
              aria-label={t('asignacion.abrir', { numero: ticket.numero })}
            >
              <CardContent>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <Typography variant="overline">{ticket.numero}</Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip size="small" variant="outlined" label={t(`asignacion.estados.${ticket.estado}`)} />
                    <Chip
                      size="small"
                      color={COLOR_PRIORIDAD[ticket.prioridad]}
                      label={t(`triage.prioridades.${ticket.prioridad}`)}
                    />
                  </Stack>
                </Stack>
                <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                  {ticket.titulo}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {[ticket.categoria.nombre, ticket.zona.nombre, ...(verDependencia ? [ticket.dependencia.nombre] : [])].join(
                    ' · ',
                  )}{' '}
                  ·{' '}
                  <time dateTime={ticket.creadoEn} title={fechaGuatemala(ticket.creadoEn, i18n.language)}>
                    {antiguedad(ticket.creadoEn, ahora, i18n.language)}
                  </time>
                </Typography>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {ticket.tecnico
                    ? t('asignacion.tecnico', { nombre: ticket.tecnico.nombre })
                    : t('asignacion.sinTecnico')}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <IndicadorSla sla={ticket.sla} estado={ticket.estado} ahora={ahora} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}

        {paginas > 1 && (
          <Pagination
            count={paginas}
            page={pagina}
            onChange={(_evento, nueva) => setPagina(nueva)}
            aria-label={t('asignacion.paginacion')}
          />
        )}
      </Stack>

      <PanelAsignacion
        ticket={elegido}
        onCerrar={() => setElegido(null)}
        onTerminar={(mensaje) => {
          setElegido(null)
          setAviso(mensaje)
        }}
      />
      <Snackbar open={aviso !== null} autoHideDuration={5000} onClose={() => setAviso(null)} message={aviso} />
    </>
  )
}
