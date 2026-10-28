import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import { antiguedad, fechaGuatemala } from '../antiguedad'
import type { TicketListado } from '../api/tickets-api'
import { COLOR_ESTADO } from '../mis-quejas/estado-chip'
import { IndicadorSla } from '../sla/IndicadorSla'

interface TablaQuejasProps {
  tickets: readonly TicketListado[]
  ahora: Date
}

// Oculto a la vista pero leído por los lectores de pantalla.
const OCULTO_VISUALMENTE = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

const COLUMNAS = ['numero', 'titulo', 'estado', 'prioridad', 'categoria', 'dependencia', 'tecnico', 'registro', 'sla'] as const

// El listado interno desde md (SPEC 45). El número enlaza a /tickets/:id. La tabla tiene un caption oculto y
// encabezados con scope="col"; el estado y la marca "Escalada" llevan texto, no solo color.
export function TablaQuejas({ tickets, ahora }: TablaQuejasProps) {
  const { t, i18n } = useTranslation(['tickets', 'comun'])

  return (
    <TableContainer>
      <Table size="small">
        <caption style={OCULTO_VISUALMENTE}>{t('tickets:listadoInterno.tabla.caption')}</caption>
        <TableHead>
          <TableRow>
            {COLUMNAS.map((columna) => (
              <TableCell key={columna} component="th" scope="col">
                {t(`tickets:listadoInterno.tabla.${columna}`)}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((ticket) => {
            const { interno } = ticket
            return (
              <TableRow key={ticket.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Link component={RouterLink} to={`/tickets/${ticket.id}`} aria-label={t('tickets:listadoInterno.abrir', { numero: ticket.numero })}>
                    {ticket.numero}
                  </Link>
                </TableCell>
                <TableCell sx={{ overflowWrap: 'anywhere', minWidth: 160 }}>{ticket.titulo}</TableCell>
                <TableCell>
                  <Chip size="small" color={COLOR_ESTADO[ticket.estado]} label={t(`tickets:estados.${ticket.estado}`)} />
                </TableCell>
                <TableCell>
                  {interno?.prioridad ? t(`comun:prioridades.${interno.prioridad}`) : t('tickets:listadoInterno.sinPrioridad')}
                </TableCell>
                <TableCell>{interno?.categoria.nombre}</TableCell>
                <TableCell>{interno?.dependencia?.nombre ?? t('tickets:listadoInterno.sinDependencia')}</TableCell>
                <TableCell>{interno?.tecnico?.nombre ?? t('tickets:listadoInterno.sinTecnico')}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <time dateTime={ticket.creadoEn}>{fechaGuatemala(ticket.creadoEn, i18n.language)}</time>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {antiguedad(ticket.creadoEn, ahora, i18n.language)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ minWidth: 180 }}>
                  {interno && <IndicadorSla sla={interno.sla} estado={ticket.estado} ahora={ahora} />}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
