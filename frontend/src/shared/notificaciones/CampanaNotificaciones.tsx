import NotificationsRounded from '@mui/icons-material/NotificationsRounded'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  CLAVES_NOTIFICACIONES,
  INTERVALO_NOTIFICACIONES_MS,
  listarNotificaciones,
  marcarNotificacion,
  marcarTodasLeidas,
  type Notificacion,
} from './notificaciones-api'

const ZONA_HORARIA = 'America/Guatemala'
const TIPOS_CONOCIDOS = [
  'sla_alerta_respuesta',
  'sla_alerta_resolucion',
  'sla_escalamiento',
  // Avisos a los internos (SPEC 36).
  'asignacion_recibida',
  'asignacion_retirada',
  'comentario_nuevo',
  'respuesta_vecino',
  'queja_reabierta',
  'traslado_solicitado',
  'traslado_resuelto',
  'encuesta_baja', // SPEC 39
]
const RESULTADOS_TRASLADO = ['aprobada', 'rechazada', 'sin_efecto']

type T = (clave: string, opciones?: Record<string, unknown>) => string

// El texto sale de los archivos de traducción, con el número de la queja, el umbral y la fecha en Guatemala.
export function textoNotificacion(notificacion: Notificacion, t: T, idioma: string): string {
  if (!TIPOS_CONOCIDOS.includes(notificacion.tipo)) {
    return t('notificaciones.tipos.desconocido')
  }
  const numero = notificacion.ticket?.numero ?? ''
  const { datos } = notificacion
  // comentario_nuevo se agrupa por queja (SPEC 36): singular o plural, y la marca de notas internas.
  if (notificacion.tipo === 'comentario_nuevo') {
    const count = typeof datos.cantidad === 'number' ? datos.cantidad : 1
    const texto = t('notificaciones.tipos.comentario_nuevo', { count, numero })
    return datos.incluyeInternas === true ? `${texto} ${t('notificaciones.incluyeInternas')}` : texto
  }
  if (notificacion.tipo === 'traslado_resuelto') {
    const resultado = typeof datos.resultado === 'string' && RESULTADOS_TRASLADO.includes(datos.resultado) ? datos.resultado : null
    return resultado ? t(`notificaciones.tipos.traslado_resuelto.${resultado}`, { numero }) : t('notificaciones.tipos.desconocido')
  }
  const vence = typeof datos.vence === 'string' ? datos.vence : null
  const fecha = vence
    ? new Intl.DateTimeFormat(idioma, { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA_HORARIA }).format(new Date(vence))
    : ''
  return t(`notificaciones.tipos.${notificacion.tipo}`, {
    numero,
    umbral: datos.umbral,
    // sla_escalamiento (SPEC 32): qué plazo venció.
    plazo: typeof datos.plazo === 'string' ? t(`notificaciones.plazos.${datos.plazo}`) : '',
    // encuesta_baja (SPEC 39): la calificación que dejó el vecino.
    calificacion: datos.calificacion,
    fecha,
  })
}

// Campana de la barra (RF-32, SPEC 31): el contador de no leídas y las 20 más recientes. Vive en shared/ porque la
// usa AppLayout y la consumirán varias features; no importa nada de features/.
export function CampanaNotificaciones() {
  const { t, i18n } = useTranslation('comun')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const lista = useQuery({
    queryKey: CLAVES_NOTIFICACIONES.lista,
    queryFn: listarNotificaciones,
    refetchInterval: INTERVALO_NOTIFICACIONES_MS,
    refetchOnWindowFocus: true,
  })
  const recargar = () => void queryClient.invalidateQueries({ queryKey: CLAVES_NOTIFICACIONES.lista })
  const marcar = useMutation({ mutationFn: marcarNotificacion, onSettled: recargar })
  const marcarTodas = useMutation({ mutationFn: marcarTodasLeidas, onSettled: recargar })

  const noLeidas = lista.data?.noLeidas ?? 0
  const notificaciones = lista.data?.datos ?? []
  const cerrar = () => setAncla(null)

  const abrir = (notificacion: Notificacion) => {
    cerrar()
    if (!notificacion.leida) {
      marcar.mutate(notificacion.id)
    }
    if (notificacion.ticket) {
      void navigate(`/tickets/${notificacion.ticket.id}`)
    }
  }

  return (
    <>
      <IconButton
        aria-label={t('notificaciones.abrir', { count: noLeidas })}
        aria-haspopup="menu"
        aria-expanded={ancla ? 'true' : undefined}
        onClick={(evento) => setAncla(evento.currentTarget)}
        sx={{ mr: 1 }}
      >
        <Badge badgeContent={noLeidas} color="secondary" max={99}>
          <NotificationsRounded />
        </Badge>
      </IconButton>
      <Menu
        anchorEl={ancla}
        open={ancla !== null}
        onClose={cerrar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 32px)', mt: 1 } } }}
      >
        {/* Encabezado informativo: no es un ítem del menú. */}
        <Box
          sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}
        >
          <Typography variant="subtitle1" component="h2">
            {t('notificaciones.titulo')}
          </Typography>
          {noLeidas > 0 && (
            <Button size="small" onClick={() => marcarTodas.mutate()} disabled={marcarTodas.isPending}>
              {t('notificaciones.marcarTodas')}
            </Button>
          )}
        </Box>
        <Divider />
        {lista.isError && notificaciones.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
            {t('notificaciones.errorCarga')}
          </Typography>
        )}
        {lista.isSuccess && notificaciones.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
            {t('notificaciones.vacio')}
          </Typography>
        )}
        {notificaciones.map((notificacion) => (
          <MenuItem
            key={notificacion.id}
            onClick={() => abrir(notificacion)}
            sx={{ whiteSpace: 'normal', alignItems: 'flex-start', gap: 1, py: 1.25 }}
          >
            <Typography
              variant="body2"
              sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontWeight: notificacion.leida ? 400 : 700 }}
            >
              {textoNotificacion(notificacion, t, i18n.language)}
            </Typography>
            {/* La marca es un texto visible, no solo la negrita (WCAG). */}
            {!notificacion.leida && <Chip size="small" color="primary" label={t('notificaciones.nueva')} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
