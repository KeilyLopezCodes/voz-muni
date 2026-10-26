import StarBorderRounded from '@mui/icons-material/StarBorderRounded'
import StarRounded from '@mui/icons-material/StarRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Rating from '@mui/material/Rating'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import { fechaGuatemala } from '../antiguedad'
import {
  CALIFICACION_MAX,
  CLAVES_TICKETS,
  COMENTARIO_ENCUESTA_MAX,
  type EncuestaDetalle,
  enviarEncuesta,
} from '../api/tickets-api'

const ERRORES_CONOCIDOS = new Set(['ENCUESTA_EXISTENTE', 'ENCUESTA_VENCIDA', 'ENCUESTA_NO_DISPONIBLE'])

export interface CalificarAtencionProps {
  ticketId: number
  encuesta: EncuestaDetalle | null
  puedeCalificar: boolean
  encuestaVenceEn: string | null
  esSolicitante: boolean
}

// Encuesta de satisfacción al cerrar (RF-37, SPEC 39). El solicitante califica de 1 a 5 con un comentario opcional,
// una sola vez; después, la calificación se muestra en solo lectura, también a los internos. El comentario es texto
// plano: React lo escapa.
export function CalificarAtencion({ ticketId, encuesta, puedeCalificar, encuestaVenceEn, esSolicitante }: CalificarAtencionProps) {
  const { t, i18n } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const idTitulo = useId()
  const [calificacion, setCalificacion] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [gracias, setGracias] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: CLAVES_TICKETS.detalle(ticketId) })
    void queryClient.invalidateQueries({ queryKey: CLAVES_TICKETS.listado })
    void queryClient.invalidateQueries({ queryKey: CLAVES_TICKETS.resumen })
  }

  const envio = useMutation({
    mutationFn: () => enviarEncuesta(ticketId, calificacion!, comentario.trim() === '' ? undefined : comentario.trim()),
    onMutate: () => setError(null),
    onSuccess: () => {
      setGracias(true)
      recargar()
    },
    onError: (fallo) => {
      const codigo = fallo instanceof ApiError ? fallo.codigo : ''
      setError(ERRORES_CONOCIDOS.has(codigo) ? codigo : 'GENERICO')
      // La queja cambió (ya calificada, vencida o reabierta): se recarga con lo que dice el backend.
      if (fallo instanceof ApiError && fallo.status === 409) {
        recargar()
      }
    },
  })

  if (!encuesta && !puedeCalificar && !error) {
    return null
  }

  return (
    <Box component="section" aria-labelledby={idTitulo} sx={{ mt: 2, overflowWrap: 'anywhere' }}>
      <Typography id={idTitulo} variant="subtitle1" component="h3">
        {t('detalle.encuesta.titulo')}
      </Typography>
      <Box aria-live="polite">
        {gracias && (
          <Alert severity="success" sx={{ my: 1 }}>
            {t('detalle.encuesta.gracias')}
          </Alert>
        )}
        {error && (
          <Alert severity="warning" role="alert" sx={{ my: 1 }}>
            {t(`detalle.encuesta.errores.${error}`)}
          </Alert>
        )}
      </Box>

      {encuesta ? (
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Rating value={encuesta.calificacion} max={CALIFICACION_MAX} readOnly icon={<StarRounded />} emptyIcon={<StarBorderRounded />} />
            <Typography variant="body2">
              {t(esSolicitante ? 'detalle.encuesta.tuCalificacion' : 'detalle.encuesta.delVecino', {
                calificacion: encuesta.calificacion,
                max: CALIFICACION_MAX,
              })}
            </Typography>
          </Stack>
          {encuesta.comentario && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {encuesta.comentario}
            </Typography>
          )}
        </Stack>
      ) : (
        puedeCalificar && (
          <Stack
            component="form"
            spacing={1.5}
            noValidate
            onSubmit={(evento) => {
              evento.preventDefault()
              if (calificacion !== null) envio.mutate()
            }}
          >
            {encuestaVenceEn && (
              <Typography variant="body2" color="text.secondary">
                <time dateTime={encuestaVenceEn}>
                  {t('detalle.encuesta.plazo', { fecha: fechaGuatemala(encuestaVenceEn, i18n.language) })}
                </time>
              </Typography>
            )}
            {/* Rating es un grupo de radio: se maneja con las flechas y cada estrella dice "n de 5". */}
            <Rating
              name={`calificacion-${ticketId}`}
              value={calificacion}
              max={CALIFICACION_MAX}
              onChange={(_evento, valor) => setCalificacion(valor)}
              getLabelText={(valor) => t('detalle.encuesta.estrella', { calificacion: valor, max: CALIFICACION_MAX })}
              icon={<StarRounded fontSize="large" />}
              emptyIcon={<StarBorderRounded fontSize="large" />}
            />
            <TextField
              label={t('detalle.encuesta.comentario')}
              value={comentario}
              onChange={(evento) => setComentario(evento.target.value)}
              multiline
              minRows={2}
              fullWidth
              helperText={t('detalle.encuesta.contador', { cantidad: comentario.length, max: COMENTARIO_ENCUESTA_MAX })}
              slotProps={{ htmlInput: { maxLength: COMENTARIO_ENCUESTA_MAX } }}
            />
            <Button type="submit" variant="contained" disabled={calificacion === null || envio.isPending} sx={{ alignSelf: 'flex-start' }}>
              {t('detalle.encuesta.enviar')}
            </Button>
          </Stack>
        )
      )}
    </Box>
  )
}
