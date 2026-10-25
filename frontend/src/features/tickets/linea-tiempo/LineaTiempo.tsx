import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { CLAVES_LINEA_TIEMPO, listarLineaTiempo } from '../api/linea-tiempo-api'
import { EventoLineaTiempo } from './EventoLineaTiempo'

interface LineaTiempoProps {
  ticketId: number
  nivelTitulo?: 'h2' | 'h3'
}

// Sección "Historial" del detalle (RF-25, SPEC 28), de lo más reciente a lo más antiguo. Los comentarios y los
// adjuntos solo dicen quién y cuándo, con un enlace al hilo y a la lista: el contenido no se copia aquí.
export function LineaTiempo({ ticketId, nivelTitulo = 'h2' }: LineaTiempoProps) {
  const { t } = useTranslation('tickets')
  const idTitulo = useId()
  const linea = useInfiniteQuery({
    queryKey: CLAVES_LINEA_TIEMPO.lista(ticketId),
    queryFn: ({ pageParam }) => listarLineaTiempo(ticketId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.siguienteCursor,
  })
  const eventos = linea.data?.pages.flatMap((pagina) => pagina.datos) ?? []

  return (
    <Stack spacing={1} component="section" aria-labelledby={idTitulo} sx={{ minWidth: 0 }}>
      <Typography id={idTitulo} variant="subtitle1" component={nivelTitulo}>
        {t('lineaTiempo.titulo')}
      </Typography>
      {linea.isPending && (
        <Box role="status" aria-label={t('lineaTiempo.cargando')}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="text" height={40} />
          ))}
        </Box>
      )}
      {linea.isError && !linea.data && (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={() => void linea.refetch()}>
              {t('lineaTiempo.reintentar')}
            </Button>
          }
        >
          {t('lineaTiempo.errorCarga')}
        </Alert>
      )}
      {linea.isSuccess && eventos.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('lineaTiempo.vacio')}
        </Typography>
      )}
      {eventos.length > 0 && (
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
          {eventos.map((evento) => (
            <EventoLineaTiempo key={evento.id} evento={evento} />
          ))}
        </Box>
      )}
      {linea.isFetchNextPageError && (
        <Alert severity="error">{t('lineaTiempo.errorCarga')}</Alert>
      )}
      {linea.hasNextPage && (
        <Box>
          <Button size="small" disabled={linea.isFetchingNextPage} onClick={() => void linea.fetchNextPage()}>
            {linea.isFetchingNextPage ? t('lineaTiempo.cargandoAnteriores') : t('lineaTiempo.verAnteriores')}
          </Button>
        </Box>
      )}
    </Stack>
  )
}
