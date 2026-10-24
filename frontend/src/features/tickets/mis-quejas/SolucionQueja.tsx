import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { fechaGuatemala } from '../antiguedad'
import type { ResolucionDetalle } from '../api/tickets-api'

interface SolucionQuejaProps {
  resolucion: ResolucionDetalle
  pendienteDeConfirmar: boolean // el solicitante, con la queja en resuelta: RF-24 traerá confirmar o reabrir
}

// La resolución vigente de la queja (SPEC 26). La descripción es texto plano: React la escapa, nunca se interpreta
// como HTML.
export function SolucionQueja({ resolucion, pendienteDeConfirmar }: SolucionQuejaProps) {
  const { t, i18n } = useTranslation('tickets')
  const idTitulo = useId()
  const fecha = fechaGuatemala(resolucion.resueltaEn, i18n.language)

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
        <time dateTime={resolucion.resueltaEn}>{t('detalle.solucion.resueltaEl', { fecha })}</time>
        {resolucion.resueltaPor && <> {t('detalle.solucion.por', { nombre: resolucion.resueltaPor.nombre })}</>}
      </Typography>
      {pendienteDeConfirmar && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {t('detalle.solucion.pendienteConfirmar')}
        </Typography>
      )}
    </Paper>
  )
}
