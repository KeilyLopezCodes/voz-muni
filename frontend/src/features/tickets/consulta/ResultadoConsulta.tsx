import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import { fechaGuatemala } from '../antiguedad'
import type { ConsultaPublica } from '../api/consulta-publica-api'
import { COLOR_ESTADO } from '../mis-quejas/estado-chip'

// Qué invita a hacer el botón al portal: responder, confirmar o reabrir, o solo ver la queja.
function accionDelPortal(consulta: ConsultaPublica): 'responder' | 'confirmar' | 'ver' {
  if (consulta.esperaRespuesta) return 'responder'
  if (consulta.confirmacion && !consulta.confirmacion.vencida) return 'confirmar'
  return 'ver'
}

// El resultado de la consulta pública (SPEC 37). Todo es texto plano: React lo escapa, nada se interpreta como HTML.
// Las fechas se muestran en America/Guatemala.
export function ResultadoConsulta({ consulta }: { consulta: ConsultaPublica }) {
  const { t, i18n } = useTranslation('tickets')
  const fecha = (iso: string) => fechaGuatemala(iso, i18n.language)
  const idTitulo = useId()
  const idHistorial = useId()
  const idComentarios = useId()

  return (
    <Stack component="article" aria-labelledby={idTitulo} spacing={2} sx={{ overflowWrap: 'anywhere' }}>
      <Box>
        <Typography variant="caption" color="text.secondary" component="p">
          {consulta.numero}
        </Typography>
        <Typography id={idTitulo} variant="h6" component="h3">
          {consulta.titulo}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
          <Chip size="small" color={COLOR_ESTADO[consulta.estado]} label={t(`estados.${consulta.estado}`)} />
          <Chip size="small" variant="outlined" label={consulta.categoria} />
          <Chip size="small" variant="outlined" label={consulta.zona} />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          <time dateTime={consulta.creadoEn}>{t('consulta.registrada', { fecha: fecha(consulta.creadoEn) })}</time>
          {consulta.cerradoEn && (
            <>
              {' · '}
              <time dateTime={consulta.cerradoEn}>{t('consulta.cerradaEl', { fecha: fecha(consulta.cerradoEn) })}</time>
            </>
          )}
        </Typography>
      </Box>

      {consulta.esperaRespuesta && (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t('consulta.esperaRespuesta')}
        </Typography>
      )}

      {consulta.solucion && (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'success.main' }}>
          <Typography variant="subtitle1" component="h4">
            {t('detalle.solucion.titulo')}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {consulta.solucion.descripcion}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            <time dateTime={consulta.solucion.resueltaEn}>
              {t('detalle.solucion.resueltaEl', { fecha: fecha(consulta.solucion.resueltaEn) })}
            </time>
          </Typography>
          {consulta.confirmacion && (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              {consulta.confirmacion.vencida ? (
                t('consulta.plazoVencido')
              ) : (
                <time dateTime={consulta.confirmacion.venceEn}>
                  {t('consulta.plazo', { fecha: fecha(consulta.confirmacion.venceEn) })}
                </time>
              )}
            </Typography>
          )}
          {consulta.cierreAutomatico && (
            <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
              {t('consulta.cierreAutomatico')}
            </Typography>
          )}
        </Paper>
      )}

      <Button component={RouterLink} to="/login" state={{ desde: '/tickets' }} variant="contained" sx={{ alignSelf: 'flex-start' }}>
        {t(`consulta.portal.${accionDelPortal(consulta)}`)}
      </Button>

      <Divider />
      <Box component="section" aria-labelledby={idHistorial}>
        <Typography id={idHistorial} variant="subtitle1" component="h4" sx={{ mb: 1 }}>
          {t('consulta.historial')}
        </Typography>
        <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {consulta.lineaTiempo.map((evento, i) => (
            <Box component="li" key={`${evento.ocurridoEn}-${i}`}>
              <Typography variant="body2">
                {evento.estadoAnterior === null
                  ? t('consulta.evento.registro', { actor: t(`consulta.actores.${evento.actor}`) })
                  : t('consulta.evento.cambio', {
                      actor: t(`consulta.actores.${evento.actor}`),
                      estado: t(`estados.${evento.estadoNuevo}`),
                    })}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="p">
                <time dateTime={evento.ocurridoEn}>{fecha(evento.ocurridoEn)}</time>
              </Typography>
              {evento.motivo && (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                  {evento.motivo}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </Box>

      <Divider />
      <Box component="section" aria-labelledby={idComentarios}>
        <Typography id={idComentarios} variant="subtitle1" component="h4" sx={{ mb: 1 }}>
          {t('consulta.comentarios')}
        </Typography>
        {consulta.comentarios.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('consulta.sinComentarios')}
          </Typography>
        ) : (
          <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {consulta.comentarios.map((comentario, i) => (
              <Paper component="li" variant="outlined" key={`${comentario.creadoEn}-${i}`} sx={{ p: 1.5 }}>
                <Typography variant="caption" color="text.secondary" component="p">
                  {t(`consulta.actores.${comentario.autor}`)} ·{' '}
                  <time dateTime={comentario.creadoEn}>{fecha(comentario.creadoEn)}</time>
                  {comentario.editadoEn && <> · {t('consulta.editado')}</>}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {comentario.cuerpo}
                </Typography>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  )
}
