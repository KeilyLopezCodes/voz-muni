import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip, { type ChipProps } from '@mui/material/Chip'
import MuiLink from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { fechaGuatemala } from '../antiguedad'
import type { TicketGestion } from '../api/gestion-api'
import type { Prioridad } from '../api/triage-api'
import { COLOR_ESTADO } from '../mis-quejas/estado-chip'
import { IndicadorSla } from '../sla/IndicadorSla'

// Color de cada prioridad, como en /escaladas; la etiqueta siempre se muestra.
const COLOR_PRIORIDAD: Record<Prioridad, ChipProps['color']> = {
  urgente: 'error',
  alta: 'warning',
  media: 'info',
  baja: 'default',
}

interface TablaGestionProps {
  tickets: TicketGestion[]
}

// Las filas del listado de gestión (SPEC 45): una tabla desde md y tarjetas por debajo, con los mismos datos. Cada
// fila o tarjeta lleva al detalle /tickets/:id.
export function TablaGestion({ tickets }: TablaGestionProps) {
  const { t, i18n } = useTranslation('tickets')
  const tema = useTheme()
  const angosta = useMediaQuery(tema.breakpoints.down('md'))
  const navegar = useNavigate()
  const ahora = new Date()

  const estado = (ticket: TicketGestion) => (
    <Chip size="small" color={COLOR_ESTADO[ticket.estado]} label={t(`estados.${ticket.estado}`)} />
  )
  const prioridad = (ticket: TicketGestion) =>
    ticket.prioridad === null ? (
      <Typography variant="body2" color="text.secondary">
        {t('gestion.sinPrioridad')}
      </Typography>
    ) : (
      <Chip size="small" variant="outlined" color={COLOR_PRIORIDAD[ticket.prioridad]} label={t(`triage.prioridades.${ticket.prioridad}`)} />
    )
  const registrada = (ticket: TicketGestion) => (
    <time dateTime={ticket.creadoEn}>{fechaGuatemala(ticket.creadoEn, i18n.language)}</time>
  )
  const dependencia = (ticket: TicketGestion) => ticket.dependencia?.nombre ?? t('gestion.sinDependencia')
  const tecnico = (ticket: TicketGestion) => ticket.tecnico?.nombre ?? t('gestion.sinAsignar')

  if (angosta) {
    return (
      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {tickets.map((ticket) => (
          <Card component="li" variant="outlined" key={ticket.id}>
            <CardActionArea component={Link} to={`/tickets/${ticket.id}`} aria-label={t('gestion.abrir', { numero: ticket.numero })}>
              <CardContent>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography variant="overline">{ticket.numero}</Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                    {estado(ticket)}
                    {prioridad(ticket)}
                  </Stack>
                </Stack>
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {ticket.titulo}
                </Typography>
                <Box component="dl" sx={{ m: 0, mt: 0.5 }}>
                  {[
                    [t('gestion.columnas.dependencia'), dependencia(ticket)],
                    [t('gestion.columnas.tecnico'), tecnico(ticket)],
                    [t('gestion.columnas.registrada'), registrada(ticket)],
                  ].map(([titulo, valor]) => (
                    <Box key={String(titulo)} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Typography component="dt" variant="body2" color="text.secondary">
                        {titulo}:
                      </Typography>
                      <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                        {valor}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                <Box sx={{ mt: 1 }}>
                  <IndicadorSla sla={ticket.sla} estado={ticket.estado} ahora={ahora} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {(['numero', 'titulo', 'estado', 'prioridad', 'dependencia', 'tecnico', 'sla', 'registrada'] as const).map((columna) => (
              <TableCell key={columna}>{t(`gestion.columnas.${columna}`)}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow
              key={ticket.id}
              hover
              onClick={() => void navegar(`/tickets/${ticket.id}`)}
              sx={{ cursor: 'pointer', verticalAlign: 'top' }}
            >
              <TableCell component="th" scope="row" sx={{ whiteSpace: 'nowrap' }}>
                {/* El enlace es el acceso con teclado; el clic en la fila es un atajo con el mouse. */}
                <MuiLink
                  component={Link}
                  to={`/tickets/${ticket.id}`}
                  aria-label={t('gestion.abrir', { numero: ticket.numero })}
                  onClick={(evento) => evento.stopPropagation()}
                >
                  {ticket.numero}
                </MuiLink>
              </TableCell>
              <TableCell sx={{ overflowWrap: 'anywhere', minWidth: 160 }}>{ticket.titulo}</TableCell>
              <TableCell>{estado(ticket)}</TableCell>
              <TableCell>{prioridad(ticket)}</TableCell>
              <TableCell sx={{ minWidth: 120 }}>{dependencia(ticket)}</TableCell>
              <TableCell sx={{ minWidth: 120 }}>{tecnico(ticket)}</TableCell>
              <TableCell sx={{ minWidth: 160 }}>
                <IndicadorSla sla={ticket.sla} estado={ticket.estado} ahora={ahora} />
              </TableCell>
              <TableCell sx={{ minWidth: 110 }}>{registrada(ticket)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
