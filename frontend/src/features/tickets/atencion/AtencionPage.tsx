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
import { antiguedad, fechaGuatemala } from '../antiguedad'
import {
  CLAVES_ATENCION,
  ESTADOS_ATENCION,
  type FiltroAtencion,
  listarAtencion,
  TAMANO_PAGINA,
  type TicketAtencion,
} from '../api/atencion-api'
import type { Prioridad } from '../api/triage-api'
import { IndicadorSla } from '../sla/IndicadorSla'
import { PanelAtencion } from './PanelAtencion'

const FILTROS: readonly FiltroAtencion[] = ['todas', ...ESTADOS_ATENCION]

// Mismo color de prioridad que /asignacion (SPEC 20); la etiqueta sale de las traducciones de SPEC 19.
const COLOR_PRIORIDAD: Record<Prioridad, ChipProps['color']> = {
  urgente: 'error',
  alta: 'warning',
  media: 'info',
  baja: 'default',
}

// Bandeja de atención (SPEC 22): el técnico ve sus asignadas, el coordinador su dependencia y el supervisor todas.
export function AtencionPage() {
  const { t, i18n } = useTranslation('tickets')
  const session = useSession()
  const [filtro, setFiltro] = useState<FiltroAtencion>('todas')
  const [pagina, setPagina] = useState(1)
  const [elegido, setElegido] = useState<TicketAtencion | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const bandeja = useQuery({
    queryKey: [...CLAVES_ATENCION.bandeja, filtro, pagina],
    queryFn: () => listarAtencion(filtro, pagina),
  })
  const ahora = new Date()
  const paginas = bandeja.data ? Math.ceil(bandeja.data.total / TAMANO_PAGINA) : 0
  // El técnico solo ve sus propias quejas: mostrarle el técnico no aporta.
  const verTecnico = session?.rol !== 'tecnico'

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('atencion.titulo')}
      </Typography>

      <Stack spacing={2}>
        <ToggleButtonGroup
          value={filtro}
          exclusive
          size="small"
          aria-label={t('atencion.filtro.etiqueta')}
          onChange={(_evento, valor: FiltroAtencion | null) => {
            if (valor) {
              setFiltro(valor)
              setPagina(1)
            }
          }}
          sx={{ flexWrap: 'wrap' }}
        >
          {FILTROS.map((opcion) => (
            <ToggleButton key={opcion} value={opcion}>
              {t(`atencion.filtro.${opcion}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {bandeja.isPending && <CircularProgress aria-label={t('atencion.cargando')} />}
        {bandeja.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void bandeja.refetch()}>
                {t('atencion.reintentar')}
              </Button>
            }
          >
            {t('atencion.errorCarga')}
          </Alert>
        )}
        {bandeja.isSuccess && bandeja.data.datos.length === 0 && <Alert severity="info">{t('atencion.vacia')}</Alert>}

        {bandeja.data?.datos.map((ticket) => (
          <Card key={ticket.id} variant="outlined">
            <CardActionArea onClick={() => setElegido(ticket)} aria-label={t('atencion.abrir', { numero: ticket.numero })}>
              <CardContent>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <Typography variant="overline">{ticket.numero}</Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Chip size="small" variant="outlined" label={t(`atencion.estados.${ticket.estado}`)} />
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
                  {ticket.categoria.nombre} · {ticket.zona.nombre} ·{' '}
                  <time dateTime={ticket.creadoEn} title={fechaGuatemala(ticket.creadoEn, i18n.language)}>
                    {antiguedad(ticket.creadoEn, ahora, i18n.language)}
                  </time>
                </Typography>
                {verTecnico && (
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {ticket.tecnico ? t('atencion.tecnico', { nombre: ticket.tecnico.nombre }) : t('atencion.sinTecnico')}
                  </Typography>
                )}
                <Box sx={{ mt: 1 }}>
                  <IndicadorSla sla={ticket.sla} estado={ticket.estado} ahora={ahora} />
                </Box>
                {ticket.trasladoPendiente && (
                  <Chip size="small" color="warning" variant="outlined" label={t('atencion.trasladoPendiente')} sx={{ mt: 1 }} />
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        ))}

        {paginas > 1 && (
          <Pagination
            count={paginas}
            page={pagina}
            onChange={(_evento, nueva) => setPagina(nueva)}
            aria-label={t('atencion.paginacion')}
          />
        )}
      </Stack>

      <PanelAtencion
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
