import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { antiguedad, fechaGuatemala } from '../antiguedad'
import type { TicketListado } from '../api/tickets-api'
import { COLOR_ESTADO } from '../mis-quejas/estado-chip'
import { IndicadorSla } from '../sla/IndicadorSla'

interface TarjetaQuejaProps {
  ticket: TicketListado
  ahora: Date
}

// Una queja del listado interno por debajo de md (SPEC 45): la tarjeta entera abre /tickets/:id.
export function TarjetaQueja({ ticket, ahora }: TarjetaQuejaProps) {
  const { t, i18n } = useTranslation(['tickets', 'comun'])
  const { interno } = ticket
  const datos = [
    interno?.categoria.nombre,
    interno?.dependencia?.nombre ?? t('tickets:listadoInterno.sinDependencia'),
    interno?.tecnico?.nombre ?? t('tickets:listadoInterno.sinTecnico'),
  ]

  return (
    <Card variant="outlined">
      <CardActionArea
        component={Link}
        to={`/tickets/${ticket.id}`}
        aria-label={t('tickets:listadoInterno.abrir', { numero: ticket.numero })}
      >
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="overline">{ticket.numero}</Typography>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              <Chip size="small" color={COLOR_ESTADO[ticket.estado]} label={t(`tickets:estados.${ticket.estado}`)} />
              <Chip
                size="small"
                variant="outlined"
                label={interno?.prioridad ? t(`comun:prioridades.${interno.prioridad}`) : t('tickets:listadoInterno.sinPrioridad')}
              />
            </Stack>
          </Stack>
          <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
            {ticket.titulo}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {datos.filter(Boolean).join(' · ')} ·{' '}
            <time dateTime={ticket.creadoEn} title={fechaGuatemala(ticket.creadoEn, i18n.language)}>
              {antiguedad(ticket.creadoEn, ahora, i18n.language)}
            </time>
          </Typography>
          {interno && (
            <Stack sx={{ mt: 1 }}>
              <IndicadorSla sla={interno.sla} estado={ticket.estado} ahora={ahora} />
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
