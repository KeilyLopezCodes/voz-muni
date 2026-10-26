import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { useSession } from '../../../shared/auth/session'
import { AdjuntosTicket } from '../adjuntos/AdjuntosTicket'
import { fechaGuatemala } from '../antiguedad'
import type { ComentarioCreado } from '../api/comentarios-api'
import { CLAVES_LINEA_TIEMPO } from '../api/linea-tiempo-api'
import { CLAVES_TICKETS, obtenerTicket, type TicketDetalle } from '../api/tickets-api'
import { HiloComentarios } from '../comentarios/HiloComentarios'
import { LineaTiempo } from '../linea-tiempo/LineaTiempo'
import { IndicadorSla } from '../sla/IndicadorSla'
import { COLOR_ESTADO } from './estado-chip'
import { SolucionQueja } from './SolucionQueja'

interface DetalleQuejaProps {
  ticketId: number | null // null: el id de la URL no es válido
}

// Detalle de una queja (SPEC 25): datos, lo que pidió la municipalidad, el hilo, los adjuntos y el historial (SPEC 28). El vecino responde
// con un comentario público (SPEC 23); si la queja estaba en espera, el backend la devuelve a en proceso.
export function DetalleQueja({ ticketId }: DetalleQuejaProps) {
  const { t } = useTranslation('tickets')
  const detalle = useQuery({
    queryKey: CLAVES_TICKETS.detalle(ticketId ?? 0),
    queryFn: () => obtenerTicket(ticketId!),
    enabled: ticketId !== null,
  })
  const noEncontrada = ticketId === null || (detalle.error instanceof ApiError && detalle.error.status === 404)

  return (
    <Stack spacing={2}>
      <Box>
        <Button component={Link} to="/tickets" startIcon={<ArrowBackRounded />} size="small">
          {t('detalle.volver')}
        </Button>
      </Box>
      {noEncontrada ? (
        <Alert severity="info" role="alert">
          {t('detalle.noEncontrada')}
        </Alert>
      ) : (
        <>
          {detalle.isPending && <CircularProgress aria-label={t('detalle.cargando')} />}
          {detalle.isError && (
            <Alert
              severity="error"
              role="alert"
              action={
                <Button color="inherit" size="small" onClick={() => void detalle.refetch()}>
                  {t('detalle.reintentar')}
                </Button>
              }
            >
              {t('detalle.errorCarga')}
            </Alert>
          )}
          {detalle.data && <Contenido ticket={detalle.data} />}
        </>
      )}
    </Stack>
  )
}

function Contenido({ ticket }: { ticket: TicketDetalle }) {
  const { t, i18n } = useTranslation('tickets')
  const session = useSession()
  const queryClient = useQueryClient()
  const campo = useRef<HTMLTextAreaElement>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const fecha = (iso: string) => fechaGuatemala(iso, i18n.language)

  const alComentar = (respuesta: ComentarioCreado) => {
    void queryClient.invalidateQueries({ queryKey: CLAVES_LINEA_TIEMPO.lista(ticket.id) })
    if (ticket.estado === 'en_espera' && respuesta.ticket.estado !== 'en_espera') {
      setAviso(t('detalle.respuestaEnviada'))
    }
    if (respuesta.ticket.estado !== ticket.estado) {
      void queryClient.invalidateQueries({ queryKey: CLAVES_TICKETS.listado })
      void queryClient.invalidateQueries({ queryKey: CLAVES_TICKETS.resumen }) // SPEC 38
    }
  }

  const datos: { etiqueta: string; valor: string }[] = [
    { etiqueta: t('detalle.categoria'), valor: ticket.categoria.nombre },
    { etiqueta: t('detalle.ubicacion'), valor: `${ticket.zona.nombre} · ${ticket.direccion}` },
    { etiqueta: t('detalle.dependencia'), valor: ticket.dependencia?.nombre ?? t('detalle.sinDependencia') },
    { etiqueta: t('detalle.registrada'), valor: fecha(ticket.creadoEn) },
    ...(ticket.resueltoEn ? [{ etiqueta: t('detalle.resuelta'), valor: fecha(ticket.resueltoEn) }] : []),
    ...(ticket.cerradoEn ? [{ etiqueta: t('detalle.cerrada'), valor: fecha(ticket.cerradoEn) }] : []),
  ]

  return (
    <>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="overline">{ticket.numero}</Typography>
          <Chip size="small" color={COLOR_ESTADO[ticket.estado]} label={t(`estados.${ticket.estado}`)} />
        </Stack>
        <Typography variant="h4" component="h1" sx={{ overflowWrap: 'anywhere' }}>
          {ticket.titulo}
        </Typography>
        {/* Solo para los internos: el vecino recibe sla: null (SPEC 30). */}
        <Box sx={{ mt: 1 }}>
          <IndicadorSla sla={ticket.sla ?? null} estado={ticket.estado} />
        </Box>
      </Box>

      {aviso && (
        <Alert severity="success" role="status" onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      )}

      {ticket.resolucion && (
        <SolucionQueja
          ticketId={ticket.id}
          resolucion={ticket.resolucion}
          confirmacion={ticket.confirmacion ?? null}
          esSolicitante={ticket.esSolicitante}
          onHecho={setAviso}
          cierre={
            ticket.estado === 'cerrada' && ticket.cerradoEn
              ? { automatico: ticket.cierreAutomatico, cerradoEn: ticket.cerradoEn }
              : null
          }
          encuesta={
            ticket.estado === 'cerrada'
              ? {
                  encuesta: ticket.encuesta ?? null,
                  puedeCalificar: ticket.puedeCalificar ?? false,
                  encuestaVenceEn: ticket.encuestaVenceEn ?? null,
                }
              : null
          }
        />
      )}

      {ticket.estado === 'en_espera' && ticket.informacionSolicitada && (
        <Alert
          severity="warning"
          role="status"
          sx={{ overflowWrap: 'anywhere', '& .MuiAlert-message': { whiteSpace: 'pre-line' } }}
          action={
            <Button color="inherit" size="small" onClick={() => campo.current?.focus()}>
              {t('detalle.responder')}
            </Button>
          }
        >
          {t('detalle.informacionSolicitada', { informacion: ticket.informacionSolicitada })}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" component="h2">
          {t('detalle.descripcion')}
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
          {ticket.descripcion}
        </Typography>
        <Divider sx={{ my: 1.5 }} />
        <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1 }}>
          {datos.map(({ etiqueta, valor }) => (
            <Box key={etiqueta}>
              <Typography component="dt" variant="caption" color="text.secondary">
                {etiqueta}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                {valor}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <HiloComentarios
          ticketId={ticket.id}
          estadoTicket={ticket.estado}
          clavesBandeja={CLAVES_TICKETS.detalle(ticket.id)}
          nivelTitulo="h2"
          campoRef={campo}
          onComentado={alComentar}
        />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <AdjuntosTicket
          ticketId={ticket.id}
          estadoTicket={ticket.estado}
          soloLectura={session?.rol === 'vecino'}
          nivelTitulo="h2"
        />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <LineaTiempo ticketId={ticket.id} />
      </Paper>
    </>
  )
}
