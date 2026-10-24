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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { fechaGuatemala } from '../antiguedad'
import { CLAVES_TICKETS, listarTickets, TAMANO_PAGINA } from '../api/tickets-api'
import { COLOR_ESTADO } from './estado-chip'

// "Mis quejas" del vecino (SPEC 25): las que esperan su respuesta van primero (lo ordena el backend).
export function MisQuejas() {
  const { t, i18n } = useTranslation('tickets')
  const [pagina, setPagina] = useState(1)

  const listado = useQuery({
    queryKey: [...CLAVES_TICKETS.listado, pagina],
    queryFn: () => listarTickets(pagina),
  })
  const paginas = listado.data ? Math.ceil(listado.data.total / TAMANO_PAGINA) : 0

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('misQuejas.titulo')}
      </Typography>

      <Stack spacing={2}>
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
        {listado.isSuccess && listado.data.total === 0 && (
          <Alert severity="info">
            <Typography variant="body2" gutterBottom>
              {t('misQuejas.vacia')}
            </Typography>
            <Button component={Link} to="/tickets/nueva" variant="contained" size="small">
              {t('misQuejas.registrar')}
            </Button>
          </Alert>
        )}

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
                    label={t('misQuejas.necesitaRespuesta')}
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
            onChange={(_evento, nueva) => setPagina(nueva)}
            aria-label={t('misQuejas.paginacion')}
          />
        )}
      </Stack>
    </>
  )
}
