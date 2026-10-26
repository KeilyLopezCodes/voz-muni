import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded'
import ReplyRounded from '@mui/icons-material/ReplyRounded'
import StarRounded from '@mui/icons-material/StarRounded'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { fechaGuatemala } from '../antiguedad'
import {
  BUSQUEDA_MIN,
  CLAVES_TICKETS,
  type FiltrosListado,
  listarTickets,
  resumenTickets,
  TAMANO_PAGINA,
  type TicketListado,
} from '../api/tickets-api'
import { COLOR_ESTADO } from './estado-chip'
import { FiltrosMisQuejas } from './FiltrosMisQuejas'
import { contarGrupo, estadosDelGrupo, GRUPO_POR_DEFECTO, grupoDesde, type GrupoVecino, ORDEN_GRUPOS } from './grupos'

// Con menos de 2 caracteres la búsqueda no se envía (SPEC 38).
const busquedaValida = (texto: string) => {
  const recortado = texto.trim()
  return [...recortado].length >= BUSQUEDA_MIN ? recortado : null
}

const plazoVigente = (ticket: TicketListado) =>
  ticket.confirmacionVenceEn !== null && new Date(ticket.confirmacionVenceEn).getTime() > Date.now()

// "Mis quejas" del vecino (SPEC 25 y 38): grupos con contadores, búsqueda y paginación en la URL
// (?grupo=&q=&pagina=, sin escribir los valores por defecto). Lo que pide acción va primero (lo ordena el backend).
export function MisQuejas() {
  const { t, i18n } = useTranslation('tickets')
  const [parametros, setParametros] = useSearchParams()
  const grupo = grupoDesde(parametros.get('grupo'))
  const q = busquedaValida(parametros.get('q') ?? '')
  const pagina = Math.max(1, Number.parseInt(parametros.get('pagina') ?? '1', 10) || 1)

  const filtros: FiltrosListado = useMemo(() => ({ estados: estadosDelGrupo(grupo), q, pagina }), [grupo, q, pagina])
  const listado = useQuery({ queryKey: CLAVES_TICKETS.listadoCon(filtros), queryFn: () => listarTickets(filtros) })
  const resumen = useQuery({ queryKey: CLAVES_TICKETS.resumenCon(q), queryFn: () => resumenTickets(q) })
  const paginas = listado.data ? Math.ceil(listado.data.total / TAMANO_PAGINA) : 0

  // Cambiar el grupo o la búsqueda vuelve a la página 1. Los valores por defecto no se escriben.
  const navegar = useCallback(
    (cambios: { grupo?: GrupoVecino; q?: string | null; pagina?: number }, reemplazar = false) => {
      setParametros(
        (actuales) => {
          const siguientes = new URLSearchParams(actuales)
          const fijar = (clave: string, valor: string | null) =>
            valor === null ? siguientes.delete(clave) : siguientes.set(clave, valor)
          if (cambios.grupo !== undefined) fijar('grupo', cambios.grupo === GRUPO_POR_DEFECTO ? null : cambios.grupo)
          if (cambios.q !== undefined) fijar('q', cambios.q)
          const nuevaPagina = cambios.pagina ?? 1
          fijar('pagina', nuevaPagina === 1 ? null : String(nuevaPagina))
          return siguientes
        },
        { replace: reemplazar },
      )
    },
    [setParametros],
  )
  // La búsqueda reemplaza la entrada del historial: escribir no llena Atrás de pasos intermedios.
  const buscar = useCallback((texto: string) => navegar({ q: busquedaValida(texto) }, true), [navegar])

  const contadores = resumen.data
    ? (Object.fromEntries(ORDEN_GRUPOS.map((g) => [g, contarGrupo(g, resumen.data)])) as Record<GrupoVecino, number>)
    : null
  const vacio = listado.isSuccess && listado.data.total === 0
  const sinQuejas = vacio && q === null && resumen.isSuccess && resumen.data.total === 0

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('misQuejas.titulo')}
      </Typography>

      <Stack spacing={2}>
        <FiltrosMisQuejas
          grupo={grupo}
          contadores={contadores}
          q={parametros.get('q') ?? ''}
          onGrupo={(g) => navegar({ grupo: g })}
          onBuscar={buscar}
        />

        {listado.isPending && <CircularProgress aria-label={t('misQuejas.cargando')} />}
        {listado.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void listado.refetch()}>
                {t('misQuejas.reintentar')}
              </Button>
            }
          >
            {t('misQuejas.errorCarga')}
          </Alert>
        )}
        {sinQuejas && (
          <Alert severity="info">
            <Typography variant="body2" gutterBottom>
              {t('misQuejas.vacia')}
            </Typography>
            <Button component={Link} to="/tickets/nueva" variant="contained" size="small">
              {t('misQuejas.registrar')}
            </Button>
          </Alert>
        )}
        {vacio && q !== null && (
          <Alert
            severity="info"
            action={
              <Button color="inherit" size="small" onClick={() => navegar({ q: null })}>
                {t('misQuejas.busqueda.limpiar')}
              </Button>
            }
          >
            {t('misQuejas.vacioBusqueda', { q })}
          </Alert>
        )}
        {vacio && q === null && !sinQuejas && resumen.isSuccess && <Alert severity="info">{t('misQuejas.vacioGrupo')}</Alert>}

        {listado.data?.datos.map((ticket) => (
          <Card key={ticket.id} variant="outlined">
            <CardActionArea
              component={Link}
              to={`/tickets/${ticket.id}`}
              aria-label={t('misQuejas.abrir', { numero: ticket.numero })}
            >
              <CardContent>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <Typography variant="overline">{ticket.numero}</Typography>
                  <Chip size="small" color={COLOR_ESTADO[ticket.estado]} label={t(`estados.${ticket.estado}`)} />
                </Stack>
                <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                  {ticket.titulo}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <time dateTime={ticket.creadoEn}>{fechaGuatemala(ticket.creadoEn, i18n.language)}</time>
                </Typography>
                {ticket.esperaRespuesta && (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    icon={<ReplyRounded />}
                    label={t('misQuejas.necesitaRespuesta')}
                    sx={{ mt: 1 }}
                  />
                )}
                {ticket.estado === 'resuelta' && plazoVigente(ticket) && (
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    icon={<EventAvailableRounded />}
                    label={t('misQuejas.confirmaAntes', { fecha: fechaGuatemala(ticket.confirmacionVenceEn!, i18n.language) })}
                    sx={{ mt: 1, maxWidth: '100%' }}
                  />
                )}
                {ticket.pendienteCalificar && (
                  <Chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    icon={<StarRounded />}
                    label={t('misQuejas.califica')}
                    sx={{ mt: 1 }}
                  />
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        ))}

        {paginas > 1 && (
          <Pagination
            count={paginas}
            page={pagina}
            onChange={(_evento, nueva) => navegar({ pagina: nueva })}
            aria-label={t('misQuejas.paginacion')}
          />
        )}
      </Stack>
    </>
  )
}
