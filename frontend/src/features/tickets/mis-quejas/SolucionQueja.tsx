import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { fechaGuatemala } from '../antiguedad'
import { CLAVES_LINEA_TIEMPO } from '../api/linea-tiempo-api'
import {
  CLAVES_TICKETS,
  type ConfirmacionDetalle,
  confirmarSolucion,
  reabrirQueja,
  type ResolucionDetalle,
} from '../api/tickets-api'
import { DialogoConfirmar } from './DialogoConfirmar'
import { DialogoReabrir } from './DialogoReabrir'

type Accion = { accion: 'confirmar'; motivo?: string } | { accion: 'reabrir'; motivo: string }

interface SolucionQuejaProps {
  ticketId: number
  resolucion: ResolucionDetalle
  confirmacion: ConfirmacionDetalle | null // solo en resuelta (SPEC 27)
  esSolicitante: boolean
  onHecho: (mensaje: string) => void // el aviso lo muestra el detalle
  cierre?: { automatico: boolean; cerradoEn: string } | null // solo en cerrada (SPEC 33)
}

// La resolución vigente de la queja (SPEC 26), con el plazo y las acciones de confirmar o reabrir (SPEC 27). La
// descripción es texto plano: React la escapa, nunca se interpreta como HTML. Los botones salen de los permisos
// que calcula el backend.
export function SolucionQueja({
  ticketId,
  resolucion,
  confirmacion,
  esSolicitante,
  onHecho,
  cierre = null,
}: SolucionQuejaProps) {
  const { t, i18n } = useTranslation('tickets')
  const queryClient = useQueryClient()
  const idTitulo = useId()
  const [dialogo, setDialogo] = useState<'confirmar' | 'reabrir' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fecha = (iso: string) => fechaGuatemala(iso, i18n.language)

  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: CLAVES_TICKETS.detalle(ticketId) })
    void queryClient.invalidateQueries({ queryKey: CLAVES_TICKETS.listado })
    void queryClient.invalidateQueries({ queryKey: CLAVES_TICKETS.resumen }) // SPEC 38
    void queryClient.invalidateQueries({ queryKey: CLAVES_LINEA_TIEMPO.lista(ticketId) })
  }

  const accion = useMutation({
    mutationFn: (comando: Accion) =>
      comando.accion === 'confirmar' ? confirmarSolucion(ticketId, comando.motivo) : reabrirQueja(ticketId, comando.motivo),
    onMutate: () => setError(null),
    onSuccess: (_respuesta, comando) => {
      setDialogo(null)
      recargar()
      onHecho(t(comando.accion === 'confirmar' ? 'detalle.confirmacion.cerrada' : 'detalle.confirmacion.reabierta'))
    },
    onError: (fallo) => {
      // Otra persona actuó, venció el plazo o se alcanzó el límite: se recarga con lo que dice el backend.
      if (fallo instanceof ApiError && fallo.status === 409) {
        setDialogo(null)
        setError(t('detalle.confirmacion.cambio'))
        recargar()
        return
      }
      setError(t('detalle.confirmacion.error'))
    },
  })

  const limiteAlcanzado = confirmacion !== null && !confirmacion.vencida && confirmacion.reaperturasRestantes === 0

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={idTitulo}
      sx={{ p: 2, borderColor: 'success.main', overflowWrap: 'anywhere' }}
    >
      <Typography id={idTitulo} variant="subtitle1" component="h2">
        {t('detalle.solucion.titulo')}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {resolucion.descripcion}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        <time dateTime={resolucion.resueltaEn}>{t('detalle.solucion.resueltaEl', { fecha: fecha(resolucion.resueltaEn) })}</time>
        {resolucion.resueltaPor && <> {t('detalle.solucion.por', { nombre: resolucion.resueltaPor.nombre })}</>}
      </Typography>

      {/* Cómo terminó la queja (SPEC 33): por el sistema al vencer el plazo, o con la solución confirmada. */}
      {cierre && (
        <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
          {t(cierre.automatico ? 'detalle.cierre.automatica' : 'detalle.cierre.confirmada')}{' '}
          <time dateTime={cierre.cerradoEn}>{t('detalle.cierre.el', { fecha: fecha(cierre.cerradoEn) })}</time>
        </Typography>
      )}

      {error && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      {confirmacion && (
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          <Typography variant="body2">
            {confirmacion.vencida ? (
              t('detalle.confirmacion.vencido')
            ) : (
              <time dateTime={confirmacion.venceEn}>
                {t(esSolicitante ? 'detalle.confirmacion.plazoVecino' : 'detalle.confirmacion.plazoInterno', {
                  fecha: fecha(confirmacion.venceEn),
                })}
              </time>
            )}
          </Typography>
          {limiteAlcanzado && (
            <Alert
              severity="info"
              action={
                esSolicitante ? (
                  <Button component={Link} to="/tickets/nueva" color="inherit" size="small">
                    {t('detalle.confirmacion.registrarNueva')}
                  </Button>
                ) : undefined
              }
              sx={{ flexWrap: 'wrap' }}
            >
              {t('detalle.confirmacion.limite')}
            </Alert>
          )}
          {(confirmacion.puedeConfirmar || confirmacion.puedeReabrir) && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {confirmacion.puedeConfirmar && (
                <Button variant="contained" onClick={() => setDialogo('confirmar')}>
                  {t('detalle.confirmacion.confirmar')}
                </Button>
              )}
              {confirmacion.puedeReabrir && (
                <Button variant="outlined" onClick={() => setDialogo('reabrir')}>
                  {t('detalle.confirmacion.reabrir')}
                </Button>
              )}
            </Stack>
          )}
          {/* Se montan al abrir, así cada vez empiezan sin motivo. */}
          {dialogo === 'confirmar' && (
            <DialogoConfirmar
              open
              exigeMotivo={confirmacion.exigeMotivoAlConfirmar}
              enviando={accion.isPending}
              onCancelar={() => setDialogo(null)}
              onConfirmar={(motivo) => accion.mutate({ accion: 'confirmar', motivo })}
            />
          )}
          {dialogo === 'reabrir' && (
            <DialogoReabrir
              open
              reaperturasRestantes={confirmacion.reaperturasRestantes}
              enviando={accion.isPending}
              onCancelar={() => setDialogo(null)}
              onReabrir={(motivo) => accion.mutate({ accion: 'reabrir', motivo })}
            />
          )}
        </Stack>
      )}
    </Paper>
  )
}
