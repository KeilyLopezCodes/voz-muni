import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import Chip, { type ChipProps } from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { fechaGuatemala } from '../antiguedad'
import { CLAVES_ESCALADAS, listarEscaladas, TAMANO_PAGINA_ESCALADAS } from '../api/escaladas-api'
import { CLAVES_TRASLADOS, listarDependencias } from '../api/traslados-api'
import type { Prioridad } from '../api/triage-api'
import { IndicadorSla } from '../sla/IndicadorSla'

// Color de cada prioridad; la etiqueta sale de las traducciones de SPEC 19.
const COLOR_PRIORIDAD: Record<Prioridad, ChipProps['color']> = {
  urgente: 'error',
  alta: 'warning',
  media: 'info',
  baja: 'default',
}

const TODAS = 'todas'

// Bandeja de escalamientos del supervisor (RF-29, SPEC 32): las quejas activas con un plazo vencido, de la escalada
// más antigua a la más reciente. Se atienden con las acciones que ya existen, desde el detalle o las otras bandejas.
export function EscaladasPage() {
  const { t, i18n } = useTranslation('tickets')
  const [dependencia, setDependencia] = useState<number | null>(null)
  const [pagina, setPagina] = useState(1)
  const dependencias = useQuery({ queryKey: CLAVES_TRASLADOS.dependencias, queryFn: listarDependencias })
  const bandeja = useQuery({
    queryKey: [...CLAVES_ESCALADAS.bandeja, dependencia, pagina],
    queryFn: () => listarEscaladas(dependencia, pagina),
  })
  const ahora = new Date()
  const paginas = bandeja.data ? Math.ceil(bandeja.data.total / TAMANO_PAGINA_ESCALADAS) : 0

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('escaladas.titulo')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('escaladas.descripcion')}
      </Typography>

      <Stack spacing={2}>
        <TextField
          select
          size="small"
          label={t('escaladas.filtro')}
          value={dependencia === null ? TODAS : String(dependencia)}
          onChange={(evento) => {
            setDependencia(evento.target.value === TODAS ? null : Number(evento.target.value))
            setPagina(1)
          }}
          sx={{ maxWidth: 360 }}
        >
          <MenuItem value={TODAS}>{t('escaladas.todas')}</MenuItem>
          {(dependencias.data ?? []).map((d) => (
            <MenuItem key={d.id} value={String(d.id)}>
              {d.nombre}
            </MenuItem>
          ))}
        </TextField>

        {bandeja.isPending && <CircularProgress aria-label={t('escaladas.cargando')} />}
        {bandeja.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void bandeja.refetch()}>
                {t('escaladas.reintentar')}
              </Button>
            }
          >
            {t('escaladas.errorCarga')}
          </Alert>
        )}
        {bandeja.isSuccess && bandeja.data.datos.length === 0 && (
          <Typography color="text.secondary">{t('escaladas.vacia')}</Typography>
        )}

        {bandeja.data?.datos.map((ticket) => (
          <Card key={ticket.id} variant="outlined" component="article" aria-label={ticket.numero}>
            <CardContent>
              <Stack
                direction="row"
                spacing={1}
                sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
              >
                <Typography variant="overline">{ticket.numero}</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Chip size="small" variant="outlined" label={t(`estados.${ticket.estado}`)} />
                  <Chip size="small" color={COLOR_PRIORIDAD[ticket.prioridad]} label={t(`triage.prioridades.${ticket.prioridad}`)} />
                </Stack>
              </Stack>
              <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                {ticket.titulo}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {ticket.categoria.nombre} · {ticket.dependencia?.nombre ?? t('escaladas.sinDependencia')}
              </Typography>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {ticket.tecnico ? t('escaladas.tecnico', { nombre: ticket.tecnico.nombre }) : t('escaladas.sinTecnico')}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
                <time dateTime={ticket.escaladoEn}>
                  {t('escaladas.escaladaPor', {
                    plazo: t(`plazos.${ticket.escaladoPor}`),
                    fecha: fechaGuatemala(ticket.escaladoEn, i18n.language),
                  })}
                </time>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <IndicadorSla sla={ticket.sla} estado={ticket.estado} ahora={ahora} />
              </Box>
            </CardContent>
            <CardActions>
              <Button
                component={Link}
                to={`/tickets/${ticket.id}`}
                size="small"
                aria-label={t('escaladas.verDetalleDe', { numero: ticket.numero })}
              >
                {t('escaladas.verDetalle')}
              </Button>
            </CardActions>
          </Card>
        ))}

        {paginas > 1 && (
          <Pagination
            count={paginas}
            page={pagina}
            onChange={(_evento, valor) => setPagina(valor)}
            aria-label={t('escaladas.paginacion')}
            sx={{ alignSelf: 'center' }}
          />
        )}
      </Stack>
    </>
  )
}
