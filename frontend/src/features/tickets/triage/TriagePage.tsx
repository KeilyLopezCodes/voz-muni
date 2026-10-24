import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
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
import {
  CLAVES_TRIAGE,
  type FiltroTriage,
  listarTriage,
  TAMANO_PAGINA,
  type TicketTriage,
} from '../api/triage-api'
import { PanelTriage } from './PanelTriage'

const FILTROS: readonly FiltroTriage[] = ['nueva', 'en_revision', 'todas']

const ZONA_HORARIA = 'America/Guatemala'

// "hace 3 h": el texto lo arma Intl en el idioma activo, no va fijo en el componente.
function antiguedad(creadoEn: string, ahora: Date, idioma: string): string {
  const minutos = Math.max(0, Math.round((ahora.getTime() - new Date(creadoEn).getTime()) / 60_000))
  const formato = new Intl.RelativeTimeFormat(idioma, { numeric: 'always', style: 'short' })
  if (minutos < 60) return formato.format(-minutos, 'minute')
  if (minutos < 24 * 60) return formato.format(-Math.floor(minutos / 60), 'hour')
  return formato.format(-Math.floor(minutos / (24 * 60)), 'day')
}

// Fecha completa en la hora de Guatemala, como título de la antigüedad.
function fechaGuatemala(creadoEn: string, idioma: string): string {
  return new Intl.DateTimeFormat(idioma, { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA_HORARIA }).format(
    new Date(creadoEn),
  )
}

// Bandeja del supervisor (SPEC 19): las quejas nuevas y en revisión, la más antigua primero.
export function TriagePage() {
  const { t, i18n } = useTranslation('tickets')
  const [filtro, setFiltro] = useState<FiltroTriage>('todas')
  const [pagina, setPagina] = useState(1)
  const [elegido, setElegido] = useState<TicketTriage | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const bandeja = useQuery({
    queryKey: [...CLAVES_TRIAGE.bandeja, filtro, pagina],
    queryFn: () => listarTriage(filtro, pagina),
  })
  const ahora = new Date()
  const paginas = bandeja.data ? Math.ceil(bandeja.data.total / TAMANO_PAGINA) : 0

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('triage.titulo')}
      </Typography>

      <Stack spacing={2}>
        <ToggleButtonGroup
          value={filtro}
          exclusive
          size="small"
          aria-label={t('triage.filtro.etiqueta')}
          onChange={(_evento, valor: FiltroTriage | null) => {
            if (valor) {
              setFiltro(valor)
              setPagina(1)
            }
          }}
          sx={{ flexWrap: 'wrap' }}
        >
          {FILTROS.map((opcion) => (
            <ToggleButton key={opcion} value={opcion}>
              {t(`triage.filtro.${opcion}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {bandeja.isPending && <CircularProgress aria-label={t('triage.cargando')} />}
        {bandeja.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void bandeja.refetch()}>
                {t('triage.reintentar')}
              </Button>
            }
          >
            {t('triage.errorCarga')}
          </Alert>
        )}
        {bandeja.isSuccess && bandeja.data.datos.length === 0 && <Alert severity="info">{t('triage.vacia')}</Alert>}

        {bandeja.data?.datos.map((ticket) => (
          <Card key={ticket.id} variant="outlined">
            <CardActionArea onClick={() => setElegido(ticket)} aria-label={t('triage.abrir', { numero: ticket.numero })}>
              <CardContent>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="overline">{ticket.numero}</Typography>
                  <Chip size="small" label={t(`triage.estados.${ticket.estado}`)} />
                </Stack>
                <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                  {ticket.titulo}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {ticket.categoria.nombre} · {ticket.zona.nombre} · {t(`triage.canales.${ticket.canal}`)} ·{' '}
                  <time dateTime={ticket.creadoEn} title={fechaGuatemala(ticket.creadoEn, i18n.language)}>
                    {antiguedad(ticket.creadoEn, ahora, i18n.language)}
                  </time>
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}

        {paginas > 1 && (
          <Pagination
            count={paginas}
            page={pagina}
            onChange={(_evento, nueva) => setPagina(nueva)}
            aria-label={t('triage.paginacion')}
          />
        )}
      </Stack>

      <PanelTriage
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
